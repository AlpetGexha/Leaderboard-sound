'use strict';

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function sendAudio(res, buf) {
  res.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'Content-Length': buf.length,
    'Cache-Control': 'private, max-age=86400'
  });
  res.end(buf);
}

function sendText(res, status, text) {
  res.writeHead(status);
  res.end(text);
}

// Applies a guard rejection, which is either { status, json } or { status, text }.
function sendRejection(res, rejection) {
  if (rejection.json !== undefined) return sendJson(res, rejection.status, rejection.json);
  return sendText(res, rejection.status, rejection.text ?? '');
}

module.exports = { sendJson, sendAudio, sendText, sendRejection };
