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
const DEFAULT_TEAM_COMBOS = [
  { count: 3, title: 'TEAM STRIKE', line: 'Team Strike! {count} tickets solved together!' },
  { count: 5, title: 'INBOX PURGE', line: 'Inbox Purge! The team has reached a {count} solve combo!' },
  { count: 10, title: 'TOTAL ANNIHILATION', line: 'Total Annihilation! {count} team solves in a row!' }
];

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
    tiers: { ...TIERS, ...(options.tiers || {}) },
    comebacks: options.comebacks || {},
    comebackAnnouncements: options.comebackAnnouncements !== false,
    comebackCooldownSeconds: options.comebackCooldownSeconds ?? 60,
    urgentBossAnnouncements: options.urgentBossAnnouncements !== false,
    boss: options.boss || {},
    teamCombos: options.teamCombos !== false,
    teamComboWindowSeconds: options.teamComboWindowSeconds ?? 30,
    teamComboMilestones: Array.isArray(options.teamComboMilestones)
      ? options.teamComboMilestones : DEFAULT_TEAM_COMBOS
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
    activeTickets: new Map(),
    serviceResolutions: Object.fromEntries(agents.map(agent => [agent, {}])),
    matchedResolutions: Object.fromEntries(agents.map(agent => [agent, 0])),
    hasSolved: new Set(),
    worstRank: {},
    lastComebackAt: -Infinity,
    teamComboCount: 0,
    lastTeamSolveAt: -Infinity,
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

function announcementMeta(event, suffix = '') {
  return {
    eventId: event.id,
    ticketId: event.ticketId,
    ts: event.ts,
    announcementId: `${event.id}${suffix}`
  };
}

