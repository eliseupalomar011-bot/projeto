const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ets2", {
  // Internet
  request: (options) => ipcRenderer.invoke("http:request", options),
  
  // Armazenamento
  storeGet: (key) => ipcRenderer.invoke("store:get", key),
  storeSet: (key, val) => ipcRenderer.invoke("store:set", key, val),
  
  // Músicas
  listMusic: () => ipcRenderer.invoke("music:list-local"),
  getMusicData: (name) => ipcRenderer.invoke("music:get-data", name),
  
  // Fretes e Trava
  injectFreight: (data) => ipcRenderer.invoke("save:inject", data),
  setTruckLock: (locked) => ipcRenderer.invoke("truck-lock:set", locked),
  
  // Overlay
  onState: (callback) => ipcRenderer.on("overlay:state", (_, state) => callback(state)),
  onGameStatus: (callback) => ipcRenderer.on("game:status", (_, running) => callback(running))
});
