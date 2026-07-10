import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createAnnouncer } from './services/announcer/createAnnouncer.js';

// Temporary bridge: keeps the DOM banners working until hooks and components
// land in Phase 5, which deletes these along with the four refs.
function showBannerImperative(a, refs) {
  const big = a.kind === 'first_blood' || (a.kind === 'tier' && a.count >= 2);
  if (big && refs.overlayRef.current && refs.overlayTitleRef.current && refs.overlayLineRef.current) {
    refs.overlayTitleRef.current.textContent = a.title;
    refs.overlayLineRef.current.textContent = a.line;
    refs.overlayRef.current.classList.toggle('gold', a.kind === 'tier' && a.count >= 5);
    refs.overlayRef.current.classList.remove('hidden');
  } else if (refs.miniRef.current) {
    refs.miniRef.current.textContent = `${a.title} - ${a.line}`;
    refs.miniRef.current.classList.remove('hidden');
  }
}

function hideBannersImperative(refs) {
  if (refs.overlayRef.current) refs.overlayRef.current.classList.add('hidden');
  if (refs.miniRef.current) refs.miniRef.current.classList.add('hidden');
}

const DEFAULT_SERVICES = ['KFC', 'Prishtina MALL', 'JYSK', 'burgerking', 'comoditahome'];
const EMPTY_STATE = { leaderboard: [], firstBlood: null, feed: [] };

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' });
}

function servicesFrom(snapshot) {
  return snapshot?.config?.services?.length ? snapshot.config.services : DEFAULT_SERVICES;
}

function agentsFrom(snapshot) {
  if (snapshot?.config?.agents?.length) return snapshot.config.agents;
  return (snapshot?.state?.leaderboard || []).map(row => row.agent);
}

function Header({ snapshot, live }) {
  const firstBlood = snapshot?.state?.firstBlood;
  return (
    <header>
      <h1 className="site-title">TICKET <span className="accent">ARENA</span></h1>
      <div className="header-meta">
        <span className="day-label">{snapshot?.day || ''}</span>
        <span className={`fb-chip ${firstBlood ? '' : 'hidden'}`}>
          {firstBlood ? <>FIRST BLOOD: <strong>{firstBlood.agent}</strong> on {firstBlood.service}</> : null}
        </span>
        <span className={`conn-dot ${live ? 'live' : ''}`} title="live connection" />
      </div>
    </header>
  );
}

