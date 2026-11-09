const WEBHOOK = 'http://127.0.0.1:3210/webhook';
const STALE_MS = 150000; // aba sem reportar por esse tempo = fora da chamada
const KEY = 'tabs';

// Serializa tudo para evitar corrida entre eventos.
let chain = Promise.resolve();
const queue = (fn) => (chain = chain.then(fn).catch((e) => console.error(e)));

async function load() {
  const o = await chrome.storage.session.get(KEY);
  return o[KEY] || {};
}
const save = (tabs) => chrome.storage.session.set({ [KEY]: tabs });

async function send(event, meetingId, info = {}) {
  const body = JSON.stringify({
    event, platform: 'meet', meetingId: meetingId || null,
    title: info.title || null, participants: info.participants ?? null, timestamp: new Date().toISOString()
  });
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(WEBHOOK, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body
      });
      if (r.ok) return true;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 500 * (i + 1)));
  }
  return false;
}

// Aplica um novo mapa de abas em chamada, enviando enter/leave nas transições.
async function commit(before, after) {
  const was = Object.keys(before).length > 0;
  const now = Object.keys(after).length > 0;
  await save(after);
  if (!was && now) await send('enter', Object.values(after)[0].meetingId, Object.values(after)[0]);
  else if (was && !now) await send('leave', Object.values(before)[0].meetingId);
}

function setTabState(tabId, inCall, meetingId, info = {}) {
  return queue(async () => {
    const before = await load();
    const after = { ...before };
    if (inCall) after[tabId] = { meetingId, lastSeen: Date.now(), title: info.title, participants: info.participants };
    else delete after[tabId];
    await commit(before, after);
  });
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === 'state' && sender.tab?.id != null) {
    setTabState(sender.tab.id, !!msg.inCall, msg.meetingId, msg);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => setTabState(tabId, false));
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.url && !info.url.startsWith('https://meet.google.com/')) setTabState(tabId, false);
});

// Heartbeat + limpeza de abas "fantasma". O app limpa sozinho sem heartbeat.
chrome.alarms.create('tick', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name !== 'tick') return;
  queue(async () => {
    const before = await load();
    const after = {};
    for (const [id, t] of Object.entries(before)) {
      if (Date.now() - t.lastSeen > STALE_MS) continue;
      try { await chrome.tabs.get(Number(id)); after[id] = t; } catch (_) {}
    }
    await commit(before, after);
    if (Object.keys(after).length) await send('heartbeat', Object.values(after)[0].meetingId, Object.values(after)[0]);
  });
});
