const $ = (id) => document.getElementById(id);

console.log("iPadOS OS 8.0 - Cloud Edition 1.1.0");

let token = null;
let apiBase = "https://diversao554.pythonanywhere.com";
let freights = [];
let activeFreight = null;
let notifications = [];
let unlocked = false;
let currentScreen = "lockScreen";
let localFiles = [];
let currentIndex = -1;
let socket = null;
let installedApps = ["freights", "music", "settings", "browser", "appstore", "dash"];
let dashTimer = null;

// --- API ENGINE ---
async function api(path, options = {}) {
  const url = `${apiBase}${path}`;
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  try {
    const res = await window.ets2.request({ url, method: options.method || "GET", data: options.data, headers });
    const result = res.data !== undefined ? res.data : res;
    return result;
  } catch (err) {
    return null;
  }
}

// --- REAL-TIME DLL CONNECT ---
function connectSocket() {
  if (socket) socket.disconnect();
  socket = io(apiBase, { query: { token }, transports: ['polling'] });
  
  socket.on('truck:lock', async (data) => {
    showNotification("SEGURANÇA", data.locked ? "CAMINHÃO BLOQUEADO PELO ADMIN" : "CAMINHÃO LIBERADO");
    await window.ets2.setTruckLock(data.locked);
  });
  
  socket.on('freight:new', (f) => {
    showNotification("NOVA CARGA", `${f.cargo} disponível.`);
    refreshFreights();
  });

  socket.on('freight:update', () => {
    refreshFreights();
  });
}

// --- AUTH ---
async function tryStoredSession() {
  const storedToken = await window.ets2.storeGet("tablet_token");
  const storedUser = await window.ets2.storeGet("tablet_username");
  
  if (storedToken) {
    token = storedToken;
    // Validação real com o servidor na nuvem
    const res = await api("/api/auth/me");
    if (res && res.user) {
      console.log(`Sessão confirmada na nuvem para: ${storedUser}`);
      connectSocket();
      refreshFreights();
      return true;
    } else {
      console.log("Sessão antiga ou inválida detectada. Limpando tudo...");
      token = null;
      await window.ets2.storeSet("tablet_token", null);
      await window.ets2.storeSet("tablet_username", null);
      return false;
    }
  }
  return false;
}

// --- BROWSER ---
let browserTabs = [];
let activeTabId = null;

function createTab(url = "https://www.google.com") {
  const id = "tab_" + Date.now();
  const tab = { id, url, title: "Google" };
  browserTabs.push(tab);
  const wv = document.createElement("webview");
  wv.id = "wv_" + id; wv.src = url; wv.style.width = wv.style.height = "100%"; wv.className = "chrome-webview";
  wv.addEventListener("did-finish-load", () => {
    tab.title = wv.getTitle() || "Novo Guia"; tab.url = wv.getURL();
    if (activeTabId === id) $("browserUrl").value = tab.url;
    renderTabs();
  });
  $("browserWebviewsContainer").appendChild(wv);
  switchTab(id);
}

function switchTab(id) {
  activeTabId = id;
  document.querySelectorAll(".chrome-webview").forEach(wv => {
    const isCurrent = wv.id === "wv_" + id;
    wv.style.display = isCurrent ? "flex" : "none";
    wv.classList.toggle("active", isCurrent);
  });
  const tab = browserTabs.find(t => t.id === id);
  if (tab) $("browserUrl").value = tab.url;
  renderTabs();
}

function closeTab(id, e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  const index = browserTabs.findIndex(t => t.id === id);
  if (index === -1) return;
  const wv = $("wv_" + id); if (wv) wv.remove();
  browserTabs.splice(index, 1);
  if (browserTabs.length === 0) {
    activeTabId = null; showScreen("homeScreen");
    $("browserWebviewsContainer").innerHTML = "";
  } else {
    if (activeTabId === id) switchTab(browserTabs[Math.max(0, index - 1)].id);
    else renderTabs();
  }
}

function renderTabs() {
  const list = $("chromeTabsList"); if (!list) return;
  let html = browserTabs.map(t => `<div class="chrome-tab ${t.id === activeTabId ? 'active' : ''}" onclick="switchTab('${t.id}')"><span>${t.title}</span><div class="tab-close" onclick="closeTab('${t.id}', event)">×</div></div>`).join("");
  html += `<button class="chrome-new-tab-btn" onclick="createTab()">+</button>`;
  list.innerHTML = html;
}

