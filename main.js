const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const dgram = require('dgram');

const DEFAULT_SETTINGS = {
  timezone: 'America/New_York',
  hourMode: '12',
  alwaysOnTop: false,
  showSeconds: true,
  faceStyle: 'digital',
  accentColor: '#80cbc4',
  textColor: '#f8fafc',
  backgroundColor: '#111827',
  backgroundOpacity: 0.78,
  fontScale: 1
};

const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'UTC',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Australia/Sydney'
];

let mainWindow;
let tray;
let ntpOffsetMs = 0;
let settings = { ...DEFAULT_SETTINGS };

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    const file = fs.readFileSync(getSettingsPath(), 'utf8');
    settings = { ...DEFAULT_SETTINGS, ...JSON.parse(file) };
  } catch {
    settings = { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(nextSettings) {
  settings = { ...DEFAULT_SETTINGS, ...nextSettings };
  fs.mkdirSync(path.dirname(getSettingsPath()), { recursive: true });
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2));
}

function applyWindowSettings() {
  if (!mainWindow) return;
  mainWindow.setAlwaysOnTop(Boolean(settings.alwaysOnTop), 'screen-saver');
}

function updateTrayMenu() {
  if (!tray) return;
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Clock',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      }
    },
    {
      label: 'Always on Top',
      type: 'checkbox',
      checked: settings.alwaysOnTop,
      click: (menuItem) => {
        settings.alwaysOnTop = menuItem.checked;
        saveSettings(settings);
        applyWindowSettings();
        mainWindow.webContents.send('settings-updated', settings);
      }
    },
    { type: 'separator' },
    { role: 'quit', label: 'Quit Clock Widget' }
  ]);

  tray.setContextMenu(contextMenu);
}

function createTray() {
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAY1BMVEVHcEz///////////////////////////////////////////////////////////////////////////////////////////////////+QJ1mXAAAAIHRSTlMABM3wE5JvgKLc7+3ZNCkVif2zd1zDfY4CnygkqM/BPq8L0fnMRAAAAHxJREFUGNNVz9kSgCAQBdAmhSxR7P9fdw2bIk2VmvYzu2eM2A0N6n/G7Aq3gl7lVJHjfkh1tFoAT3zhEXElBTtPlqvGjYwR7pA8W0wAEG2h09lu6dM4lp8dJSMQNVAAqMw3fHBHkEU0tLx7GJs4wJ4D9o9U0v4H9MEEjUvc4fcBr7YBNa6H1wAAAABJRU5ErkJggg=='
  );

  tray = new Tray(icon);
  tray.setToolTip('Clock Widget');
  updateTrayMenu();
  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

function getTimezones() {
  if (typeof Intl.supportedValuesOf === 'function') {
    return Intl.supportedValuesOf('timeZone');
  }
  return COMMON_TIMEZONES;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 250,
    minWidth: 360,
    minHeight: 220,
    frame: false,
    transparent: true,
    resizable: true,
    skipTaskbar: false,
    alwaysOnTop: settings.alwaysOnTop,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');
  applyWindowSettings();

  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function readNtpTimestamp(buffer, offset) {
  const seconds = buffer.readUInt32BE(offset);
  const fraction = buffer.readUInt32BE(offset + 4);
  const ntpEpochOffset = 2208988800;
  const unixSeconds = seconds - ntpEpochOffset;
  const millis = Math.round((fraction * 1000) / 0x100000000);
  return (unixSeconds * 1000) + millis;
}

function syncTimeWithNtp(server = 'pool.ntp.org', port = 123, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const client = dgram.createSocket('udp4');
    const packet = Buffer.alloc(48);
    packet[0] = 0x1b;
    const sentAt = Date.now();

    const cleanup = () => {
      clearTimeout(timeoutId);
      client.removeAllListeners();
      try {
        client.close();
      } catch {
        // Ignore close errors during cleanup.
      }
    };

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('NTP request timed out'));
    }, timeoutMs);

    client.once('error', (error) => {
      cleanup();
      reject(error);
    });

    client.once('message', (message) => {
      const receivedAt = Date.now();
      cleanup();

      if (message.length < 48) {
        reject(new Error('Invalid NTP response'));
        return;
      }

      const serverReceive = readNtpTimestamp(message, 32);
      const serverTransmit = readNtpTimestamp(message, 40);
      const roundTripDelay = receivedAt - sentAt - (serverTransmit - serverReceive);
      const offset = ((serverReceive - sentAt) + (serverTransmit - receivedAt)) / 2;

      resolve({
        offset,
        roundTripDelay
      });
    });

    client.send(packet, 0, packet.length, port, server);
  });
}

async function refreshNtpOffset() {
  try {
    const result = await syncTimeWithNtp();
    ntpOffsetMs = result.offset;
    if (mainWindow) {
      mainWindow.webContents.send('ntp-status', {
        synced: true,
        offsetMs: ntpOffsetMs,
        lastSyncAt: Date.now()
      });
    }
  } catch (error) {
    if (mainWindow) {
      mainWindow.webContents.send('ntp-status', {
        synced: false,
        offsetMs: ntpOffsetMs,
        error: error.message,
        lastSyncAt: Date.now()
      });
    }
  }
}

ipcMain.handle('get-initial-state', () => ({
  settings,
  ntpOffsetMs,
  timezones: getTimezones()
}));

ipcMain.handle('save-settings', (_, nextSettings) => {
  saveSettings(nextSettings);
  applyWindowSettings();
  updateTrayMenu();
  return settings;
});

ipcMain.handle('get-current-time', () => ({
  now: Date.now() + ntpOffsetMs
}));

ipcMain.on('drag-window', () => {
  if (mainWindow) {
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  loadSettings();
  createWindow();
  createTray();
  refreshNtpOffset();
  setInterval(refreshNtpOffset, 5 * 60 * 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('before-quit', () => {
  app.isQuiting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
