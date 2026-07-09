'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FISH_TTS_URL = 'https://api.fish.audio/v1/tts';

function voiceForAnnouncement(announcement = {}, fishAudio = {}) {
  const voices = fishAudio.voices || {};
  if (announcement.kind === 'tier') return voices.solved || voices.default;
  if (announcement.kind === 'first_blood') return voices.first_blood || voices.default;
  if (announcement.kind === 'new_ticket') return voices.custom || voices.default;
  return voices.default;
}

function cacheKey(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function createFishTts({
  apiKey,
  fishAudio = {},
  cacheDir = path.join(__dirname, '..', 'data', 'tts-cache'),
  fetchImpl = fetch
} = {}) {
  async function synthesize({ text, announcement = {} }) {
    if (!apiKey) {
      const err = new Error('Fish Audio API key is not configured');
      err.statusCode = 503;
      throw err;
    }
    const referenceId = voiceForAnnouncement(announcement, fishAudio);
    if (!referenceId) {
      const err = new Error('Fish Audio reference voice is not configured');
      err.statusCode = 503;
      throw err;
    }

    const model = fishAudio.model || 's2.1-pro-free';
    const body = {
      text,
      reference_id: referenceId,
      temperature: fishAudio.temperature ?? 0.75,
      top_p: fishAudio.top_p ?? 0.7,
      prosody: {
        speed: fishAudio.speed ?? 1,
        volume: fishAudio.volume ?? 0,
        normalize_loudness: true
      },
      normalize: true,
      format: 'mp3',
      mp3_bitrate: fishAudio.mp3_bitrate || 128,
      latency: fishAudio.latency || 'balanced'
    };
    const key = cacheKey({ model, body });
    const file = path.join(cacheDir, `${key}.mp3`);
    if (fs.existsSync(file)) return fs.readFileSync(file);

    const response = await fetchImpl(FISH_TTS_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'model': model
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const message = await response.text().catch(() => '');
      const err = new Error(`Fish Audio TTS failed: ${response.status} ${message}`.trim());
      err.statusCode = response.status;
      throw err;
    }

    const audio = Buffer.from(await response.arrayBuffer());
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(file, audio);
    return audio;
  }

  return { synthesize, voiceForAnnouncement };
}

module.exports = { createFishTts, voiceForAnnouncement, FISH_TTS_URL };