// --- NOTIFICAÇÕES ---
function showNotification(title, body) {
  const id = Date.now();
  notifications.unshift({ id, title, body, time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) });
  if (notifications.length > 5) notifications.pop();
  renderNotifications();
}

function renderNotifications() {
  const list = $("notifList"); if (!list) return;
  list.innerHTML = notifications.length ? notifications.map(n => `
    <div class="notif-item-wrapper" id="notif_wrap_${n.id}">
      <div class="notif-delete-bg">APAGAR</div>
      <div class="notif-item" id="notif_${n.id}" data-id="${n.id}">
        <div style="display:flex;justify-content:space-between;margin-bottom:5px">
          <strong>${n.title}</strong>
          <small>${n.time}</small>
        </div>
        <div style="opacity:0.8">${n.body}</div>
      </div>
    </div>`).join("") : '<div class="notif-item" style="opacity:0.5; border:none; text-align:center">Nenhuma notificação nova</div>';
  setupSwipeToDelete();
}

function setupSwipeToDelete() {
  document.querySelectorAll(".notif-item").forEach(item => {
    let startX = 0, currentX = 0, isDragging = false;
    const id = item.getAttribute("data-id");

    const onStart = (e) => {
      isDragging = true;
      startX = e.type.includes("touch") ? e.touches[0].clientX : e.clientX;
      item.style.transition = "none";
    };

    const onMove = (e) => {
      if (!isDragging) return;
      const x = e.type.includes("touch") ? e.touches[0].clientX : e.clientX;
      currentX = Math.min(0, x - startX);
      if (currentX > 0) currentX = 0;
      item.style.transform = `translateX(${currentX}px)`;
    };

    const onEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      item.style.transition = "transform 0.3s cubic-bezier(0.1, 0.9, 0.2, 1)";
      if (currentX < -120) {
        item.style.transform = `translateX(-110%)`;
        setTimeout(() => {
          notifications = notifications.filter(n => n.id != id);
          renderNotifications();
        }, 200);
      } else {
        item.style.transform = `translateX(0)`;
      }
    };

    item.addEventListener("mousedown", onStart);
    item.addEventListener("touchstart", onStart);
    item.addEventListener("mousemove", onMove);
    item.addEventListener("touchmove", onMove);
    item.addEventListener("mouseup", onEnd);
    item.addEventListener("touchend", onEnd);
    item.addEventListener("mouseleave", onEnd);
  });
}

// --- ZARCHIVER ---
async function renderZArchiver() {
  const list = $("zaFileList"); if (!list) return;
  try {
    const files = await window.ets2.listMusic();
    list.innerHTML = files.map(f => `
      <div class="za-item">
        <svg class="za-icon" viewBox="0 0 24 24" fill="#ffcc00"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
        <span class="za-name">${f}</span>
        <span class="za-delete">✕</span>
      </div>`).join("");
  } catch (e) {
    list.innerHTML = `<div style="color:red;padding:20px">Erro ao ler arquivos.</div>`;
  }
}

// --- LOGISTICS PRO ---
async function refreshFreights() {
  if (!token) return;
  const list = $("freightList"); if (!list) return;
  try {
    const data = await api("/api/freights");
    freights = data.freights || (Array.isArray(data) ? data : []);
    console.log("Freights received:", freights.length);
    if (freights.length === 0) {
      list.innerHTML = `<div class="f-empty">Sem cargas disponíveis no momento.</div>`;
    } else {
      renderLogistics();
    }
  } catch (e) {
    list.innerHTML = `<div class="f-error">Erro ao conectar com a Central.</div>`;
    setTimeout(refreshFreights, 5000);
  }
}

window.acceptFreight = async (id) => {
  try {
    const res = await api(`/api/freights/${id}/accept`, { method: "POST" });
    if (res.freight || res.success) {
      activeFreight = freights.find(item => item.id === id) || res.freight;
      showNotification("Logística", `Carga aceita! Boa viagem.`);
      renderLogistics();
    } else {
      showNotification("Logística", "Este frete não está mais disponível.");
      refreshFreights();
    }
  } catch (e) {
    showNotification("Erro", "Não foi possível aceitar este frete.");
    refreshFreights();
  }
};

window.dropFreight = () => { if (confirm("Cancelar frete ativo?")) { activeFreight = null; showNotification("Logística", "Frete descartado."); renderLogistics(); } };

