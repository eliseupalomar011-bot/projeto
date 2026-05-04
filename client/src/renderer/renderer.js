let token = null;
let user = null;
let apiBase = "http://localhost:5000";
let socket = null;
let freights = [];
let telemetryTimer = null;
let pollingTimer = null;

const $ = (id) => document.getElementById(id);

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  setTimeout(() => $("toast").classList.remove("show"), 2500);
}

function setView(name) {
  $("loginView").classList.toggle("hidden", name !== "login");
  $("appView").classList.toggle("hidden", name !== "app");
  $("logoutBtn").classList.toggle("hidden", name !== "app");
}

function headers() {
  return { Authorization: `Bearer ${token}` };
}

async function api(path, options = {}) {
  const response = await window.ets2Http.request({
    baseURL: apiBase,
    url: path,
    ...options,
    headers: { ...headers(), ...(options.headers || {}) }
  });
  return response.data;
}

function renderProfile() {
  $("profile").innerHTML = `
    <strong>${user.name}</strong>
    <span>@${user.username || user.email || "usuario"}</span>
    <span>Saldo: R$ ${user.balance}</span>
  `;
}

function upsertFreight(freight) {
  const index = freights.findIndex((item) => item.id === freight.id);
  if (index >= 0) freights[index] = freight;
  else freights.unshift(freight);
  renderFreights();
}

function renderFreights() {
  if (!freights.length) {
    $("freights").innerHTML = `<div class="meta">Nenhum frete disponivel.</div>`;
    return;
  }

  $("freights").innerHTML = freights.map((freight) => `
    <article class="freight">
      <div class="row">
        <strong>#${freight.id} ${freight.origin} -> ${freight.destination}</strong>
        <span class="status ${freight.status}">${freight.status}</span>
      </div>
      <div class="meta">
        Carga: ${freight.cargo}<br>
        Pagamento: R$ ${freight.value}<br>
        ${freight.failureReason ? `Falha: ${freight.failureReason}<br>` : ""}
        Criado em: ${new Date(freight.createdAt).toLocaleString()}
      </div>
      ${freight.status === "criado" ? `<button data-accept="${freight.id}">Aceitar frete</button>` : ""}
    </article>
  `).join("");

  document.querySelectorAll("[data-accept]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const data = await api(`/api/freights/${button.getAttribute("data-accept")}/accept`, { method: "POST" });
        upsertFreight(data.freight);
        toast("Frete aceito.");
      } catch (error) {
        toast(error.message);
      }
    });
  });
}

async function loadFreights() {
  const data = await api("/api/freights");
  freights = data.freights;
  renderFreights();
}

function connectSocket() {
  if (socket) socket.disconnect();
  clearInterval(pollingTimer);
  socket = io(apiBase, {
    query: { token: token },
    transports: ['polling']
  });
  socket.on('connect', () => $("serverState").textContent = "online");
  socket.on('disconnect', () => {
    $("serverState").textContent = "offline";
    pollingTimer = setInterval(() => loadFreights().catch(() => {}), 5000);
  });
  socket.on('freight:new', (data) => {
    upsertFreight(data);
    toast("Novo frete recebido.");
  });
  socket.on('freight:update', (data) => {
    upsertFreight(data);
    if (data.status === "entregue") {
      user.balance += data.value;
      renderProfile();
      toast("Frete entregue e saldo atualizado.");
    }
    if (data.status === "falha") toast(`Frete falhou: ${data.failureReason}`);
  });
  socket.on('truck:lock', (data) => {
    toast(data.locked ? "Caminhao bloqueado pelo admin." : "Caminhao liberado pelo admin.");
    window.ets2TruckLock.set(data.locked);
  });
}

async function sendTelemetryLoop() {
  clearInterval(telemetryTimer);
  telemetryTimer = setInterval(async () => {
    try {
      const telemetry = await window.ets2Http.request({
        method: "GET",
        url: "http://localhost:25555/api/ets2",
        timeout: 700
      });
      $("telemetryState").textContent = "ativa";
      const result = await api("/api/telemetry", { method: "POST", data: telemetry.data });
      const normalized = result.normalized || {};
      $("speed").textContent = normalized.speedKmh == null ? "-- km/h" : `${Math.round(normalized.speedKmh)} km/h`;
      $("distance").textContent = normalized.distanceMeters == null ? "-- m" : `${Math.round(normalized.distanceMeters)} m`;
      $("trailer").textContent = normalized.trailerAttached == null ? "--" : normalized.trailerAttached ? "conectado" : "desconectado";
      if (result.freightUpdate) upsertFreight(result.freightUpdate);
    } catch (error) {
      $("telemetryState").textContent = "sem ETS2";
    }
  }, 1000);
}

async function enterApp(data) {
  token = data.token;
  user = data.user;
  apiBase = $("serverUrl").value.replace(/\/$/, "");
  await window.ets2Store.set("token", token);
  await window.ets2Store.set("user", user);
  await window.ets2Store.set("apiBase", apiBase);
  setView("app");
    renderProfile();
    connectSocket();
    await loadFreights();
    await sendTelemetryLoop();
    await window.ets2TruckLock.set(Boolean(user.truckLocked));
    await window.ets2Overlay.show();
}

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    apiBase = $("serverUrl").value.replace(/\/$/, "");
    const response = await window.ets2Http.request({
      method: "POST",
      url: `${apiBase}/api/auth/login`,
      data: {
        username: $("username").value,
        password: $("password").value
      }
    });
    await enterApp(response.data);
  } catch (error) {
    toast(error.message);
  }
});

$("logoutBtn").addEventListener("click", async () => {
  clearInterval(telemetryTimer);
  clearInterval(pollingTimer);
  if (socket) socket.disconnect();
  await window.ets2Store.delete("token");
  await window.ets2Store.delete("user");
  await window.ets2Overlay.hide();
  await window.ets2TruckLock.set(false);
  token = null;
  user = null;
  freights = [];
  setView("login");
});

(async function boot() {
  const storedApiBase = await window.ets2Store.get("apiBase");
  if (storedApiBase) $("serverUrl").value = storedApiBase;
  token = await window.ets2Store.get("token");
  user = await window.ets2Store.get("user");
  apiBase = storedApiBase || apiBase;
  if (!token || !user) return;
  try {
    setView("app");
    renderProfile();
    connectSocket();
    await loadFreights();
    await sendTelemetryLoop();
    await window.ets2TruckLock.set(Boolean(user.truckLocked));
  } catch (error) {
    toast("Sessao expirada. Entre novamente.");
    setView("login");
  }
})();
