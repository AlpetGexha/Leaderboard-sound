import { voiceLine } from '../../domain/announcement.js';
import { canSpeak } from '../../guards/announcementGuards.js';
import { makeAudio } from './audioElement.js';

const DEFAULT_TTS_TIMEOUT_MS = 9000;

export function ttsUrl(a) {
  const params = new URLSearchParams({
    text: voiceLine(a),
    kind: a.kind || '',
    title: a.title || ''
  });
  if (a.count !== undefined) params.set('count', String(a.count));
  return `/api/tts?${params.toString()}`;
}

export function playAiVoice(a, profile) {
  return new Promise(resolve => {
    const text = voiceLine(a);
    if (!canSpeak(profile, text)) return resolve(false);

    const audio = makeAudio(ttsUrl(a), { volume: profile.tts.volume ?? 1 });
    if (!audio) return resolve(false);

    let finished = false;
    const done = ok => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), profile.tts.timeoutMs || DEFAULT_TTS_TIMEOUT_MS);
    audio.onended = () => done(true);
    audio.onerror = () => done(false);
    const started = audio.play();
    if (started && started.catch) started.catch(() => done(false));
  });
}