function renderLogistics() {
  const list = $("freightList"); const banner = $("activeFreightContainer"); if (!list) return;
  if (activeFreight) {
    banner.innerHTML = `
      <div class="active-route-card">
        <div class="ar-info">
          <span class="ar-label">Navegação Ativa</span>
          <span class="ar-cargo">📦 ${activeFreight.cargo}</span>
          <span class="ar-dest">${activeFreight.origin} ➔ ${activeFreight.destination}</span>
        </div>
        <button class="ar-cancel" onclick="dropFreight()">✕</button>
      </div>`;
    banner.classList.remove("hidden");
  } else { banner.classList.add("hidden"); }
  if (freights.length === 0) { list.innerHTML = `<div class="f-empty">Buscando cargas...</div>`; return; }
  list.innerHTML = freights.map(f => {
    const isCancelled = f.status === "cancelled" || f.status === "cancelado";
    const isAvailable = f.status === "criado";
    const date = new Date(f.createdAt).toLocaleDateString("pt-BR");
    return `<div class="l-card ${!isAvailable ? 'l-disabled' : ''}"><div class="l-side-bar"></div><div class="l-main"><div class="l-header"><div><span class="l-cargo">${f.cargo}</span><div style="font-size:10px; opacity:0.6; font-weight:700">${f.companyName || 'LOGÍSTICA'} • ${f.userName || 'Sistema'} • ${date}</div></div><span class="l-tag">${isCancelled ? 'CANCELADO' : (isAvailable ? 'DISPONÍVEL' : 'EM ROTA')}</span></div><div class="l-route"><div class="l-point"><span>📍</span> <span>${f.origin}</span></div><div class="l-connector"></div><div class="l-point"><span>🏁</span> <span>${f.destination}</span></div></div><div class="l-footer"><div class="l-price">R$ ${Number(f.value).toLocaleString('pt-BR')}</div>${isAvailable && !activeFreight ? `<button class="l-btn" onclick="acceptFreight('${f.id}')">ACEITAR</button>` : ''}</div></div></div>`;
  }).join("");
}

// --- MUSIC ---
async function loadMusic() {
  const list = $("musicListResults"); if (!list) return;
  try {
    localFiles = await window.ets2.listMusic();
    list.innerHTML = localFiles.map((f, i) => `<div class="f-card" onclick="playMusic(${i})" style="padding:15px;margin-bottom:10px;background:var(--panel-color);border-radius:12px;display:flex;justify-content:space-between;cursor:pointer"><strong>🎵 ${f.replace(/\.(mp3|ogg|wav)$/i, '')}</strong><span style="color:var(--apple-blue)">OUVIR</span></div>`).join("");
  } catch (e) { }
}

window.playMusic = async (i) => {
  currentIndex = i; const file = localFiles[currentIndex];
  try {
    const dataUrl = await window.ets2.getMusicData(file);
    const player = $("localAudioPlayer");
    player.src = dataUrl; player.play();
    if ($("playerTrackTitle")) $("playerTrackTitle").textContent = file.replace(/\.(mp3|ogg|wav)$/i, '');
    $("nativeMiniPlayer").classList.remove("hidden");
    $("playIcon").classList.add("hidden"); $("pauseIcon").classList.remove("hidden");
  } catch (e) { }
};

// --- SYSTEM ---
function showScreen(id) {
  const screens = ["lockScreen", "loginScreen", "homeScreen", "freightsScreen", "musicScreen", "settingsScreen", "appStoreScreen", "browserScreen", "youtubeScreen", "whatsappScreen", "zarchiverScreen", "ytmusicScreen", "blockBlastScreen"];
  screens.forEach(s => { 
    const el = $(s); 
    if (el) { 
      if (s === id) { 
        el.style.display = "flex"; 
        setTimeout(() => el.classList.add("active"), 10); 
      } else { 
        el.classList.remove("active"); 
        el.style.display = "none"; 
      } 
    } 
  });
  
  if ($("ipadDock")) $("ipadDock").classList.toggle("hidden", id !== "homeScreen");
  if ($("controlCenter")) $("controlCenter").classList.add("hidden");
  if ($("notificationCenter")) $("notificationCenter").classList.add("hidden");
  
  // App initializers
  if (id === "browserScreen" && browserTabs.length === 0) createTab();
  if (id === "freightsScreen") refreshFreights();
  if (id === "musicScreen") loadMusic();
  if (id === "youtubeScreen") $("ytWebview").src = "https://www.youtube.com";
  if (id === "whatsappScreen") $("waWebview").src = "https://web.whatsapp.com";
  if (id === "ytmusicScreen") $("ytmWebview").src = "https://music.youtube.com";
  if (id === "zarchiverScreen") renderZArchiver();
}

