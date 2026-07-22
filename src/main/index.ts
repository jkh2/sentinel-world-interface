// Electron main process — Phase 1.
// Owns the window, the SessionManager, and the IPC surface. The renderer never
// touches a CLI, a file, or a process directly; everything crosses this line
// through named, validated IPC channels.

import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { SessionManager } from './SessionManager';
import { detectAll } from './bridge/index';
import { IpcChannels } from '../shared/events';
import type { SessionOptions } from '../shared/types';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    show: false,
    backgroundColor: '#0e1116',
    title: 'SIDLF World Interface',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.on('ready-to-show', () => mainWindow?.show());

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// One SessionManager per window; forwards agent events to the renderer.
function wireSession(): SessionManager {
  const manager = new SessionManager((event) => {
    mainWindow?.webContents.send(IpcChannels.agentEvent, event);
  });

  ipcMain.handle(IpcChannels.sessionStart, (_e, options: SessionOptions) =>
    manager.start(options),
  );
  ipcMain.handle(IpcChannels.sessionSend, (_e, message: string) =>
    manager.send(message),
  );
  ipcMain.handle(IpcChannels.sessionInterrupt, () => manager.interrupt());
  ipcMain.handle(IpcChannels.sessionStop, () => manager.stop());
  ipcMain.handle(IpcChannels.sessionStatus, () => manager.status());
  ipcMain.handle(IpcChannels.detectClis, () => detectAll());

  ipcMain.handle(IpcChannels.pickDirectory, async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose a project directory for the agent',
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  return manager;
}

app.whenReady().then(() => {
  wireSession();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
