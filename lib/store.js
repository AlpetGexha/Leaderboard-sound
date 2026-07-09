'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { dayKey } = require('./engine');

function createStore(filePath, timezone) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  function readAll() {
    if (!fs.existsSync(filePath)) return [];
    return fs.readFileSync(filePath, 'utf8')
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try { return JSON.parse(line); }
        catch { console.warn('store: skipping malformed line'); return null; }
      })
      .filter(Boolean);
  }

  return {
    todayEvents(now = Date.now()) {
      const today = dayKey(now, timezone);
      return readAll().filter(e => e && e.ts && dayKey(e.ts, timezone) === today);
    },
    append(event) {
      fs.appendFileSync(filePath, JSON.stringify(event) + '\n');
    },
    clear() {
      fs.writeFileSync(filePath, '');
    }
  };
}

module.exports = { createStore };