function setupEventListeners() {
  if ($("unlockBtn")) $("unlockBtn").onclick = () => { unlocked = true; showScreen("homeScreen"); };

  if ($("openNotifCenter")) {
    let isDragging = false, startY = 0;
    $("openNotifCenter").onmousedown = (e) => { isDragging = true; startY = e.clientY; justDragged = false; };
    window.addEventListener("mousemove", (e) => { if (!isDragging) return; if (e.clientY - startY > 40) { isDragging = false; justDragged = true; $("notificationCenter").classList.remove("hidden"); $("controlCenter").classList.add("hidden"); renderNotifications(); } });
    window.addEventListener("mouseup", () => isDragging = false);
    $("openNotifCenter").onclick = (e) => { e.stopPropagation(); if (!justDragged) { $("notificationCenter").classList.toggle("hidden"); $("controlCenter").classList.add("hidden"); if (!$("notificationCenter").classList.contains("hidden")) renderNotifications(); } };
  }

  if ($("notificationCenter")) {
    let isClosing = false, startY = 0;
    $("notificationCenter").onmousedown = (e) => { isClosing = true; startY = e.clientY; };
    window.addEventListener("mousemove", (e) => { if (!isClosing) return; if (startY - e.clientY > 60) { isClosing = false; $("notificationCenter").classList.add("hidden"); } });
    window.addEventListener("mouseup", () => isClosing = false);
  }

  if ($("openControlCenter")) {
    let isDragging = false, startY = 0;
    $("openControlCenter").onmousedown = (e) => { isDragging = true; startY = e.clientY; justDragged = false; };
    window.addEventListener("mousemove", (e) => { if (!isDragging) return; if (e.clientY - startY > 40) { isDragging = false; justDragged = true; $("controlCenter").classList.remove("hidden"); $("notificationCenter").classList.add("hidden"); } });
    window.addEventListener("mouseup", () => isDragging = false);
    $("openControlCenter").onclick = (e) => { e.stopPropagation(); if (!justDragged) { $("controlCenter").classList.toggle("hidden"); $("notificationCenter").classList.add("hidden"); } };
  }

  if ($("toggleDarkMode")) $("toggleDarkMode").onclick = async () => { isDarkMode = !isDarkMode; document.body.classList.toggle("dark-mode", isDarkMode); await window.ets2.storeSet("darkMode", isDarkMode); };

  document.body.onclick = (e) => {
    if (justDragged) return;
    const cc = $("controlCenter"); const nc = $("notificationCenter");
    if (cc && !cc.classList.contains("hidden") && !e.target.closest("#controlCenter") && !e.target.closest("#openControlCenter")) cc.classList.add("hidden");
    if (nc && !nc.classList.contains("hidden") && !e.target.closest("#notificationCenter") && !e.target.closest("#openNotifCenter")) nc.classList.add("hidden");
  };

  const navMap = { 
    "openFreightsApp": "freightsScreen", 
    "openMusicApp": "musicScreen", 
    "openSettingsApp": "settingsScreen", 
    "openBrowserApp": "browserScreen", 
    "openAppStoreApp": "appStoreScreen", 
    "app_youtube": "youtubeScreen", 
    "app_whatsapp": "whatsappScreen", 
    "app_zarchiver": "zarchiverScreen", 
    "app_ytmusic": "ytmusicScreen", 
    "app_blockblast": "blockBlastScreen" 
  };
  Object.keys(navMap).forEach(id => { if ($(id)) $(id).onclick = () => showScreen(navMap[id]); });

  // PLAYER LISTENERS
  if ($("playerPlayPauseBtn")) $("playerPlayPauseBtn").onclick = () => { const a = $("localAudioPlayer"); if (a.paused) { a.play(); $("playIcon").classList.add("hidden"); $("pauseIcon").classList.remove("hidden"); } else { a.pause(); $("playIcon").classList.remove("hidden"); $("pauseIcon").classList.add("hidden"); } };
  if ($("playerNextBtn")) $("playerNextBtn").onclick = () => { if (currentIndex < localFiles.length - 1) playMusic(currentIndex + 1); };
  if ($("playerPrevBtn")) $("playerPrevBtn").onclick = () => { if (currentIndex > 0) playMusic(currentIndex - 1); };

  ["youtube", "whatsapp", "zarchiver", "ytmusic"].forEach(app => {
    const btn = $(`install_${app}`);
    if (btn) btn.onclick = async () => {
      if (installedApps.includes(app)) showScreen(app + "Screen");
      else { btn.textContent = "BAIXANDO..."; setTimeout(async () => { installedApps.push(app); await window.ets2.storeSet("installedApps", installedApps); if ($(`app_${app}`)) $(`app_${app}`).classList.remove("hidden"); btn.textContent = "ABRIR"; btn.style.background = "var(--apple-blue)"; btn.style.color = "#fff"; showNotification("App Instalado", `${app} pronto.`); }, 1000); }
    };
  });

  if ($("phoneLoginForm")) {
    $("phoneLoginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const username = $("phoneUsername").value;
        const password = $("phonePassword").value;
        const res = await api("/api/auth/login", {
          method: "POST",
          data: { username, password }
        });
        if (res.token) {
          token = res.token;
          await window.ets2.storeSet("tablet_token", res.token);
          await window.ets2.storeSet("tablet_username", username);
          
          showNotification("Sistema", `Bem-vindo, ${username}`);
          showScreen("homeScreen");
          connectSocket();
          refreshFreights();
        } else {
          showNotification("Erro", "Credenciais inválidas");
        }
      } catch (err) {
        showNotification("Erro", "Servidor inacessível ou senha incorreta");
      }
    });
  }

  if ($("phoneLogoutBtn")) {
    $("phoneLogoutBtn").onclick = async () => {
      const ok = confirm("Deseja realmente encerrar a sessão?");
      if (ok) {
        token = null;
        await window.ets2.storeSet("tablet_token", null);
        await window.ets2.storeSet("tablet_username", null);
        if (socket) socket.disconnect();
        showScreen("loginScreen");
        showNotification("Sistema", "Sessão encerrada.");
      }
    };
  }
}

