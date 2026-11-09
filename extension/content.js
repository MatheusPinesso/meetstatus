// Detecta se esta aba do Meet está em uma chamada e avisa o background.
const MEETING_RE = /^\/(?:meet\/|lookup\/)?([a-z]{3}-[a-z]{4}-[a-z]{3})(?:$|[/?])/i;

// Botão "Sair da chamada" só existe quando você está dentro da chamada
// (não no lobby nem na tela "você saiu").
const LEAVE_SELECTOR = [
  'button[jsname="CQylAd"]',
  '[aria-label*="Leave call" i]',
  '[aria-label*="Sair da chamada" i]',
  '[aria-label*="Salir de la llamada" i]',
  '[aria-label*="Quitter l\'appel" i]',
  '[aria-label*="Anruf verlassen" i]',
  '[aria-label*="Esci dalla chiamata" i]'
].join(',');

function currentState() {
  const m = location.pathname.match(MEETING_RE);
  if (!m) return { inCall: false, meetingId: null };
  return { inCall: !!document.querySelector(LEAVE_SELECTOR), meetingId: m[1].toLowerCase() };
}

// Título da reunião: vem do título da aba (ex.: "Daily - Meet"). Ignora o genérico.
function getTitle(meetingId) {
  let t = (document.title || '').trim();
  t = t.replace(/^(google\s+)?meet\s*[-–—:]\s*/i, '').replace(/\s*[-–—]\s*(google\s+)?meet$/i, '').trim();
  if (!t || /^(google\s+)?meet$/i.test(t)) return null;
  if (meetingId && t.toLowerCase().includes(meetingId)) return null;
  if (/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(t)) return null;
  return t.slice(0, 100);
}

// Nº de participantes: badge do botão "Pessoas"; fallback: tiles de vídeo distintos.
const PEOPLE_RE = /(people|pessoas|participants|participantes|show everyone|mostrar todos|everyone|todos)/i;
function getParticipants() {
  for (const el of document.querySelectorAll('button[aria-label], [role="button"][aria-label]')) {
    if (!PEOPLE_RE.test(el.getAttribute('aria-label'))) continue;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const txt = walker.currentNode.textContent.trim();
      if (/^\d{1,4}$/.test(txt)) return Number(txt);
    }
  }
  const ids = new Set();
  document.querySelectorAll('[data-participant-id]').forEach((n) => ids.add(n.getAttribute('data-participant-id')));
  return ids.size || null;
}

function report() {
  const { inCall, meetingId } = currentState();
  const title = inCall ? getTitle(meetingId) : null;
  const participants = inCall ? getParticipants() : null;
  console.debug('[Meet Discord Status]', { inCall, meetingId, title, participants });
  try {
    chrome.runtime.sendMessage({ type: 'state', inCall, meetingId, title, participants, url: location.href });
  } catch (_) { /* extensão recarregada; ignora */ }
}

report();
setInterval(report, 5000);
document.addEventListener('visibilitychange', report);
window.addEventListener('pagehide', () => {
  try { chrome.runtime.sendMessage({ type: 'state', inCall: false, meetingId: null }); } catch (_) {}
});
