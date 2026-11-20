import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = app.getPath('userData');
const keyPath = path.join(dataDir, 'openrouter-key.bin');
let server;

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window) { if (window.isMinimized()) window.restore(); window.focus(); }
  });
  app.whenReady().then(async () => {
    process.env.CHAT_APP_PACKAGED = app.isPackaged ? '1' : '0';
    process.env.CHAT_APP_DATA_DIR = dataDir;
    // Keep the origin stable so browser storage and Firebase Auth persist between launches.
    process.env.PORT = '4175';
    if (safeStorage.isEncryptionAvailable()) {
      try { process.env.OPENROUTER_API_KEY = safeStorage.decryptString(await readFile(keyPath)); } catch {}
    }
    const backend = await import('../server.mjs');
    server = backend.server;
    const port = await backend.serverReady;
    const win = new BrowserWindow({
      width: 1240, height: 850, minWidth: 360, minHeight: 580,
      show: false, autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(here, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    win.once('ready-to-show', () => win.show());
    await win.loadURL(`http://localhost:${port}`);
  });
}

ipcMain.handle('api-key-status', () => ({ configured: !!process.env.OPENROUTER_API_KEY }));
ipcMain.handle('api-key-set', async (_event, value) => {
  if (typeof value !== 'string' || value.trim().length < 20 || value.length > 500) throw new Error('Enter a valid OpenRouter API key.');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure key storage is not available on this device.');
  await mkdir(dataDir, { recursive: true });
  await writeFile(keyPath, safeStorage.encryptString(value.trim()));
  process.env.OPENROUTER_API_KEY = value.trim();
  return { configured: true };
});
ipcMain.handle('api-key-clear', async () => {
  delete process.env.OPENROUTER_API_KEY;
  await rm(keyPath, { force: true });
  return { configured: false };
});

app.on('before-quit', () => server?.close());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
