const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("darpanSetup", {
  saveApiKey: (key) => ipcRenderer.invoke("darpan:save-api-key", key),
});
