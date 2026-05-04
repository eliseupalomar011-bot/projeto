const { app, BrowserWindow, ipcMain, globalShortcut, screen, session, protocol, net } = require("electron");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const Store = require("electron-store");
const { injectFreightIntoSave } = require("./saveEditor");

const store = new Store();

// Pasta de dados estável v4 (Reset Final)
const stableDataPath = path.join(app.getPath("userData"), "tablet_session_v4");
if (!fs.existsSync(stableDataPath)) fs.mkdirSync(stableDataPath, { recursive: true });
app.setPath("userData", stableDataPath);

let mainWindow;
let tabletWindow;
let tabletVisible = false;
let tabletInteractive = false;

// Permissões e Desativação de Bloqueios (Estratégia Linux)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-features', 'UserAgentClientHint');

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) { app.quit(); } else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  });
}

app.name = "ETS2FreightClient";

// --- HANDLERS DE INTERNET ---
ipcMain.handle("http:request", async (_, options) => {
  try {
    const res = await axios(options);
    return { data: res.data, status: res.status, success: true };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

// --- MÚSICA: MODO À PROVA DE FALHAS (BASE64) ---
ipcMain.handle("music:get-data", async (_, filename) => {
  const possiblePaths = [
    path.join(app.getPath("documents"), "Euro Truck Simulator 2", "music", filename),
    path.join(process.env.USERPROFILE, "Documents", "Euro Truck Simulator 2", "music", filename),
    path.join(process.env.USERPROFILE, "OneDrive", "Documents", "Euro Truck Simulator 2", "music", filename)
  ];
  
  let filePath = possiblePaths[0];
  for (const p of possiblePaths) { if (fs.existsSync(p)) { filePath = p; break; } }
  
  try {
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    let mime = 'audio/mpeg';
    if (ext === '.ogg') mime = 'audio/ogg';
    if (ext === '.wav') mime = 'audio/wav';
    
    // Converte para Base64 para garantir que o celular consiga ler sem bloqueio de segurança
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch (err) {
    return null;
  }
});

ipcMain.handle("music:list-local", async () => {
  const possiblePaths = [
    path.join(app.getPath("documents"), "Euro Truck Simulator 2", "music"),
    path.join(process.env.USERPROFILE, "Documents", "Euro Truck Simulator 2", "music"),
    path.join(process.env.USERPROFILE, "OneDrive", "Documents", "Euro Truck Simulator 2", "music")
  ];
  let musicDir = possiblePaths[0];
  for (const p of possiblePaths) { if (fs.existsSync(p)) { musicDir = p; break; } }
  try {
    if (!fs.existsSync(musicDir)) return [];
    return fs.readdirSync(musicDir).filter(f => f.toLowerCase().endsWith(".mp3") || f.toLowerCase().endsWith(".ogg") || f.toLowerCase().endsWith(".wav"));
  } catch (err) { return []; }
});

ipcMain.handle("store:get", (_, key) => store.get(key));
ipcMain.handle("store:set", (_, key, val) => store.set(key, val));
ipcMain.handle("save:inject", async (_, data) => await injectFreightIntoSave(data));
ipcMain.handle("truck-lock:set", async (_, locked) => {
  const docs = app.getPath("documents");
  const folder = path.join(docs, "ETS2Freight");
  const file = path.join(folder, "truck-lock.json");
  
  try {
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ locked: !!locked, updatedAt: new Date().toISOString() }));
    console.log(`[DLL] Estado da trava atualizado: ${locked}`);
    return true;
  } catch (err) {
    console.error("Erro ao escrever arquivo de trava para a DLL:", err);
    return false;
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024, height: 720, // Tablet Mode
    frame: false,
    transparent: true,
    alwaysOnTop: false,
    webPreferences: { 
      preload: path.join(__dirname, "preload.js"), 
      contextIsolation: true, 
      nodeIntegration: false, 
      webSecurity: false,
      webviewTag: true,
      plugins: true,
      backgroundThrottling: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, "overlay", "phone.html"));
}

function createTabletOverlay() {
  tabletWindow = new BrowserWindow({
    width: 850, height: 600, // Tamanho otimizado conforme foto
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    show: false,
    focusable: false, // Inicia sem roubar o teclado do jogo
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      webSecurity: false,
      webviewTag: true,
      plugins: true,
      backgroundThrottling: false
    },
  });
  tabletWindow.setAlwaysOnTop(true, 'screen-saver'); // Força ficar por cima de jogos em tela cheia
  tabletWindow.loadFile(path.join(__dirname, "overlay", "phone.html"));
}

app.whenReady().then(() => {
  // UA de Linux - Costuma ser o mais aceito pelo Google em navegadores customizados
  const linuxUA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  
  session.defaultSession.setUserAgent(linuxUA);

  const partitions = ['persist:youtube', 'persist:ytmusic', 'persist:whatsapp', 'persist:spotify'];
  partitions.forEach(p => {
    const ses = session.fromPartition(p);
    ses.setUserAgent(linuxUA);
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
      details.requestHeaders['User-Agent'] = linuxUA;
      callback({ cancel: false, requestHeaders: details.requestHeaders });
    });
  });

  createTabletOverlay(); // Cria o tablet já no boot (escondido)
  createWindow();
  globalShortcut.register("F8", () => {
    if (!tabletWindow) createTabletOverlay();
    tabletVisible = !tabletVisible;
    if (tabletVisible) tabletWindow.showInactive(); else tabletWindow.hide();
  });
  globalShortcut.register("F9", () => {
    tabletInteractive = !tabletInteractive;
    if (tabletWindow) {
      tabletWindow.setIgnoreMouseEvents(!tabletInteractive, { forward: true });
      tabletWindow.setFocusable(tabletInteractive); // Libera o teclado para o jogo
      if (tabletInteractive) tabletWindow.focus(); 
      tabletWindow.webContents.send("overlay:state", { interactive: tabletInteractive });
    }
  });
});

// VIGIA DO PROCESSO DO JOGO COM AUTO-SHOW
let lastRunningState = false;
setInterval(async () => {
  const isRunning = await new Promise(resolve => {
    require('child_process').exec('tasklist /FI "IMAGENAME eq eurotrucks2.exe"', (err, stdout) => {
      resolve(stdout.toLowerCase().includes('eurotrucks2.exe'));
    });
  });
  
  // Se o jogo ACABOU DE ABRIR (estava fechado e agora está aberto)
  if (isRunning && !lastRunningState) {
    console.log("Jogo detectado! Preparando o tablet em 3 segundos...");
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide(); // Esconde a janela do meio
    
    setTimeout(() => {
      if (!tabletWindow || tabletWindow.isDestroyed()) createTabletOverlay();
      tabletVisible = true;
      if (tabletWindow && !tabletWindow.isDestroyed()) {
        tabletWindow.showInactive();
        tabletWindow.webContents.send("game:status", true);
      }
    }, 3000);
  }

  // Se o jogo FECHOU
  if (!isRunning && lastRunningState) {
    if (tabletWindow && !tabletWindow.isDestroyed()) tabletWindow.hide();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show(); // Reaparece a janela do meio
    tabletVisible = false;
  }

  lastRunningState = isRunning;
  
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
    mainWindow.webContents.send("game:status", isRunning);
  }
  if (tabletWindow && !tabletWindow.isDestroyed() && tabletWindow.isVisible()) {
    tabletWindow.webContents.send("game:status", isRunning);
  }
}, 2000);
