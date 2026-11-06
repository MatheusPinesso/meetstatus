const { app, Tray, Menu, nativeImage, Notification } = require('electron');
const express = require('express');
const cors = require('cors');
const DiscordRPC = require('discord-rpc');

// Configure o mesmo Application ID usado no Discord Developer Portal.
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1568258084969644102';
const PORT = Number(process.env.PORT || 3210);
const HOST = '127.0.0.1'; // Nunca exponha este webhook na rede local.

let tray;
let rpc;
let discordConnected = false;
let meetingStartedAt = null;
let reconnectTimer;
let shuttingDown = false;

app.setLoginItemSettings({ openAtLogin: true });
app.whenReady().then(async () => {
  createTray();
  startWebhookServer();
  await connectDiscord();
});

app.on('before-quit', () => {
  shuttingDown = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  try { rpc?.destroy(); } catch (_) {}
});

function createTray() {
  const icon = nativeImage.createFromPath(require('path').join(__dirname, 'tray.png'));
  tray = new Tray(icon);
  updateTrayMenu();
  tray.setToolTip('Meet Discord Status');
}

function updateTrayMenu() {
  if (!tray) return;
  const state = meetingStartedAt ? 'Em reunião' : 'Fora de reunião';
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Meet Discord Status — ${state}`, enabled: false },
    { label: `Discord: ${discordConnected ? 'Conectado' : 'Desconectado'}`, enabled: false },
    { type: 'separator' },
    { label: 'Testar atividade no Discord', click: () => setMeetingStatus('manual') },
    { label: 'Limpar atividade', click: () => clearMeetingStatus() },
    { type: 'separator' },
    { label: 'Sair', click: () => app.quit() }
  ]));
}

function notify(title, body) {
  if (Notification.isSupported()) new Notification({ title, body }).show();
}

async function connectDiscord() {
  if (shuttingDown || discordConnected || CLIENT_ID === 'COLOQUE_SEU_APPLICATION_ID') return;
  try {
    DiscordRPC.register(CLIENT_ID);
    rpc = new DiscordRPC.Client({ transport: 'ipc' });
    rpc.on('disconnected', () => {
      discordConnected = false;
      updateTrayMenu();
      scheduleReconnect();
    });
    await rpc.login({ clientId: CLIENT_ID });
    discordConnected = true;
    updateTrayMenu();
    console.log('[Discord] Conectado');
    if (meetingStartedAt) applyActivity();
  } catch (error) {
    discordConnected = false;
    updateTrayMenu();
    console.error('[Discord] Falha ao conectar:', error.message);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (shuttingDown || reconnectTimer) return;
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    await connectDiscord();
  }, 5000);
}

function applyActivity() {
  if (!discordConnected || !rpc || !meetingStartedAt) return;
  rpc.setActivity({
    details: 'Em reunião',
    state: 'Google Meet',
    startTimestamp: meetingStartedAt,
    instance: false
  });
  console.log('[Discord] Atividade definida: Em reunião');
  updateTrayMenu();
}

async function setMeetingStatus(source = 'webhook') {
  // Não reinicia o cronômetro em eventos enter duplicados.
  if (!meetingStartedAt) meetingStartedAt = Date.now();
  if (!discordConnected) await connectDiscord();
  applyActivity();
  updateTrayMenu();
  console.log(`[Meet] Entrada detectada (${source})`);
}

async function clearMeetingStatus() {
  meetingStartedAt = null;
  if (discordConnected && rpc) {
    try { rpc.clearActivity(); } catch (error) {
      console.error('[Discord] Erro ao limpar atividade:', error.message);
    }
  }
  updateTrayMenu();
  console.log('[Meet] Saída detectada; atividade limpa');
}

function normalizeEvent(payload) {
  const raw = payload.event ?? payload.type ?? payload.action ?? payload.status ?? payload.eventType ?? '';
  return String(raw).trim().toLowerCase();
}

function isEnter(event) {
  return ['enter', 'join', 'start', 'started', 'meeting_started'].some(x => event.includes(x));
}
function isLeave(event) {
  return ['leave', 'exit', 'end', 'ended', 'meeting_ended'].some(x => event.includes(x));
}

function startWebhookServer() {
  const server = express();
  server.use(cors({ origin: true }));
  server.use(express.json({ limit: '32kb' }));
  server.use(express.urlencoded({ extended: true }));

  server.get('/health', (_req, res) => res.json({
    online: true,
    discordConnected,
    inMeeting: meetingStartedAt !== null
  }));

  server.all('/webhook', async (req, res) => {
    const payload = { ...req.query, ...(req.body || {}) };
    const event = normalizeEvent(payload);
    console.log('[Webhook] Recebido:', JSON.stringify(payload));

    try {
      if (isEnter(event)) {
        await setMeetingStatus('webhook');
        return res.json({ success: true, status: 'meeting' });
      }
      if (isLeave(event)) {
        await clearMeetingStatus();
        return res.json({ success: true, status: 'available' });
      }
      return res.status(400).json({ success: false, message: 'Evento não reconhecido', receivedEvent: event });
    } catch (error) {
      console.error('[Webhook] Erro:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`[Webhook] Escutando em http://${HOST}:${PORT}`);
  });
}
