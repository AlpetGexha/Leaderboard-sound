'use strict';
const { parseWebhook } = require('../../adapter');
const { sendJson } = require('../http/responses');

async function ingestEventAction(context) {
  const { res, body, deps } = context;
  const { config, store, arena, sse, now, logger } = deps;

  const parsed = parseWebhook(body, config.agents);
  if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });
  parsed.event.ts = now();

  const { accepted, announcements } = arena.applyEvent(parsed.event);
  if (accepted) {
    store.append(parsed.event);
    sse.broadcast(arena.snapshot({ announcements }));
    logger.log(`[arena] ${parsed.event.type} ${parsed.event.ticketId} by ${parsed.event.agent}` +
      (announcements[0] ? ` -> ${announcements[0].title}` : ''));
  }
  return sendJson(res, 200, { accepted });
}

module.exports = { ingestEventAction };
