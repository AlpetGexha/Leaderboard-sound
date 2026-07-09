(function () {
  'use strict';

  const board = document.getElementById('board');
  const feed = document.getElementById('feed');
  const dayLabel = document.getElementById('day-label');
  const fbChip = document.getElementById('first-blood-chip');
  const connDot = document.getElementById('conn-dot');
  const gate = document.getElementById('unlock-gate');

  let lastSolved = {};   // agent -> solved count, to detect who scored

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' });
  }

  // ---- render with FLIP rank animation ----
  function render(snapshot) {
    const { state, day } = snapshot;
    dayLabel.textContent = day;

    if (state.firstBlood) {
      fbChip.innerHTML = `🩸 FIRST BLOOD: <strong>${esc(state.firstBlood.agent)}</strong> on ${esc(state.firstBlood.service)}`;
      fbChip.classList.remove('hidden');
    } else {
      fbChip.classList.add('hidden');
    }

    // FLIP: capture old row positions
    const oldTops = {};
    for (const row of board.children) oldTops[row.dataset.agent] = row.getBoundingClientRect().top;

    board.innerHTML = state.leaderboard.map(r => `
      <li class="board-row ${r.rank === 1 && r.solved > 0 ? 'top1' : ''}" data-agent="${esc(r.agent)}">
        <span class="rank">#${r.rank}</span>
        <span class="agent">${esc(r.agent)} ${r.streak ? '<span class="streak-badge">🔥</span>' : ''}</span>
        <span class="solved">${r.solved}</span>
      </li>`).join('');

    // FLIP: invert + play
    for (const row of board.children) {
      const agent = row.dataset.agent;
      const oldTop = oldTops[agent];
      if (oldTop !== undefined) {
        const delta = oldTop - row.getBoundingClientRect().top;
        if (delta) {
          row.style.transform = `translateY(${delta}px)`;
          requestAnimationFrame(() => {
            row.classList.add('moving');
            row.style.transform = '';
            row.addEventListener('transitionend', () => row.classList.remove('moving'), { once: true });
          });
        }
      }
      // glow whoever's count went up
      const solved = state.leaderboard.find(r => r.agent === agent).solved;
      if (lastSolved[agent] !== undefined && solved > lastSolved[agent]) {
        row.classList.add('scored');
        row.addEventListener('animationend', () => row.classList.remove('scored'), { once: true });
      }
    }
    lastSolved = Object.fromEntries(state.leaderboard.map(r => [r.agent, r.solved]));

    feed.innerHTML = state.feed.map(f => {
      const cls = f.label === 'FIRST BLOOD' ? 'blood' : f.label === 'solved' ? 'solved' : 'opened';
      return `<li><span><span class="who">${esc(f.agent)}</span> <span class="what ${cls}">${esc(f.label)}</span> ${esc(f.ticketId)} <em>${esc(f.service)}</em></span><time>${fmtTime(f.ts)}</time></li>`;
    }).join('');
  }

  // ---- live connection ----
  function connect() {
    const es = new EventSource('/events');
    es.onopen = () => {
      connDot.classList.add('live');
      // catch up in case we missed events while disconnected
      fetch('/api/state').then(r => r.json()).then(render).catch(() => {});
    };
    es.onerror = () => connDot.classList.remove('live'); // EventSource auto-reconnects
    es.onmessage = e => {
      const msg = JSON.parse(e.data);
      render(msg);
      (msg.announcements || []).forEach(a => Announcer.enqueue(a));
      if (msg.dayRolled) lastSolved = {};
    };
  }

  // ---- unlock gate ----
  document.getElementById('unlock-btn').addEventListener('click', () => {
    Announcer.unlock();
    gate.classList.add('hidden');
  });

  // ---- test panel ----
  const panel = document.getElementById('test-panel');
  const secretInput = document.getElementById('test-secret');
  const serviceSel = document.getElementById('test-service');
  const grid = document.getElementById('test-agent-grid');

  const AGENTS = ['Alpet', 'Bajram', 'Kushtrim', 'Mirlind', 'Ermira'];
  const SERVICES = ['Billing', 'Hosting', 'Domains', 'Email', 'VPN'];

  secretInput.value = localStorage.getItem('arena-secret') || 'arena-dev-secret';
  secretInput.addEventListener('change', () => localStorage.setItem('arena-secret', secretInput.value));
  serviceSel.innerHTML = SERVICES.map(s => `<option>${esc(s)}</option>`).join('');

  let ticketSeq = Math.floor(Date.now() / 1000) % 100000;
  const openTickets = {}; // agent -> last opened ticketId (so Resolve can close "their" ticket)

  async function sendEvent(type, agent) {
    let ticketId;
    if (type === 'ticket.resolved' && openTickets[agent]) {
      ticketId = openTickets[agent];
      delete openTickets[agent];
    } else {
      ticketId = `T-${++ticketSeq}`;
      if (type === 'ticket.created') openTickets[agent] = ticketId;
    }
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': secretInput.value },
      body: JSON.stringify({ type, agent, service: serviceSel.value, ticketId })
    });
    if (!res.ok) console.warn('test event rejected:', res.status, await res.text());
  }

  grid.innerHTML = AGENTS.map(a => `
    <span class="tp-name">${esc(a)}</span>
    <button data-agent="${esc(a)}" data-type="ticket.created">+ ticket</button>
    <button data-agent="${esc(a)}" data-type="ticket.resolved" class="solve">✔ resolve</button>
  `).join('');

  grid.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (btn) sendEvent(btn.dataset.type, btn.dataset.agent);
  });

  document.getElementById('test-reset').addEventListener('click', () => {
    fetch('/api/dev/reset', { method: 'POST' }).then(r => {
      if (!r.ok) alert('reset only works when server runs with DEV=1');
    });
  });

  document.addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 't' && document.activeElement.tagName !== 'INPUT') {
      panel.classList.toggle('hidden');
    }
  });
  if (new URLSearchParams(location.search).get('test') === '1') panel.classList.remove('hidden');

  // ---- boot ----
  fetch('/api/state').then(r => r.json()).then(render).catch(() => {});
  connect();
})();