function applyEvent(state, event, options = {}) {
  const announce = announcementOptions(options);
  const announcements = [];
  if (!state.agents.includes(event.agent)) return { accepted: false, announcements };

  if (event.type === 'ticket.created') {
    if (state.createdIds.has(event.ticketId)) return { accepted: false, announcements };
    state.createdIds.add(event.ticketId);
    state.activeTickets.set(event.ticketId, {
      ticketId: event.ticketId, service: event.service, agent: event.agent,
      priority: event.priority || 'medium', ts: event.ts
    });
    announcements.push({
      ...announcementMeta(event, ':new_ticket'),
      kind: 'new_ticket', agent: event.agent, service: event.service,
      title: 'NEW TICKET',
      line: formatLine(announce.templates.new_ticket || 'New ticket by {name}', event, {
        title: 'NEW TICKET',
        sound: 'NEW TICKET'
      })
    });
    if (announce.urgentBossAnnouncements && (event.priority || 'medium') === 'urgent') {
      announcements.push({
        ...announcementMeta(event, ':urgent_boss_spawned'), kind: 'urgent_boss_spawned',
        agent: event.agent, service: event.service, title: 'URGENT BOSS',
        line: formatLine(announce.boss.spawned || 'An urgent boss has entered the arena!', event)
      });
    }
    pushFeed(state, event, 'opened');
    return { accepted: true, announcements, effects: [{ type: 'monster_spawned', ticketId: event.ticketId }] };
  }

  if (event.type === 'ticket.resolved') {
    if (state.resolvedIds.has(event.ticketId)) return { accepted: false, announcements };
    const before = publicState(state).leaderboard;
    const matched = state.activeTickets.get(event.ticketId);
    state.resolvedIds.add(event.ticketId);
    state.activeTickets.delete(event.ticketId);
    state.counts[event.agent] += 1;
    state.reachedAt[event.agent] = event.ts;
    const count = state.counts[event.agent];
    state.serviceResolutions[event.agent][event.service] =
      (state.serviceResolutions[event.agent][event.service] || 0) + 1;
    if (matched) state.matchedResolutions[event.agent] += 1;
    if (!state.firstBlood) {
      state.firstBlood = { agent: event.agent, service: event.service, ts: event.ts };
      announcements.push({
        ...announcementMeta(event, ':first_blood'),
        kind: 'first_blood', agent: event.agent, service: event.service,
        title: 'FIRST BLOOD',
        line: formatLine(announce.templates.first_blood || 'First blood on {service} by {name}', event, {
          title: 'FIRST BLOOD',
          sound: 'FIRST BLOOD'
        })
      });
    }
    // Every solve announces something: named tiers (double kill, rampage, ...)
    // use their own line, other counts fall back to the base SOLVED tier so
    // the streak never goes silent.
    const tier = announce.tiers[count] || announce.tiers[1];
    if (tier) {
      announcements.push({
        ...announcementMeta(event, `:tier:${count}`),
        kind: 'tier', count, agent: event.agent, service: event.service,
        title: tier.name,
        line: formatLine(tier.line, event, { count, title: tier.name, sound: tier.name })
      });
    }
    if (announce.urgentBossAnnouncements && matched?.priority === 'urgent') {
      announcements.push({
        ...announcementMeta(event, ':urgent_boss_defeated'), kind: 'urgent_boss_defeated',
        agent: event.agent, service: matched.service, title: 'BOSS DEFEATED',
        line: formatLine(announce.boss.defeated || 'The SLA Apocalypse has been defeated by {name}!', event)
      });
    }
    if (announce.teamCombos) {
      const windowMs = Math.max(0, Number(announce.teamComboWindowSeconds) || 0) * 1000;
      state.teamComboCount = event.ts - state.lastTeamSolveAt <= windowMs ? state.teamComboCount + 1 : 1;
      state.lastTeamSolveAt = event.ts;
      const milestone = announce.teamComboMilestones.find(item => Number(item?.count) === state.teamComboCount);
      if (milestone) {
        announcements.push({
          ...announcementMeta(event, `:team_combo:${state.teamComboCount}`), kind: 'team_combo',
          count: state.teamComboCount, agent: event.agent, service: event.service,
          title: milestone.title || `TEAM COMBO x${state.teamComboCount}`,
          line: formatLine(milestone.line || 'The team has reached a {count} solve combo!', event,
            { count: state.teamComboCount })
        });
      }
    }
    state.hasSolved.add(event.agent);
    const after = publicState(state).leaderboard;
    for (const row of after) {
      if (state.hasSolved.has(row.agent)) {
        state.worstRank[row.agent] = Math.max(state.worstRank[row.agent] || 0, row.rank);
      }
    }
    const oldRank = before.find(row => row.agent === event.agent).rank;
    const newRank = after.find(row => row.agent === event.agent).rank;
    const cooldownMs = announce.comebackCooldownSeconds * 1000;
    if (announce.comebackAnnouncements && newRank < oldRank && event.ts - state.lastComebackAt >= cooldownMs) {
      let key = 'climbing';
      let title = 'COMEBACK';
      if (newRank === 1) { key = 'crown'; title = 'CROWN STOLEN'; }
      else if (oldRank === state.agents.length) { key = 'basement'; title = 'ESCAPED THE BASEMENT'; }
      const defaults = {
        crown: '{name} has stolen the crown!',
        basement: '{name} has escaped the basement!',
        climbing: '{name} is climbing the leaderboard!'
      };
      announcements.push({
        ...announcementMeta(event, `:comeback:${key}`), kind: 'comeback', agent: event.agent,
        service: event.service, title,
        line: formatLine(announce.comebacks[key] || defaults[key], event)
      });
      state.lastComebackAt = event.ts;
    }
    pushFeed(state, event, 'solved');
    return {
      accepted: true, announcements,
      effects: matched ? [{ type: 'monster_defeated', ticketId: event.ticketId, agent: event.agent }] : []
    };
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

  const enemies = [...state.activeTickets.values()]
    .sort((a, b) => a.ts - b.ts || a.ticketId.localeCompare(b.ticketId))
    .slice(0, 8);
  return {
    leaderboard, firstBlood: state.firstBlood, feed: state.feed,
    invasion: { activeCount: state.activeTickets.size, enemies }
  };
}

function calculateAwards(state, day) {
  const leaderboard = publicState(state).leaderboard;
  const ranks = Object.fromEntries(leaderboard.map(row => [row.agent, row.rank]));
  const awards = [];
  const add = (key, title, winner, detail = '') => {
    if (winner) awards.push({ key, title, winner, detail });
  };

  if (leaderboard[0]?.solved > 0) add('mvp', 'MVP', leaderboard[0].agent, `${leaderboard[0].solved} solved`);
  add('firstBlood', 'FIRST BLOOD', state.firstBlood?.agent, state.firstBlood?.service || '');

  let comeback = null;
  for (const row of leaderboard) {
    if (!state.hasSolved.has(row.agent)) continue;
    const recovery = (state.worstRank[row.agent] || row.rank) - row.rank;
    if (recovery <= 0) continue;
    if (!comeback || recovery > comeback.recovery || (recovery === comeback.recovery && row.rank < comeback.rank)) {
      comeback = { agent: row.agent, recovery, rank: row.rank };
    }
  }
  add('comebackPlayer', 'COMEBACK PLAYER', comeback?.agent,
    comeback ? `${comeback.recovery} places recovered` : '');

  let specialist = null;
  for (const agent of state.agents) {
    for (const [service, count] of Object.entries(state.serviceResolutions[agent])) {
      if (!specialist || count > specialist.count || (count === specialist.count && ranks[agent] < specialist.rank)) {
        specialist = { agent, service, count, rank: ranks[agent] };
      }
    }
  }
  add('serviceSpecialist', 'SERVICE SPECIALIST', specialist?.agent,
    specialist ? `${specialist.count} on ${specialist.service}` : '');

  const slayer = leaderboard.reduce((best, row) => {
    const count = state.matchedResolutions[row.agent];
    return count > 0 && (!best || count > best.count) ? { agent: row.agent, count } : best;
  }, null);
  add('inboxSlayer', 'INBOX SLAYER', slayer?.agent,
    slayer ? `${slayer.count} enemies defeated` : '');
  return awards.length ? { id: `awards:${day}`, day, awards } : null;
}

module.exports = { TIERS, DEFAULT_TEAM_COMBOS, dayKey, createDay, applyEvent, publicState, calculateAwards };
