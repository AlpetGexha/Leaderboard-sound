'use strict';
const fs = require('node:fs');
const path = require('node:path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.json': 'application/json'
};

function isInside(file, root) {
  return file === root || file.startsWith(root + path.sep);
}

function serveFileFrom(res, root, urlPath, defaultFile = null) {
  const rawRel = defaultFile && urlPath === '/' ? defaultFile : urlPath.replace(/^\/+/, '');
  const rel = decodeURIComponent(rawRel);
  const file = path.resolve(path.join(root, rel));
  if (!isInside(file, root)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

module.exports = { MIME, isInside, serveFileFrom };
