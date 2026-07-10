'use strict';
const { createDay, applyEvent, publicState, dayKey } = require('../../engine');

function createArenaState({ config, store, now = Date.now, logger = console, onDayRoll = () => {} }) {
  const applyOptions = {
    templates: config.announcements && config.announcements.templates,
    tiers: config.announcements && config.announcements.tiers
  };

  let currentDay = dayKey(now(), config.timezone);
  let state = createDay(config.agents);

  function rebuildFromLog() {
    state = createDay(config.agents);
    for (const event of store.todayEvents(now())) applyEvent(state, event, applyOptions);
  }

  function snapshot(extra = {}) {
    return {
      day: currentDay,
      state: publicState(state),
      config: { agents: config.agents, services: config.services, announcer: config.announcer },
      announcements: [],
      ...extra
    };
  }

  function ensureCurrentDay({ notify = true } = {}) {
    const today = dayKey(now(), config.timezone);
    if (today === currentDay) return false;
    currentDay = today;
    state = createDay(config.agents);
    logger.log(`[arena] day rolled to ${today} - board reset`);
    // Reports the roll outward rather than broadcasting itself, so this service
    // never depends on the SSE hub.
    if (notify) onDayRoll(snapshot({ dayRolled: true }));
    return true;
  }

  function reset() {
    state = createDay(config.agents);
  }

  rebuildFromLog();

  return {
    snapshot,
    ensureCurrentDay,
    reset,
    applyEvent: event => applyEvent(state, event, applyOptions)
  };
}

module.exports = { createArenaState };
