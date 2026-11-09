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
let keepAliveTimer;
let watchdogTimer;
let meetingInfo = { title: null, participants: null };
let lastHeartbeat = null; // só preenchido quando a extensão envia heartbeats
const HEARTBEAT_TIMEOUT_MS = 120000;

const withTimeout = (promise, ms = 4000) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
]);

// Descarta a conexão atual (possivelmente "zumbi") e agenda reconexão.
function resetRpc() {
  discordConnected = false;
  const old = rpc;
  rpc = null;
  try { old?.destroy(); } catch (_) {}
  updateTrayMenu();
  scheduleReconnect();
}

app.setLoginItemSettings({ openAtLogin: true });
app.whenReady().then(async () => {
  createTray();
  startWebhookServer();
  await connectDiscord();
  // Revalida a conexão com o Discord enquanto estiver em reunião.
  // Se a extensão manda heartbeats e eles param, considera que a chamada acabou.
  watchdogTimer = setInterval(() => {
    if (meetingStartedAt && lastHeartbeat && Date.now() - lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
      console.log('[Watchdog] Sem heartbeat; encerrando reunião');
      clearMeetingStatus();
    }
  }, 15000);
  keepAliveTimer = setInterval(() => {
    if (meetingStartedAt) applyActivity();
  }, 30000);
});

app.on('before-quit', () => {
  shuttingDown = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  if (watchdogTimer) clearInterval(watchdogTimer);
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

    {
      label: '🧪 Testar atividade no Discord',
      click: () => setMeetingStatus('manual')
    },
    {
      label: '🧹 Limpar atividade',
      click: () => clearMeetingStatus()
    },

    { type: 'separator' },
    { label: 'Sair', click: () => app.quit() }
  ]));
}

function notify(title, body) {
  if (Notification.isSupported()) new Notification({ title, body }).show();
}

async function connectDiscord() {
  if (shuttingDown || discordConnected || !CLIENT_ID) return;
  try {
    DiscordRPC.register(CLIENT_ID);
    const client = new DiscordRPC.Client({ transport: 'ipc' });
    rpc = client;
    client.on('disconnected', () => {
      if (rpc === client) resetRpc();
    });
    await client.login({ clientId: CLIENT_ID });
    discordConnected = true;
    updateTrayMenu();
    console.log('[Discord] Conectado');
    if (meetingStartedAt) applyActivity();
  } catch (error) {
    console.error('[Discord] Falha ao conectar:', error.message);
    resetRpc();
  }
}

function scheduleReconnect() {
  if (shuttingDown || reconnectTimer) return;
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    await connectDiscord();
  }, 5000);
}

async function applyActivity() {
  if (!discordConnected || !rpc || !meetingStartedAt) return;

  try {
    await withTimeout(rpc.request('SET_ACTIVITY', {
      pid: process.pid,
      activity: {
        type: 3, // WATCHING — Assistindo
        details: meetingInfo.title || 'Em reunião no Google Meet',
        state: meetingInfo.participants
          ? `${meetingInfo.participants} ${meetingInfo.participants === 1 ? 'pessoa' : 'pessoas'} na chamada`
          : 'Em reunião',
        timestamps: {
          start: Math.floor(meetingStartedAt / 1000)
        },
        assets: {
          large_image: 'google_meet',
          large_text: 'Google Meet'
        },
        instance: false
      }
    }));

    console.log('[Discord] Atividade Watching aplicada');
    updateTrayMenu();
  } catch (error) {
    console.error('[Discord] Erro ao definir atividade:', error.message);
    resetRpc();
  }
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
  meetingInfo = { title: null, participants: null };
  lastHeartbeat = null;
  updateTrayMenu();

  // Tenta limpar; se a conexão estiver morta, reconecta e tenta de novo.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!discordConnected || !rpc) await connectDiscord();
    if (!discordConnected || !rpc) break;
    try {
      await withTimeout(rpc.clearActivity());
      console.log('[Meet] Saída detectada; atividade limpa');
      return;
    } catch (error) {
      console.error('[Discord] Erro ao limpar atividade:', error.message);
      resetRpc();
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    }
  }
  console.log('[Meet] Saída registrada (Discord indisponível)');
}

function normalizeEvent(payload) {
  const raw = payload.event ?? payload.type ?? payload.action ?? payload.status ?? payload.eventType ?? '';
  return String(raw).trim().toLowerCase();
}

// Atualiza título/participantes; devolve true se algo mudou.
function updateMeetingInfo(payload) {
  const title = typeof payload.title === 'string' && payload.title.trim().length >= 2
    ? payload.title.trim().slice(0, 100) : null;
  const n = Number(payload.participants);
  const participants = Number.isInteger(n) && n > 0 ? n : null;
  const changed = title !== meetingInfo.title || participants !== meetingInfo.participants;
  meetingInfo = { title, participants };
  return changed;
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

  // Teste local: simula entrada em reunião
server.get('/test/enter', async (req, res) => {
  try {
    await setMeetingStatus('local-test');
    res.json({
      success: true,
      message: 'Atividade de reunião ativada'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Teste local: simula saída da reunião
server.get('/test/leave', async (req, res) => {
  try {
    await clearMeetingStatus();
    res.json({
      success: true,
      message: 'Atividade de reunião removida'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

  server.all('/webhook', async (req, res) => {
    const payload = { ...req.query, ...(req.body || {}) };
    const event = normalizeEvent(payload);
    console.log('[Webhook] Recebido:', JSON.stringify(payload));

    try {
      if (event === 'heartbeat') {
        lastHeartbeat = Date.now();
        const changed = updateMeetingInfo(payload);
        if (!meetingStartedAt) await setMeetingStatus('heartbeat');
        else if (changed) applyActivity();
        return res.json({ success: true, status: 'meeting' });
      }
      if (isEnter(event)) {
        updateMeetingInfo(payload);
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
