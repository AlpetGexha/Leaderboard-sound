'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createStore } = require('./lib/store');
const { createArenaServer } = require('./lib/http-server');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const DEV = process.env.DEV === '1';
// env var overrides the config value; config default is a dev placeholder for LAN use
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || config.webhookSecret;
const store = createStore(path.join(__dirname, 'data', 'events.jsonl'), config.timezone);

const { server, snapshot } = createArenaServer({
  config,
  store,
  publicDir: path.join(__dirname, 'public'),
  dev: DEV,
  webhookSecret: WEBHOOK_SECRET
});

server.listen(config.port, () => {
  console.log(`
  TICKET ARENA  |  http://localhost:${config.port}  |  day: ${snapshot().day}  |  DEV: ${DEV ? 'ON' : 'off'}
  `);
});
