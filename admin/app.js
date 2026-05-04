const apiBase = "https://diversao554.pythonanywhere.com";
let token = localStorage.getItem("ets2_admin_token");
let socket = null;
let pollingTimer = null;
let freights = [];
let users = [];
let currentUser = null;

const $ = (id) => document.getElementById(id);

function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  setTimeout(() => $("toast").classList.remove("show"), 2500);
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "Erro na requisicao.");
  return data;
}

function setLoggedIn(value) {
  $("loginView").classList.toggle("hidden", value);
  $("appView").classList.toggle("hidden", !value);
  $("logoutBtn").classList.toggle("hidden", !value);
  $("driverPreviewLink").classList.toggle("hidden", !value);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function playLoginAnimation() {
  $("loginOverlay").classList.remove("hidden");
  $("loginOverlay").classList.remove("leaving");
  await sleep(900);
  setLoggedIn(true);
  $("loginOverlay").classList.add("leaving");
  await sleep(260);
  $("loginOverlay").classList.add("hidden");
  $("appView").classList.remove("dashboard-enter");
  void $("appView").offsetWidth;
  $("appView").classList.add("dashboard-enter");
}

function renderUsers() {
  const visibleUsers = users.filter((user) => user.username !== "admin");
  const drivers = visibleUsers.filter((user) => user.role === "user");
  $("userId").innerHTML = drivers.length
    ? drivers.map((user) => `<option value="${user.id}">${user.name} (${user.username})</option>`).join("")
    : `<option value="">Crie um motorista primeiro</option>`;

  $("users").innerHTML = visibleUsers.map((user) => `
    <article class="item">
      <div class="row">
        <div class="identity">
          <span class="avatar">${initials(user.name)}</span>
          <strong>${user.name}</strong>
        </div>
        <span class="status">${user.role === "admin" ? "admin" : "motorista"}</span>
      </div>
      <div class="meta">@${user.username}<br>Saldo: R$ ${user.balance} ${user.companyName ? `| ${user.companyName}` : ""}</div>
      <div class="actions">
        <button class="small secondary" data-edit-user="${user.id}">Editar</button>
        ${user.role === "user" ? `<button class="small ${user.truckLocked ? "secondary" : "warning"}" data-lock-user="${user.id}">${user.truckLocked ? "Desbloquear" : "Bloquear caminhao"}</button>` : ""}
        <button class="small danger" data-delete-user="${user.id}" ${currentUser?.id === user.id ? "disabled" : ""}>Excluir</button>
      </div>
    </article>
  `).join("");

  $("statUsers").textContent = drivers.length;

  document.querySelectorAll("[data-edit-user]").forEach((button) => {
    button.addEventListener("click", () => openEditUser(Number(button.getAttribute("data-edit-user"))));
  });

  document.querySelectorAll("[data-delete-user]").forEach((button) => {
    button.addEventListener("click", () => deleteUser(Number(button.getAttribute("data-delete-user"))));
  });

  document.querySelectorAll("[data-lock-user]").forEach((button) => {
    button.addEventListener("click", () => toggleTruckLock(Number(button.getAttribute("data-lock-user"))));
  });
}

function initials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("") || "U";
}

function renderFreights() {
  $("freightCount").textContent = `${freights.length} registro${freights.length === 1 ? "" : "s"}`;
  $("statActive").textContent = freights.filter((freight) => freight.status === "ativo").length;
  $("statDelivered").textContent = freights.filter((freight) => freight.status === "entregue").length;
  $("statFailed").textContent = freights.filter((freight) => freight.status === "falha").length;

  $("freights").innerHTML = freights.map((freight) => `
    <article class="item freight-card">
      <div class="row">
        <strong>#${freight.id} ${freight.origin} -> ${freight.destination}</strong>
        <span class="status ${freight.status}">${freight.status}</span>
      </div>
      <div class="meta">
        ${freight.cargo} | R$ ${freight.value}<br>
        Motorista: ${freight.userName} (@${freight.username || freight.userEmail})<br>
        ${freight.failureReason ? `Motivo: ${freight.failureReason}<br>` : ""}
        Criado em: ${new Date(freight.createdAt).toLocaleString()}
      </div>
      ${["criado", "ativo"].includes(freight.status) ? `<button class="danger small" data-cancel="${freight.id}">Cancelar</button>` : ""}
    </article>
  `).join("");

  document.querySelectorAll("[data-cancel]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-cancel");
      const data = await request(`/api/admin/freights/${id}/cancel`, { method: "POST" });
      upsertFreight(data.freight);
      toast("Frete cancelado.");
    });
  });
}

async function renderLogs() {
  const data = await request("/api/admin/logs?limit=40");
  $("logs").innerHTML = data.logs.map((log) => `
    <article class="item">
      <strong>${log.type}</strong>
      <div class="meta">${log.message}<br>${new Date(log.created_at).toLocaleString()}</div>
    </article>
  `).join("");
}

function openEditUser(userId) {
  const user = users.find((item) => item.id === userId);
  if (!user) return;
  $("editUserId").value = user.id;
  $("editName").value = user.name;
  $("editUsername").value = user.username;
  $("editPassword").value = "";
  $("editCompany").value = user.companyName || "";
  $("editBalance").value = user.balance || 0;
  $("editRole").value = user.role;
  $("editModal").classList.remove("hidden");
}

function closeEditUser() {
  $("editModal").classList.add("hidden");
  $("editUserForm").reset();
}