function Leaderboard({ rows, rowRefs, scoredAgents, onScoreAnimationEnd }) {
  return (
    <section className="board-wrap">
      <ol className="board">
        {rows.map(row => (
          <li
            key={row.agent}
            ref={node => {
              if (node) rowRefs.current.set(row.agent, node);
              else rowRefs.current.delete(row.agent);
            }}
            className={[
              'board-row',
              row.rank === 1 && row.solved > 0 ? 'top1' : '',
              scoredAgents.has(row.agent) ? 'scored' : ''
            ].filter(Boolean).join(' ')}
            data-agent={row.agent}
            onAnimationEnd={() => onScoreAnimationEnd(row.agent)}
          >
            <span className="rank">#{row.rank}</span>
            <span className="agent">{row.agent} {row.streak ? <span className="streak-badge">*</span> : null}</span>
            <span className="solved">{row.solved}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function KillFeed({ feed }) {
  return (
    <aside className="feed-wrap">
      <h2 className="feed-title">KILL FEED</h2>
      <ul className="feed">
        {feed.map(item => {
          const cls = item.label === 'FIRST BLOOD' ? 'blood' : item.label === 'solved' ? 'solved' : 'opened';
          return (
            <li key={`${item.ts}-${item.ticketId}-${item.label}`}>
              <span>
                <span className="who">{item.agent}</span>{' '}
                <span className={`what ${cls}`}>{item.label}</span>{' '}
                {item.ticketId} <em>{item.service}</em>
              </span>
              <time>{fmtTime(item.ts)}</time>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function UnlockGate({ unlocked, onUnlock }) {
  return (
    <div id="unlock-gate" className={unlocked ? 'hidden' : ''}>
      <div className="gate-inner">
        <div className="gate-title">TICKET ARENA</div>
        <button id="unlock-btn" onClick={onUnlock}>CLICK TO ARM SPEAKERS</button>
        <div className="gate-hint">browser needs one click before it may play sound</div>
      </div>
    </div>
  );
}

function AnnouncementLayers({ refs }) {
  return (
    <>
      <div ref={refs.mini} className="mini-banner hidden" />
      <div ref={refs.overlay} className="announce hidden">
        <div className="announce-inner">
          <div ref={refs.overlayTitle} className="announce-title" />
          <div ref={refs.overlayLine} className="announce-line" />
        </div>
      </div>
    </>
  );
}

function TestPanel({ snapshot }) {
  const [visible, setVisible] = useState(() => new URLSearchParams(window.location.search).get('test') === '1');
  const [secret, setSecret] = useState(() => window.localStorage.getItem('arena-secret') || 'arena-dev-secret');
  const [service, setService] = useState('');
  const ticketSeqRef = useRef(Math.floor(Date.now() / 1000) % 100000);
  const openTicketsRef = useRef({});

  const agents = agentsFrom(snapshot);
  const services = servicesFrom(snapshot);
  const selectedService = service || services[0] || 'General';

  useEffect(() => {
    if (!services.includes(service)) setService(services[0] || 'General');
  }, [service, services]);

  useEffect(() => {
    function onKeyDown(event) {
      const tag = document.activeElement?.tagName;
      if (event.key.toLowerCase() === 't' && tag !== 'INPUT') setVisible(current => !current);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  function changeSecret(event) {
    setSecret(event.target.value);
    window.localStorage.setItem('arena-secret', event.target.value);
  }

  async function postTestEvent(payload, nextSecret) {
    return fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': nextSecret },
      body: JSON.stringify(payload)
    });
  }

  async function sendEvent(type, agent) {
    let ticketId;
    if (type === 'ticket.resolved' && openTicketsRef.current[agent]) {
      ticketId = openTicketsRef.current[agent];
      delete openTicketsRef.current[agent];
    } else {
      ticketId = `T-${++ticketSeqRef.current}`;
      if (type === 'ticket.created') openTicketsRef.current[agent] = ticketId;
    }
    const payload = { type, agent, service: selectedService, ticketId };
    let res = await postTestEvent(payload, secret);
    if (res.status === 401) {
      window.localStorage.removeItem('arena-secret');
      setSecret('arena-dev-secret');
      res = await postTestEvent(payload, 'arena-dev-secret');
      if (res.status === 401) {
        window.alert('Test event rejected: bad webhook secret. The server is not using arena-dev-secret.');
        return;
      }
    }
    if (!res.ok) console.warn('test event rejected:', res.status, await res.text());
  }

  function resetDay() {
    fetch('/api/dev/reset', { method: 'POST' }).then(res => {
      if (!res.ok) window.alert('reset only works when server runs with DEV=1');
    });
  }

  return (
    <div id="test-panel" className={`test-panel ${visible ? '' : 'hidden'}`}>
      <div className="tp-head">TEST PANEL <span className="tp-hint">(press T to hide)</span></div>
      <div className="tp-row">
        <label>
          service
          <select value={selectedService} onChange={event => setService(event.target.value)}>
            {services.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          secret
          <input value={secret} type="text" size="16" onChange={changeSecret} />
        </label>
        <button id="test-reset" className="tp-danger" onClick={resetDay}>RESET DAY</button>
      </div>
      <div className="tp-grid">
        {agents.map(agent => (
          <React.Fragment key={agent}>
            <span className="tp-name">{agent}</span>
            <button data-agent={agent} data-type="ticket.created" onClick={() => sendEvent('ticket.created', agent)}>+ ticket</button>
            <button data-agent={agent} data-type="ticket.resolved" className="solve" onClick={() => sendEvent('ticket.resolved', agent)}>resolve</button>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [snapshot, setSnapshot] = useState(null);
  const [live, setLive] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [scoredAgents, setScoredAgents] = useState(() => new Set());
  const rowRefs = useRef(new Map());
  const oldTopsRef = useRef({});
  const lastSolvedRef = useRef({});
  const overlayRef = useRef(null);
  const overlayTitleRef = useRef(null);
  const overlayLineRef = useRef(null);
  const miniRef = useRef(null);
  const heardAnnouncementIdsRef = useRef(new Set());

  const announcer = useMemo(() => createAnnouncer({
    onShow: a => showBannerImperative(a, { overlayRef, overlayTitleRef, overlayLineRef, miniRef }),
    onHide: () => hideBannersImperative({ overlayRef, miniRef })
  }), []);

  const captureOldTops = useCallback(() => {
    oldTopsRef.current = Object.fromEntries(
      [...rowRefs.current.entries()].map(([agent, node]) => [agent, node.getBoundingClientRect().top])
    );
  }, []);

  const applySnapshot = useCallback(next => {
    if (next?.config?.announcer) announcer.configure(next.config.announcer);
    captureOldTops();
    setSnapshot(next);
  }, [announcer, captureOldTops]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/state')
      .then(res => res.json())
      .then(next => { if (!cancelled) applySnapshot(next); })
      .catch(() => {});

    const es = new EventSource('/events');
    es.onopen = () => {
      setLive(true);
      fetch('/api/state')
        .then(res => res.json())
        .then(next => { if (!cancelled) applySnapshot(next); })
        .catch(() => {});
    };
    es.onerror = () => setLive(false);
    es.onmessage = event => {
      const msg = JSON.parse(event.data);
      if (msg.dayRolled) lastSolvedRef.current = {};
      applySnapshot(msg);
      (msg.announcements || []).forEach(item => {
        const id = item.announcementId || `${item.kind}:${item.ticketId || item.line}:${item.ts || ''}`;
        if (heardAnnouncementIdsRef.current.has(id)) return;
        heardAnnouncementIdsRef.current.add(id);
        if (heardAnnouncementIdsRef.current.size > 200) {
          const ids = [...heardAnnouncementIdsRef.current];
          heardAnnouncementIdsRef.current = new Set(ids.slice(-100));
        }
        announcer.enqueue(item);
      });
    };
    return () => {
      cancelled = true;
      if (es.close) es.close();
    };
  }, [announcer, applySnapshot]);

  useLayoutEffect(() => {
    if (!snapshot) return;
    const oldTops = oldTopsRef.current;
    for (const [agent, node] of rowRefs.current.entries()) {
      const oldTop = oldTops[agent];
      if (oldTop !== undefined) {
        const delta = oldTop - node.getBoundingClientRect().top;
        if (delta) {
          node.style.transform = `translateY(${delta}px)`;
          requestAnimationFrame(() => {
            node.classList.add('moving');
            node.style.transform = '';
            node.addEventListener('transitionend', () => node.classList.remove('moving'), { once: true });
          });
        }
      }
    }

    const increased = new Set();
    for (const row of snapshot.state.leaderboard) {
      if (lastSolvedRef.current[row.agent] !== undefined && row.solved > lastSolvedRef.current[row.agent]) {
        increased.add(row.agent);
      }
    }
    if (increased.size) setScoredAgents(increased);
    lastSolvedRef.current = Object.fromEntries(snapshot.state.leaderboard.map(row => [row.agent, row.solved]));
  }, [snapshot]);

  const state = snapshot?.state || EMPTY_STATE;

  function unlock() {
    announcer.unlock();
    setUnlocked(true);
  }

  function clearScored(agent) {
    setScoredAgents(current => {
      if (!current.has(agent)) return current;
      const next = new Set(current);
      next.delete(agent);
      return next;
    });
  }

  return (
    <>
      <UnlockGate unlocked={unlocked} onUnlock={unlock} />
      <Header snapshot={snapshot} live={live} />
      <main>
        <Leaderboard
          rows={state.leaderboard}
          rowRefs={rowRefs}
          scoredAgents={scoredAgents}
          onScoreAnimationEnd={clearScored}
        />
        <KillFeed feed={state.feed} />
      </main>
      <AnnouncementLayers refs={{
        overlay: overlayRef,
        overlayTitle: overlayTitleRef,
        overlayLine: overlayLineRef,
        mini: miniRef
      }} />
      <TestPanel snapshot={snapshot} />
    </>
  );
}