async function refreshSession() {
  try {
    isDarkMode = await window.ets2.storeGet("darkMode") || false;
    document.body.classList.toggle("dark-mode", isDarkMode);
    const savedApps = await window.ets2.storeGet("installedApps");
    if (savedApps) { installedApps = savedApps.filter(a => a !== "spotify"); installedApps.forEach(app => { if ($(`app_${app}`)) $(`app_${app}`).classList.remove("hidden"); const btn = $(`install_${app}`); if (btn) { btn.textContent = "ABRIR"; btn.style.background = "var(--apple-blue)"; btn.style.color = "#fff"; } }); }
    
    const hasSession = await tryStoredSession();
    if (!hasSession) {
      showScreen("loginScreen");
    }
  } catch (e) { }
}

function updateClock() {
  const now = new Date();
  const t = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const day = now.getDate();
  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const month = monthNames[now.getMonth()];

  if ($("clock")) $("clock").textContent = t;
  if ($("lockClock")) $("lockClock").textContent = t;
  if ($("notifClock")) $("notifClock").textContent = t;
  if ($("widgetClock")) $("widgetClock").textContent = t;
  if ($("widgetDate")) $("widgetDate").textContent = day;
  if ($("widgetMonth")) $("widgetMonth").textContent = month;
  if ($("notifDate")) $("notifDate").textContent = `${now.toLocaleDateString('pt-BR', { weekday: 'long' })}, ${day} de ${month}`;
  if ($("lockDate")) $("lockDate").textContent = `${now.toLocaleDateString('pt-BR', { weekday: 'long' })}, ${day} de ${month}`;
}

// LISTENER DE STATUS REAL DO JOGO
window.ets2.onGameStatus((running) => {
  console.log("[STATUS] Jogo rodando:", running);
  const standby = $("standbyScreen");
  if (standby) {
    if (running) {
      standby.classList.add("hidden");
      console.log("[OVERLAY] Tablet desperto!");
    } else {
      standby.classList.remove("hidden");
      console.log("[OVERLAY] Tablet em espera...");
    }
  }
});

// --- SYSTEM ---
updateClock(); 
refreshSession(); 
setupEventListeners();

setInterval(updateClock, 1000);

// Não fazemos mais polling de 5s para não sobrecarregar o PythonAnywhere
// O Socket agora cuida das atualizações em tempo real
setInterval(refreshFreights, 60000); // Fallback apenas a cada 1 minuto