async function deleteUser(userId) {
  const user = users.find((item) => item.id === userId);
  if (!user) return;
  const ok = window.confirm(`Excluir ${user.name}? Isso tambem remove fretes, notas e telemetria desse usuario.`);
  if (!ok) return;

  try {
    await request(`/api/admin/users/${userId}`, { method: "DELETE" });
    users = users.filter((item) => item.id !== userId);
    freights = freights.filter((freight) => freight.userId !== userId);
    renderUsers();
    renderFreights();
    toast("Usuario excluido.");
    renderLogs().catch(() => {});
  } catch (error) {
    toast(error.message);
  }
}

async function toggleTruckLock(userId) {
  const user = users.find((item) => item.id === userId);
  if (!user) return;
  const locked = !user.truckLocked;
  try {
    const data = await request(`/api/admin/users/${userId}/truck-lock`, {
      method: "POST",
      body: JSON.stringify({ locked })
    });
    users = users.map((item) => item.id === userId ? data.user : item);
    renderUsers();
    toast(locked ? "Caminhao bloqueado." : "Caminhao desbloqueado.");
    renderLogs().catch(() => {});
  } catch (error) {
    toast(error.message);
  }
}

function upsertFreight(freight) {
  const index = freights.findIndex((item) => item.id === freight.id);
  if (index >= 0) freights[index] = freight;
  else freights.unshift(freight);
  renderFreights();
}

async function loadData() {
  const [usersData, freightsData] = await Promise.all([
    request("/api/admin/users"),
    request("/api/admin/freights")
  ]);
  users = usersData.users;
  freights = freightsData.freights;
  renderUsers();
  renderFreights();
  await renderLogs();
}

function connectSocket() {
  if (socket) socket.disconnect();
  clearInterval(pollingTimer);
  socket = io(apiBase, {
    query: { token: token },
    transports: ['polling']
  });
  socket.on('connect', () => {
    $("connection").textContent = "online";
    $("connection").classList.add("online");
  });
  socket.on('disconnect', () => {
    $("connection").textContent = "offline";
    $("connection").classList.remove("online");
    pollingTimer = setInterval(() => loadData().catch(() => {}), 5000);
  });
  
  socket.on('freight:new', (data) => upsertFreight(data));
  socket.on('freight:update', (data) => upsertFreight(data));
  socket.on('truck:lock', (data) => {
    users = users.map((u) => u.id === data.userId ? { ...u, truckLocked: data.locked } : u);
    renderUsers();
  });
  socket.on('telemetry:update', (data) => {
    if (data.flags?.length) toast(data.flags[0].message);
  });
}

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = await fetch(`${apiBase}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: $("username").value, password: $("password").value })
    }).then((response) => response.json().then((body) => ({ ok: response.ok, body })));
    if (!data.ok) throw new Error(data.body.error?.message || "Falha no login.");
    if (data.body.user.role !== "admin") throw new Error("Este painel exige usuario admin.");
    token = data.body.token;
    currentUser = data.body.user;
    localStorage.setItem("ets2_admin_token", token);
    connectSocket();
    await loadData();
    await playLoginAnimation();
  } catch (error) {
    $("loginOverlay").classList.add("hidden");
    toast(error.message);
  }
});

$("freightForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    if (!$("userId").value) throw new Error("Crie um motorista antes de enviar fretes.");
    const payload = {
      userId: Number($("userId").value),
      origin: $("origin").value,
      destination: $("destination").value,
      cargo: $("cargo").value,
      value: Number($("value").value),
      destinationLat: $("destinationLat").value,
      destinationLng: $("destinationLng").value
    };
    const data = await request("/api/admin/freights", { method: "POST", body: JSON.stringify(payload) });
    upsertFreight(data.freight);
    $("freightForm").reset();
    toast("Frete enviado ao motorista.");
  } catch (error) {
    toast(error.message);
  }
});

$("userForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = {
      name: $("newName").value,
      username: $("newUsername").value,
      password: $("newPassword").value,
      companyName: $("newCompany").value,
      balance: Number($("newBalance").value || 0),
      role: $("newRole").value
    };
    const data = await request("/api/admin/users", { method: "POST", body: JSON.stringify(payload) });
    users.push(data.user);
    renderUsers();
    $("userForm").reset();
    $("newBalance").value = 0;
    toast("Usuario criado. Ele ja pode entrar no .exe.");
    renderLogs().catch(() => {});
  } catch (error) {
    toast(error.message);
  }
});

$("editUserForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const userId = Number($("editUserId").value);
    const payload = {
      name: $("editName").value,
      username: $("editUsername").value,
      password: $("editPassword").value,
      companyName: $("editCompany").value,
      balance: Number($("editBalance").value || 0),
      role: $("editRole").value
    };
    const data = await request(`/api/admin/users/${userId}`, { method: "PUT", body: JSON.stringify(payload) });
    users = users.map((user) => user.id === userId ? data.user : user);
    if (currentUser?.id === userId) currentUser = data.user;
    renderUsers();
    closeEditUser();
    toast("Usuario atualizado.");
    renderLogs().catch(() => {});
  } catch (error) {
    toast(error.message);
  }
});

$("closeEditModal").addEventListener("click", closeEditUser);
$("editModal").addEventListener("click", (event) => {
  if (event.target === $("editModal")) closeEditUser();
});

$("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("ets2_admin_token");
  token = null;
  currentUser = null;
  clearInterval(pollingTimer);
  if (socket) socket.disconnect();
  setLoggedIn(false);
});

if (token) {
  setLoggedIn(true);
  connectSocket();
  request("/api/auth/me")
    .then((data) => {
      currentUser = data.user;
      return loadData();
    })
    .catch((error) => {
    toast(error.message);
    setLoggedIn(false);
  });
}
