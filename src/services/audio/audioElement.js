import { getAudioCtor } from './browserEnv.js';

export const AUDIO_METADATA_TIMEOUT_MS = 300;

export function makeAudio(src, { volume = 1, loop = false } = {}) {
  const AudioCtor = getAudioCtor();
  if (!src || typeof AudioCtor === 'undefined') return null;
  const audio = new AudioCtor(src);
  audio.volume = volume;
  audio.loop = loop;
  return audio;
}

export function stopAudio(audio) {
  if (!audio) return;
  if (audio.pause) audio.pause();
  try {
    audio.currentTime = 0;
  } catch (_) {
    // Some test/browser audio implementations expose currentTime as read-only.
  }
}

export function playAudio(audio) {
  if (!audio) return false;
  const started = audio.play();
  // Browsers reject play() for autoplay policy reasons the app cannot act on.
  if (started && started.catch) started.catch(() => {});
  return true;
}

export function measuredAudioMs(audio, fallbackMs) {
  return new Promise(resolve => {
    if (!audio) return resolve(0);
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      return resolve(Math.round(audio.duration * 1000));
    }

    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      const durationMs = Number.isFinite(audio.duration) && audio.duration > 0
        ? Math.round(audio.duration * 1000)
        : fallbackMs;
      resolve(durationMs);
    };

    if (audio.addEventListener) {
      audio.addEventListener('loadedmetadata', done, { once: true });
      audio.addEventListener('error', done, { once: true });
    } else {
      audio.onloadedmetadata = done;
      audio.onerror = done;
    }

    if (audio.load) audio.load();
    setTimeout(done, AUDIO_METADATA_TIMEOUT_MS);
  });
}
