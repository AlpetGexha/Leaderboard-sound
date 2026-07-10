'use strict';
const http = require('node:http');
const path = require('node:path');
const { createRouter } = require('./router');
const { createArenaState } = require('./services/arenaState');
const { createSseHub } = require('./services/sseHub');
const { ensureDayGuard } = require('./guards/ensureDay');
const { webhookSecretGuard } = require('./guards/webhookSecret');
const { devOnlyGuard } = require('./guards/devOnly');
const { jsonBodyGuard } = require('./guards/jsonBody');
const { ttsConfiguredGuard } = require('./guards/ttsConfigured');
const { ingestEventAction } = require('./actions/ingestEvent');
const { getStateAction } = require('./actions/getState');
const { ttsAction } = require('./actions/tts');
const { sseAction } = require('./actions/sse');
const { resetDayAction } = require('./actions/resetDay');
const { serveSoundAction, servePublicAction } = require('./actions/serveStatic');

const DAY_ROLL_INTERVAL_MS = 30000;

function createArenaServer({
  config,
  store,
  publicDir = path.join(__dirname, '..', '..', 'public'),
  soundDir = path.join(__dirname, '..', '..', 'sound'),
  dev = false,
  webhookSecret = config.webhookSecret,
  fishTts = null,
  now = Date.now,
  logger = console
}) {
  const sse = createSseHub();
  const arena = createArenaState({
    config,
    store,
    now,
    logger,
    onDayRoll: snap => sse.broadcast(snap)
  });

  const deps = {
    config,
    store,
    arena,
    sse,
    fishTts,
    dev,
    webhookSecret,
    now,
    logger,
    publicDir: path.resolve(publicDir),
    soundDir: path.resolve(soundDir)
  };

  // ensureDayGuard leads the three routes that rolled the day in the original,
  // and must precede webhookSecretGuard so a bad-secret request arriving across
  // midnight still resets the board.
  const routes = [
    { method: 'POST', path: '/api/events', guards: [ensureDayGuard, webhookSecretGuard, jsonBodyGuard], action: ingestEventAction },
    { method: 'GET', path: '/api/state', guards: [ensureDayGuard], action: getStateAction },
    { method: ['GET', 'POST'], path: '/api/tts', guards: [ttsConfiguredGuard], action: ttsAction },
    { method: 'GET', path: '/events', guards: [ensureDayGuard], action: sseAction },
    { method: 'POST', path: '/api/dev/reset', guards: [devOnlyGuard], action: resetDayAction },
    { method: 'GET', prefix: '/sound/', action: serveSoundAction },
    { method: 'GET', action: servePublicAction }
  ];

  const server = http.createServer(createRouter(routes, deps));

  const dayRollTimer = setInterval(() => arena.ensureCurrentDay(), DAY_ROLL_INTERVAL_MS);
  if (dayRollTimer.unref) dayRollTimer.unref();
  server.on('close', () => clearInterval(dayRollTimer));

  return {
    server,
    snapshot: arena.snapshot,
    ensureCurrentDay: arena.ensureCurrentDay
  };
}

module.exports = { createArenaServer };
