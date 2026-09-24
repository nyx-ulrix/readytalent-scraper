const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  openPortal: () => ipcRenderer.invoke("rt:open"),
  scrape: () => ipcRenderer.invoke("rt:scrape"),
  savePdf: (name) => ipcRenderer.invoke("pdf:save", name),
  setCreds: (user, pass) => ipcRenderer.invoke("creds:set", { user, pass }),
  getCreds: () => ipcRenderer.invoke("creds:get"),
  searchBoards: (opts) => ipcRenderer.invoke("boards:search", opts),
  stopBoards: () => ipcRenderer.invoke("boards:stop"),
  showBoardWindow: () => ipcRenderer.invoke("boards:window"),
  removeBoardJobs: (ids) => ipcRenderer.invoke("boards:remove", ids),
  onBoardsProgress: (cb) => {
    const h = (_e, p) => cb(p);
    ipcRenderer.on("boards:progress", h);
    return () => ipcRenderer.off("boards:progress", h);
  },
  onProgress: (cb) => {
    const h = (_e, p) => cb(p);
    ipcRenderer.on("rt:progress", h);
    return () => ipcRenderer.off("rt:progress", h);
  },
});
