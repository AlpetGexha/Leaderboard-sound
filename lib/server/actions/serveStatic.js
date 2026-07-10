'use strict';
const { serveFileFrom } = require('../services/staticFiles');

async function serveSoundAction(context) {
  const { res, url, deps } = context;
  return serveFileFrom(res, deps.soundDir, url.pathname.replace(/^\/sound\/?/, ''));
}

async function servePublicAction(context) {
  const { res, url, deps } = context;
  return serveFileFrom(res, deps.publicDir, url.pathname, 'index.html');
}

module.exports = { serveSoundAction, servePublicAction };
