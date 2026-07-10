'use strict';
const { readBody } = require('../http/readBody');
const { sendJson, sendAudio } = require('../http/responses');

const MAX_TEXT_LENGTH = 240;

function bodyFromQuery(url) {
  return {
    text: url.searchParams.get('text'),
    announcement: {
      kind: url.searchParams.get('kind'),
      count: Number(url.searchParams.get('count')) || undefined,
      title: url.searchParams.get('title')
    }
  };
}

// Reads its own body rather than using jsonBodyGuard: GET /api/tts carries its
// payload in the query string, and a body guard would await one that never arrives.
async function ttsAction(context) {
  const { req, res, url, deps } = context;
  const { fishTts, logger } = deps;

  let body;
  if (req.method === 'GET') {
    body = bodyFromQuery(url);
  } else {
    try { body = JSON.parse((await readBody(req)) || 'null'); }
    catch { return sendJson(res, 400, { error: 'invalid JSON' }); }
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > MAX_TEXT_LENGTH) return sendJson(res, 400, { error: 'bad text' });

  try {
    const audio = await fishTts.synthesize({
      text,
      announcement: body.announcement && typeof body.announcement === 'object' ? body.announcement : {}
    });
    return sendAudio(res, audio);
  } catch (err) {
    logger.log(`[arena] fish tts failed: ${err.message}`);
    return sendJson(res, err.statusCode || 502, { error: 'tts failed' });
  }
}

module.exports = { ttsAction };
