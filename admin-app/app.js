const { ipcRenderer } = require("electron");

const apiBase = "https://diversao554.pythonanywhere.com";
let token = null;
let socket = null;
let currentUser = null;
let drivers = [];
let freights = [];

// DOM ELEMENTS
const $ = (id) => document.getElementById(id);

// --- UTILS ---
function toast(message) {
  const t = $("toast");
  t.textContent = message;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 3000);
}

async function request(path, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await ipcRenderer.invoke("http:request", {
    url: `${apiBase}${path}`,
    method: options.method || "GET",
    data: options.data,
    headers
  });

  if (!res.success) throw new Error(res.error || "Erro na requisição");
  return res.data;
}

// --- VIEW NAVIGATION ---
function showView(viewId) {
  document.querySelectorAll("section").forEach(s => s.classList.add("hidden"));
  $(`view-${viewId}`).classList.remove("hidden");
  
  document.querySelectorAll(".nav-item").forEach(n => {
    n.classList.toggle("active", n.getAttribute("data-view") === viewId);
  });

  $("viewTitle").textContent = viewId.charAt(0).toUpperCase() + viewId.slice(1);
  
  if (viewId === "dashboard") loadDashboard();
  if (viewId === "drivers") loadDrivers();
  if (viewId === "freights") loadFreights();
  if (viewId === "logs") loadLogs();
}

// --- AUTH ---
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = $("username").value;
  const password = $("password").value;

  try {
    const data = await request("/api/auth/login", {
      method: "POST",
      data: { username, password }
    });

    if (data.user.role !== "admin") {
      throw new Error("Acesso negado: Este painel é para administradores.");
    }

    token = data.token;
    currentUser = data.user;
    
    await ipcRenderer.invoke("store:set", "admin_token", token);
    
    $("adminName").textContent = currentUser.name;
    $("adminUsername").textContent = `@${currentUser.username}`;
    $("userAvatar").textContent = currentUser.name.charAt(0).toUpperCase();

    $("loginView").classList.add("hidden");
    $("appView").classList.remove("hidden");
    
    connectSocket();
    showView("dashboard");
    toast("Bem-vindo ao Fleet Manager Pro");
  } catch (err) {
    $("loginError").textContent = err.message;
    $("loginError").classList.remove("hidden");
  }
});

$("logoutBtn").onclick = async () => {
  token = null;
  await ipcRenderer.invoke("store:delete", "admin_token");
  if (socket) socket.disconnect();
  location.reload();
};

// --- DATA LOADING ---
async function loadDashboard() {
  try {
    const [usersData, freightsData] = await Promise.all([
      request("/api/admin/users"),
      request("/api/admin/freights")
    ]);
    
    drivers = usersData.users.filter(u => u.role === "user");
    freights = freightsData.freights;

    $("statDrivers").textContent = drivers.length;
    $("statActive").textContent = freights.filter(f => f.status === "ativo").length;
    $("statDelivered").textContent = freights.filter(f => f.status === "entregue").length;
    $("statFailed").textContent = freights.filter(f => f.status === "falha").length;
  } catch (err) {
    toast(err.message);
  }
}

async function loadDrivers() {
  try {
    const data = await request("/api/admin/users");
    drivers = data.users.filter(u => u.role === "user");
    
    $("driversList").innerHTML = drivers.map(u => `
      <tr>
        <td>
          <div class="driver-info">
            <div class="avatar-small">${u.name.charAt(0).toUpperCase()}</div>
            <strong>${u.name}</strong>
          </div>
        </td>
        <td>@${u.username}</td>
        <td>R$ ${u.balance}</td>
        <td>
          <span class="badge ${u.truckLocked ? 'locked' : 'active'}">
            ${u.truckLocked ? 'Bloqueado' : 'Liberado'}
          </span>
        </td>
        <td>
          <button class="btn-secondary small" onclick="toggleLock(${u.id}, ${!u.truck_locked})">
            ${u.truck_locked ? 'Desbloquear' : 'Bloquear'}
          </button>
        </td>
      </tr>
    `).join("");
  } catch (err) {
    toast(err.message);
  }
}

