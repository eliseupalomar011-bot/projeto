const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const axios = require("axios");
const Store = require("electron-store");

const store = new Store();
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 600,
    title: "ETS2 Fleet Manager Pro",
    backgroundColor: "#0f172a",
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile("index.html");

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) createWindow();
});

// IPC for API requests
ipcMain.handle("http:request", async (event, config) => {
  try {
    const response = await axios(config);
    return { success: true, data: response.data };
  } catch (error) {
    console.error("[API ERROR]", error.message);
    return { 
      success: false, 
      error: error.response?.data?.error?.message || error.message 
    };
  }
});

// Store handlers
ipcMain.handle("store:get", (event, key) => store.get(key));
ipcMain.handle("store:set", (event, key, value) => store.set(key, value));
ipcMain.handle("store:delete", (event, key) => store.delete(key));
