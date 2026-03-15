const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("teluWidget", {
  getConfig: () => ipcRenderer.invoke("config:get"),
  saveConfig: (config) => ipcRenderer.invoke("config:set", config),
  refreshCalendar: () => ipcRenderer.invoke("calendar:refresh"),
  openAuthWindow: () => ipcRenderer.invoke("auth:open"),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  openExternalLink: (url) => ipcRenderer.invoke("link:openExternal", url),
  setTaskDoneState: (taskId, done) => ipcRenderer.invoke("task:setDone", { taskId, done }),
  onAuthVerified: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("auth:verified", listener);
    return () => ipcRenderer.removeListener("auth:verified", listener);
  }
});
