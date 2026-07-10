'use strict';

async function ttsConfiguredGuard(context) {
  if (context.deps.fishTts) return null;
  return { status: 503, json: { error: 'tts not configured' } };
}

module.exports = { ttsConfiguredGuard };