async function loadFreights() {
  try {
    const data = await request("/api/admin/freights");
    freights = data.freights;
    
    // Update driver select
    const usersData = await request("/api/admin/users");
    const activeDrivers = usersData.users.filter(u => u.role === "user");
    
    $("targetUserId").innerHTML = `<option value="">Selecionar Motorista...</option>` + 
      activeDrivers.map(d => `<option value="${d.id}">${d.name}</option>`).join("");

    $("freightsList").innerHTML = freights.map(f => `
      <tr>
        <td>#${f.id}</td>
        <td>${f.origin} ➔ ${f.destination}</td>
        <td>${f.cargo}</td>
        <td>${f.userName}</td>
        <td><span class="badge ${f.status}">${f.status}</span></td>
        <td>
          ${f.status === 'ativo' ? `<button class="btn-secondary danger-text" onclick="cancelFreight(${f.id})">Cancelar</button>` : '-'}
        </td>
      </tr>
    `).join("");
  } catch (err) {
    toast(err.message);
  }
}

async function loadLogs() {
  try {
    const data = await request("/api/admin/logs?limit=50");
    $("logsList").innerHTML = data.logs.map(log => `
      <div class="log-item">
        <div class="log-meta">
          <span class="log-type">${log.type}</span>
          <span class="log-time">${new Date(log.created_at).toLocaleString()}</span>
        </div>
        <div class="log-msg">${log.message}</div>
      </div>
    `).join("");
  } catch (err) {
    toast(err.message);
  }
}

// --- ACTIONS ---
window.toggleLock = async (userId, locked) => {
  try {
    await request(`/api/admin/users/${userId}/truck-lock`, {
      method: "POST",
      data: { locked }
    });
    toast(locked ? "Caminhão bloqueado" : "Caminhão liberado");
    loadDrivers();
  } catch (err) {
    toast(err.message);
  }
};

window.cancelFreight = async (id) => {
  if (!confirm("Cancelar este frete?")) return;
  try {
    await request(`/api/admin/freights/${id}/cancel`, { method: "POST" });
    toast("Frete cancelado");
    loadFreights();
  } catch (err) {
    toast(err.message);
  }
};

$("freightForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = {
    userId: Number($("targetUserId").value),
    origin: $("origin").value,
    destination: $("destination").value,
    cargo: $("cargo").value,
    value: Number($("value").value)
  };

  try {
    await request("/api/admin/freights", { method: "POST", data });
    toast("Frete enviado com sucesso!");
    $("freightForm").reset();
    loadFreights();
  } catch (err) {
    toast(err.message);
  }
});

// --- SOCKET ---
function connectSocket() {
  socket = io(apiBase, {
    query: { token },
    transports: ["polling"]
  });

  socket.on("connect", () => {
    console.log("[SOCKET] Conectado");
    document.querySelector(".status-dot").classList.add("online");
  });

  socket.on("disconnect", () => {
    document.querySelector(".status-dot").classList.remove("online");
  });

  socket.on("freight:update", () => {
    if (!$("view-freights").classList.contains("hidden")) loadFreights();
    if (!$("view-dashboard").classList.contains("hidden")) loadDashboard();
  });
}

// INITIALIZATION
document.querySelectorAll(".nav-item").forEach(btn => {
  btn.onclick = () => showView(btn.getAttribute("data-view"));
});

$("refreshBtn").onclick = () => {
  const activeView = document.querySelector(".nav-item.active").getAttribute("data-view");
  showView(activeView);
};

// Check for existing session
(async () => {
  const savedToken = await ipcRenderer.invoke("store:get", "admin_token");
  if (savedToken) {
    token = savedToken;
    try {
      const data = await request("/api/auth/me");
      currentUser = data.user;
      
      $("adminName").textContent = currentUser.name;
      $("adminUsername").textContent = `@${currentUser.username}`;
      $("userAvatar").textContent = currentUser.name.charAt(0).toUpperCase();
      
      $("loginView").classList.add("hidden");
      $("appView").classList.remove("hidden");
      
      connectSocket();
      showView("dashboard");
    } catch (e) {
      await ipcRenderer.invoke("store:delete", "admin_token");
    }
  }
})();
