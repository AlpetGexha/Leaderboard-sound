'use strict';

const TIERS = {
  1:  { name: 'SOLVED',        line: 'Ticket solved by {name}' },
  2:  { name: 'DOUBLE KILL',   line: 'Double kill! {name}' },
  3:  { name: 'TRIPLE KILL',   line: 'Triple kill! {name}' },
  4:  { name: 'KILLING SPREE', line: '{name} is on a killing spree!' },
  5:  { name: 'UNSTOPPABLE',   line: '{name} is unstoppable!' },
  7:  { name: 'RAMPAGE',       line: '{name} is on a rampage!' },
  10: { name: 'GODLIKE',       line: '{name} is GODLIKE!' },
  15: { name: 'MONSTER KILL',  line: 'M M M MONSTER KILL! {name}' }
};

const FEED_MAX = 8;

function formatLine(template, event, extra = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => {
    const value = {
      name: event.agent,
      agent: event.agent,
      service: event.service,
      ticketId: event.ticketId,
      type: event.type,
      ...extra
    }[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

function announcementOptions(options = {}) {
  return {
    templates: options.templates || {},
    tiers: { ...TIERS, ...(options.tiers || {}) }
  };
}

function dayKey(ts, timezone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(ts));
}

function createDay(agents) {
  return {
    agents: [...agents],
    counts: Object.fromEntries(agents.map(a => [a, 0])),
    reachedAt: {},          // agent -> ts of latest counted resolve
    createdIds: new Set(),
    resolvedIds: new Set(),
    firstBlood: null,       // { agent, service, ts }
    feed: []                // newest first
  };
}

function pushFeed(state, event, label) {
  state.feed.unshift({
    type: event.type, agent: event.agent, service: event.service,
    ticketId: event.ticketId, ts: event.ts, label
  });
  if (state.feed.length > FEED_MAX) state.feed.length = FEED_MAX;
}

function applyEvent(state, event, options = {}) {
  const announce = announcementOptions(options);
  const announcements = [];
  if (!state.agents.includes(event.agent)) return { accepted: false, announcements };

  if (event.type === 'ticket.created') {
    if (state.createdIds.has(event.ticketId)) return { accepted: false, announcements };
    state.createdIds.add(event.ticketId);
    if (!state.firstBlood) {
      state.firstBlood = { agent: event.agent, service: event.service, ts: event.ts };
      announcements.push({
        kind: 'first_blood', agent: event.agent, service: event.service,
        title: 'FIRST BLOOD',
        line: formatLine(announce.templates.first_blood || 'First blood on {service} by {name}', event, {
          title: 'FIRST BLOOD',
          sound: 'FIRST BLOOD'
        })
      });
      pushFeed(state, event, 'FIRST BLOOD');
    } else {
      announcements.push({
        kind: 'new_ticket', agent: event.agent, service: event.service,
        title: 'NEW TICKET',
        line: formatLine(announce.templates.new_ticket || 'New ticket by {name}', event, {
          title: 'NEW TICKET',
          sound: 'NEW TICKET'
        })
      });
      pushFeed(state, event, 'opened');
    }
    return { accepted: true, announcements };
  }

  if (event.type === 'ticket.resolved') {
    if (state.resolvedIds.has(event.ticketId)) return { accepted: false, announcements };
    state.resolvedIds.add(event.ticketId);
    state.counts[event.agent] += 1;
    state.reachedAt[event.agent] = event.ts;
    const count = state.counts[event.agent];
    const tier = announce.tiers[count];
    if (tier) {
      announcements.push({
        kind: 'tier', count, agent: event.agent, service: event.service,
        title: tier.name,
        line: formatLine(tier.line, event, { count, title: tier.name, sound: tier.name })
      });
    }
    pushFeed(state, event, 'solved');
    return { accepted: true, announcements };
  }

  return { accepted: false, announcements };
}

function publicState(state) {
  const leaderboard = state.agents
    .map((agent, order) => ({
      agent,
      solved: state.counts[agent],
      reachedAt: state.reachedAt[agent] ?? Number.MAX_SAFE_INTEGER,
      order
    }))
    .sort((a, b) => b.solved - a.solved || a.reachedAt - b.reachedAt || a.order - b.order)
    .map(({ agent, solved }, i) => ({ rank: i + 1, agent, solved, streak: solved >= 3 }));

  return { leaderboard, firstBlood: state.firstBlood, feed: state.feed };
}

module.exports = { TIERS, dayKey, createDay, applyEvent, publicState };
