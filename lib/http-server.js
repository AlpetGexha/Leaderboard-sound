'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createDay, applyEvent, publicState, dayKey } = require('./engine');
const { parseWebhook } = require('./adapter');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.json': 'application/json'
};

function createArenaServer({
  config,
  store,
  publicDir = path.join(__dirname, '..', 'public'),
  dev = false,
  webhookSecret = config.webhookSecret,
  now = Date.now,
  logger = console
}) {
  let currentDay = dayKey(now(), config.timezone);
  let state = createDay(config.agents);
  const sseClients = new Set();

  function rebuildFromLog() {
    state = createDay(config.agents);
    for (const event of store.todayEvents(now())) applyEvent(state, event);
  }

  function broadcast(payload) {
    const frame = `data: ${JSON.stringify(payload)}\n\n`;
    for (const res of sseClients) res.write(frame);
  }

  function snapshot(extra = {}) {
    return {
      day: currentDay,
      state: publicState(state),
      config: { agents: config.agents, services: config.services },
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
    if (notify) broadcast(snapshot({ dayRolled: true }));
    return true;
  }

  function sendJson(res, status, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => {
        data += chunk;
        if (data.length > 64 * 1024) { reject(new Error('body too large')); req.destroy(); }
      });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
  }

  function serveStatic(req, res, urlPath) {
    const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
    const file = path.normalize(path.join(publicDir, rel));
    if (!file.startsWith(publicDir)) { res.writeHead(403); return res.end('forbidden'); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(buf);
    });
  }

  rebuildFromLog();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'POST' && url.pathname === '/api/events') {
      ensureCurrentDay();
      if (webhookSecret && req.headers['x-webhook-secret'] !== webhookSecret) {
        return sendJson(res, 401, { error: 'bad secret' });
      }
      let body;
      try { body = JSON.parse(await readBody(req) || 'null'); }
      catch { return sendJson(res, 400, { error: 'invalid JSON' }); }

      const parsed = parseWebhook(body, config.agents);
      if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });
      parsed.event.ts = now();

      const { accepted, announcements } = applyEvent(state, parsed.event);
      if (accepted) {
        store.append(parsed.event);
        broadcast(snapshot({ announcements }));
        logger.log(`[arena] ${parsed.event.type} ${parsed.event.ticketId} by ${parsed.event.agent}` +
          (announcements[0] ? ` -> ${announcements[0].title}` : ''));
      }
      return sendJson(res, 200, { accepted });
    }

    if (req.method === 'GET' && url.pathname === '/api/state') {
      ensureCurrentDay();
      return sendJson(res, 200, snapshot());
    }

    if (req.method === 'GET' && url.pathname === '/events') {
      ensureCurrentDay();
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      res.write(`data: ${JSON.stringify(snapshot())}\n\n`);
      sseClients.add(res);
      const keepAlive = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => { clearInterval(keepAlive); sseClients.delete(res); });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/dev/reset') {
      if (!dev) { res.writeHead(404); return res.end('not found'); }
      store.clear();
      state = createDay(config.agents);
      broadcast(snapshot({ dayRolled: true }));
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET') return serveStatic(req, res, url.pathname);

    res.writeHead(405);
    res.end('method not allowed');
  });

  const dayRollTimer = setInterval(() => ensureCurrentDay(), 30000);
  if (dayRollTimer.unref) dayRollTimer.unref();
  server.on('close', () => clearInterval(dayRollTimer));

  return { server, snapshot, ensureCurrentDay };
}

module.exports = { createArenaServer };
