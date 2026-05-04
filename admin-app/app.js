const { ipcRenderer } = require("electron");

const apiBase = "https://diversao554.pythonanywhere.com";
let token = null;
let socket = null;
let currentUser = null;

const $ = (id) => document.getElementById(id);

function toast(message) {
  const t = $("toast");
  if (!t) return;
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

function showView(viewId) {
  document.querySelectorAll(".view-content").forEach(s => s.classList.add("hidden"));
  const target = $(`view-${viewId}`);
  if (target) {
    target.classList.remove("hidden");
    const anims = target.querySelectorAll(".animate-slide-up");
    anims.forEach((el, i) => el.style.setProperty("--delay", `${i * 0.1}s`));
  }
  
  document.querySelectorAll(".nav-item").forEach(n => {
    n.classList.toggle("active", n.getAttribute("data-view") === viewId);
  });

  $("viewTitle").textContent = viewId === "dashboard" ? "Dashboard" : 
                               viewId === "drivers" ? "Motoristas" :
                               viewId === "freights" ? "Gestão de Fretes" : "Logs de Atividade";
  
  if (viewId === "dashboard") loadDashboard();
  if (viewId === "drivers") loadDrivers();
  if (viewId === "freights") loadFreights();
  if (viewId === "logs") loadLogs();
}

// --- DASHBOARD LOAD ---
async function loadDashboard() {
  try {
    const [stats, logsData] = await Promise.all([
      request("/api/admin/stats"),
      request("/api/admin/logs?limit=5")
    ]);
    
    $("statDrivers").textContent = stats.total_users;
    $("statActive").textContent = stats.active_freights;
    $("statDelivered").textContent = stats.total_freights;
    $("statFailed").textContent = "0";

    // Populate Activity Feed
    const feed = $("recentActivity");
    if (logsData.logs && logsData.logs.length > 0) {
        feed.innerHTML = logsData.logs.map(log => {
            const icon = log.type === 'SECURITY' ? '🛡️' : log.type === 'FREIGHT' ? '📦' : '📝';
            return `
                <div class="activity-item">
                    <div class="activity-icon">${icon}</div>
                    <div class="activity-details">
                        <strong>${log.type}</strong>
                        <p>${log.message}</p>
                    </div>
                    <div class="activity-time">${new Date(log.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                </div>
            `;
        }).join("");
    } else {
        feed.innerHTML = `<div class="empty-state"><p>Nenhuma atividade recente.</p></div>`;
    }

  } catch (err) {
    toast(err.message);
  }
}

// --- AUTH ---
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector("button");
  btn.textContent = "AUTENTICANDO...";
  btn.disabled = true;

  try {
    const data = await request("/api/auth/login", {
      method: "POST",
      data: { username: $("username").value, password: $("password").value }
    });

    if (data.user.role !== "admin") throw new Error("Acesso restrito a administradores.");

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
  } catch (err) {
    $("loginError").textContent = err.message;
    $("loginError").classList.remove("hidden");
    btn.textContent = "ACESSAR PAINEL";
    btn.disabled = false;
  }
});

$("logoutBtn").onclick = async () => {
  await ipcRenderer.invoke("store:delete", "admin_token");
  location.reload();
};

// --- DRIVERS ---
async function loadDrivers() {
  try {
    const data = await request("/api/admin/users");
    const drivers = data.users.filter(u => u.role === "user");
    
    $("driversList").innerHTML = drivers.map(u => `
      <tr>
        <td>
          <div class="user-profile" style="margin-bottom: 0">
            <div class="avatar-glow" style="width: 35px; height: 35px; font-size: 0.9rem">${u.name.charAt(0).toUpperCase()}</div>
            <strong>${u.name}</strong>
          </div>
        </td>
        <td>@${u.username}</td>
        <td>R$ ${u.balance || 0}</td>
        <td><span class="badge ${u.truck_locked ? 'bloqueado' : 'operante'}">${u.truck_locked ? 'Bloqueado' : 'Operante'}</span></td>
        <td>
          <button class="btn-action" onclick="toggleLock(${u.id}, ${!u.truck_locked})">
            ${u.truck_locked ? '🔓 Liberar' : '🔒 Bloquear'}
          </button>
        </td>
      </tr>
    `).join("");
  } catch (err) { toast(err.message); }
}

// --- FREIGHTS ---
async function loadFreights() {
  try {
    const [freightsData, usersData] = await Promise.all([
      request("/api/admin/freights"),
      request("/api/admin/users")
    ]);
    
    const drivers = usersData.users.filter(u => u.role === "user");
    $("targetUserId").innerHTML = `<option value="">Escolher motorista...</option>` + 
      drivers.map(d => `<option value="${d.id}">${d.name}</option>`).join("");

    $("freightsList").innerHTML = freightsData.freights.map(f => `
      <tr>
        <td>#${f.id}</td>
        <td>${f.origin} ➔ ${f.destination}</td>
        <td>${f.cargo}</td>
        <td><span class="badge ${f.status}">${f.status}</span></td>
        <td>
          ${f.status === 'criado' ? `<button class="btn-cancel" onclick="cancelFreight(${f.id})">Cancelar</button>` : '-'}
        </td>
      </tr>
    `).join("");
  } catch (err) { toast(err.message); }
}

// --- LOGS ---
async function loadLogs() {
  try {
    const data = await request("/api/admin/logs?limit=50");
    $("logsList").innerHTML = data.logs.map(log => `
      <div class="log-item">
        <div class="log-meta">
          <span class="log-type ${log.type}">${log.type}</span>
          <span class="log-time">${new Date(log.created_at).toLocaleString()}</span>
        </div>
        <div class="log-msg">${log.message}</div>
      </div>
    `).join("");
  } catch (err) { toast(err.message); }
}

// --- ACTIONS ---
window.toggleLock = async (userId, locked) => {
  try {
    await request(`/api/admin/users/${userId}/truck-lock`, { method: "POST", data: { locked } });
    toast(locked ? "Caminhão Bloqueado" : "Caminhão Liberado");
    loadDrivers();
  } catch (err) { toast(err.message); }
};

window.cancelFreight = async (id) => {
  if (!confirm("Cancelar frete?")) return;
  try {
    await request(`/api/admin/freights/${id}/cancel`, { method: "POST" });
    toast("Frete Cancelado");
    loadFreights();
  } catch (err) { toast(err.message); }
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
    toast("Frete Despachado!");
    $("freightForm").reset();
    loadFreights();
  } catch (err) { toast(err.message); }
});

function connectSocket() {
  socket = io(apiBase, { query: { token }, transports: ["polling"] });
  socket.on("connect", () => document.querySelector(".status-dot").classList.add("online"));
}

// INITIALIZATION
document.querySelectorAll(".nav-item").forEach(btn => {
  btn.onclick = () => showView(btn.getAttribute("data-view"));
});

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
    } catch (e) { await ipcRenderer.invoke("store:delete", "admin_token"); }
  }
})();
