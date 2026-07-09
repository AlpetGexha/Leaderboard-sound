'use strict';
const crypto = require('node:crypto');

const TYPES = new Set(['ticket.created', 'ticket.resolved']);

// The single seam between the outside world and the game engine.
// A future helpdesk (or Laravel port) only needs to satisfy this contract.
function parseWebhook(body, agents) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'body must be a JSON object' };
  }
  const { type, agent, service, ticketId } = body;
  if (!TYPES.has(type)) {
    return { ok: false, error: `type must be one of: ${[...TYPES].join(', ')}` };
  }
  const canonical = agents.find(a => a.toLowerCase() === String(agent ?? '').trim().toLowerCase());
  if (!canonical) {
    return { ok: false, error: `unknown agent: ${String(agent)}` };
  }
  const tid = String(ticketId ?? '').trim();
  if (!tid || tid === 'undefined' || tid === 'null') {
    return { ok: false, error: 'ticketId is required' };
  }
  const svc = String(service ?? '').trim();
  return {
    ok: true,
    event: {
      id: crypto.randomUUID(),
      type,
      agent: canonical,
      service: svc || 'General',
      ticketId: tid,
      ts: Date.now()
    }
  };
}

module.exports = { parseWebhook };
