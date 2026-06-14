const state = {
  settings: null,
  ntpStatus: {
    synced: false,
    offsetMs: 0,
    lastSyncAt: null
  }
};

const elements = {
  widgetCard: document.getElementById('widgetCard'),
  clockReadout: document.getElementById('clockReadout'),
  dateReadout: document.getElementById('dateReadout'),
  timezoneLabel: document.getElementById('timezoneLabel'),
  syncStatus: document.getElementById('syncStatus'),
  settingsPanel: document.getElementById('settingsPanel'),
  toggleSettings: document.getElementById('toggleSettings'),
  timezoneSelect: document.getElementById('timezoneSelect'),
  hourModeSelect: document.getElementById('hourModeSelect'),
  faceStyleSelect: document.getElementById('faceStyleSelect'),
  accentColorInput: document.getElementById('accentColorInput'),
  textColorInput: document.getElementById('textColorInput'),
  backgroundColorInput: document.getElementById('backgroundColorInput'),
  opacityInput: document.getElementById('opacityInput'),
  fontScaleInput: document.getElementById('fontScaleInput'),
  showSecondsInput: document.getElementById('showSecondsInput'),
  alwaysOnTopInput: document.getElementById('alwaysOnTopInput'),
  dragHandle: document.getElementById('dragHandle')
};

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  const size = value.length === 3 ? 1 : 2;
  const parts = value.match(new RegExp(`.{${size}}`, 'g')) || ['11', '18', '39'];
  const expanded = size === 1 ? parts.map((part) => part + part) : parts;
  return expanded.map((part) => parseInt(part, 16)).join(', ');
}

function formatTime(now, settings) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: settings.timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: settings.showSeconds ? '2-digit' : undefined,
    hour12: settings.hourMode === '12'
  });

  return formatter.format(now);
}

function formatDate(now, settings) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: settings.timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(now);
}

function renderClock() {
  if (!state.settings) return;
  const adjustedNow = Date.now() + (state.ntpStatus.offsetMs || 0);
  const now = new Date(adjustedNow);
  elements.clockReadout.textContent = formatTime(now, state.settings);
  elements.dateReadout.textContent = formatDate(now, state.settings);
}

function renderStatus() {
  const { synced, offsetMs, lastSyncAt } = state.ntpStatus;
  if (!lastSyncAt) {
    elements.syncStatus.textContent = 'Syncing...';
    return;
  }

  if (synced) {
    elements.syncStatus.textContent = `NTP synced (${Math.round(offsetMs)} ms)`;
  } else {
    elements.syncStatus.textContent = 'NTP unavailable';
  }
}

function applyTheme(settings) {
  document.documentElement.style.setProperty('--accent-color', settings.accentColor);
  document.documentElement.style.setProperty('--text-color', settings.textColor);
  document.documentElement.style.setProperty('--bg-rgb', hexToRgb(settings.backgroundColor));
  document.documentElement.style.setProperty('--bg-opacity', settings.backgroundOpacity);
  document.documentElement.style.setProperty('--font-scale', settings.fontScale);
  elements.widgetCard.className = `widget-card face-${settings.faceStyle}`;
  elements.timezoneLabel.textContent = settings.timezone;
}

async function persistSettings() {
  const nextSettings = {
    ...state.settings,
    timezone: elements.timezoneSelect.value,
    hourMode: elements.hourModeSelect.value,
    faceStyle: elements.faceStyleSelect.value,
    accentColor: elements.accentColorInput.value,
    textColor: elements.textColorInput.value,
    backgroundColor: elements.backgroundColorInput.value,
    backgroundOpacity: Number(elements.opacityInput.value),
    fontScale: Number(elements.fontScaleInput.value),
    showSeconds: elements.showSecondsInput.checked,
    alwaysOnTop: elements.alwaysOnTopInput.checked
  };

  state.settings = await window.clockApi.saveSettings(nextSettings);
  applyTheme(state.settings);
  renderClock();
}

function hydrateSettingsControls(settings, timezones) {
  elements.timezoneSelect.innerHTML = '';
  timezones.forEach((timezone) => {
    const option = document.createElement('option');
    option.value = timezone;
    option.textContent = timezone;
    elements.timezoneSelect.appendChild(option);
  });

  elements.timezoneSelect.value = settings.timezone;
  elements.hourModeSelect.value = settings.hourMode;
  elements.faceStyleSelect.value = settings.faceStyle;
  elements.accentColorInput.value = settings.accentColor;
  elements.textColorInput.value = settings.textColor;
  elements.backgroundColorInput.value = settings.backgroundColor;
  elements.opacityInput.value = settings.backgroundOpacity;
  elements.fontScaleInput.value = settings.fontScale;
  elements.showSecondsInput.checked = settings.showSeconds;
  elements.alwaysOnTopInput.checked = settings.alwaysOnTop;
}

async function init() {
  const initialState = await window.clockApi.getInitialState();
  state.settings = initialState.settings;
  state.ntpStatus.offsetMs = initialState.ntpOffsetMs;

  hydrateSettingsControls(initialState.settings, initialState.timezones);
  applyTheme(initialState.settings);
  renderClock();
  renderStatus();

  setInterval(renderClock, 250);

  elements.toggleSettings.addEventListener('click', () => {
    elements.settingsPanel.classList.toggle('hidden');
  });

  [
    elements.timezoneSelect,
    elements.hourModeSelect,
    elements.faceStyleSelect,
    elements.accentColorInput,
    elements.textColorInput,
    elements.backgroundColorInput,
    elements.opacityInput,
    elements.fontScaleInput,
    elements.showSecondsInput,
    elements.alwaysOnTopInput
  ].forEach((input) => {
    input.addEventListener('input', persistSettings);
    input.addEventListener('change', persistSettings);
  });

  window.clockApi.onNtpStatus((payload) => {
    state.ntpStatus = payload;
    renderStatus();
    renderClock();
  });

  window.clockApi.onSettingsUpdated((nextSettings) => {
    state.settings = nextSettings;
    hydrateSettingsControls(nextSettings, initialState.timezones);
    applyTheme(nextSettings);
    renderClock();
  });
}

init();
