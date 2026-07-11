'use strict';
const { createDay, applyEvent, publicState, dayKey, calculateAwards } = require('../../engine');

function feature(config, name) {
  return config.features?.[name] !== false;
}

function localMinutes(ts, timezone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(ts));
  const get = type => Number(parts.find(part => part.type === type).value);
  return get('hour') * 60 + get('minute');
}

function configuredMinutes(value = '17:00') {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return 17 * 60;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? hour * 60 + minute : 17 * 60;
}

function createArenaState({ config, store, now = Date.now, logger = console, onDayRoll = () => {}, onCeremony = () => {} }) {
  const applyOptions = {
    templates: config.announcements && config.announcements.templates,
    tiers: config.announcements && config.announcements.tiers,
    comebacks: config.announcements && config.announcements.comebacks,
    comebackAnnouncements: feature(config, 'comebackAnnouncements'),
    comebackCooldownSeconds: config.featureSettings?.comebackCooldownSeconds ?? 60
  };
  const features = {
    inboxInvasion: feature(config, 'inboxInvasion'),
    comebackAnnouncements: feature(config, 'comebackAnnouncements'),
    endOfDayAwards: feature(config, 'endOfDayAwards')
  };
  const featureSettings = {
    comebackCooldownSeconds: config.featureSettings?.comebackCooldownSeconds ?? 60,
    awardsTime: config.featureSettings?.awardsTime || '17:00'
  };
  const awardsMinute = configuredMinutes(featureSettings.awardsTime);

  let currentDay = dayKey(now(), config.timezone);
  let state = createDay(config.agents);
  let ceremony = null;

  function ceremonyFromLog() {
    if (!features.endOfDayAwards || localMinutes(now(), config.timezone) < awardsMinute) return null;
    const frozen = createDay(config.agents);
    for (const event of store.todayEvents(now())) {
      if (localMinutes(event.ts, config.timezone) < awardsMinute) applyEvent(frozen, event, applyOptions);
    }
    const result = calculateAwards(frozen, currentDay);
    if (!result) return null;
    const lines = config.announcements?.awards || {};
    result.awards = result.awards.map(award => ({
      ...award,
      line: String(lines[award.key] || '{winner} wins {title}!').replace(/\{(\w+)\}/g, (_, key) =>
        String({ winner: award.winner, title: award.title, detail: award.detail }[key] || ''))
    }));
    return result;
  }

  function rebuildFromLog() {
    state = createDay(config.agents);
    for (const event of store.todayEvents(now())) applyEvent(state, event, applyOptions);
    ceremony = ceremonyFromLog();
  }

  function snapshot(extra = {}) {
    return {
      day: currentDay,
      state: publicState(state),
      config: { agents: config.agents, services: config.services, announcer: config.announcer, features, featureSettings },
      ceremony: features.endOfDayAwards ? ceremony : null,
      announcements: [],
      effects: [],
      ...extra
    };
  }

  function ensureCurrentDay({ notify = true } = {}) {
    const today = dayKey(now(), config.timezone);
    if (today === currentDay) {
      ensureCeremony();
      return false;
    }
    currentDay = today;
    state = createDay(config.agents);
    ceremony = null;
    logger.log(`[arena] day rolled to ${today} - board reset`);
    // Reports the roll outward rather than broadcasting itself, so this service
    // never depends on the SSE hub.
    if (notify) onDayRoll(snapshot({ dayRolled: true }));
    return true;
  }

  function ensureCeremony() {
    if (ceremony || !features.endOfDayAwards || localMinutes(now(), config.timezone) < awardsMinute) return false;
    ceremony = ceremonyFromLog();
    if (ceremony) onCeremony(snapshot());
    return Boolean(ceremony);
  }

  function reset() {
    state = createDay(config.agents);
    ceremony = null;
  }

  rebuildFromLog();

  return {
    snapshot,
    ensureCurrentDay,
    reset,
    applyEvent: event => {
      if (features.endOfDayAwards && !ceremony && localMinutes(event.ts, config.timezone) >= awardsMinute) {
        ceremony = ceremonyFromLog();
        if (ceremony) onCeremony(snapshot());
      }
      return applyEvent(state, event, applyOptions);
    },
    ensureCeremony
  };
}

module.exports = { createArenaState, localMinutes, configuredMinutes };
