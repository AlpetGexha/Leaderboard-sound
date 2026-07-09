'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { loadEnvFile } = require('./lib/env');
const { createStore } = require('./lib/store');
const { createArenaServer } = require('./lib/http-server');
const { createFishTts } = require('./lib/fish-tts');

loadEnvFile(path.join(__dirname, '.env'));
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const DEV = process.env.DEV === '1';
// env var overrides the config value; config default is a dev placeholder for LAN use
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || config.webhookSecret;
const FISH_API_KEY = process.env.FISH_API_KEY || process.env.FISH_AUDIO_SECRET;
const store = createStore(path.join(__dirname, 'data', 'events.jsonl'), config.timezone);
const fishTts = createFishTts({
  apiKey: FISH_API_KEY,
  fishAudio: config.fishAudio,
  cacheDir: path.join(__dirname, 'data', 'tts-cache')
});

const { server, snapshot } = createArenaServer({
  config,
  store,
  publicDir: path.join(__dirname, 'dist'),
  soundDir: path.join(__dirname, 'sound'),
  dev: DEV,
  webhookSecret: WEBHOOK_SECRET,
  fishTts
});

server.listen(config.port, () => {
  console.log(`
  TICKET ARENA  |  http://localhost:${config.port}  |  day: ${snapshot().day}  |  DEV: ${DEV ? 'ON' : 'off'}
  `);
});
