import { sampleFallbackMs } from '../../domain/announcement.js';
import { makeAudio, playAudio, stopAudio, measuredAudioMs } from '../audio/audioElement.js';
import { createAudioContext } from '../audio/audioContext.js';
import { createStingers, selectStinger } from '../audio/stingers.js';
import { createSample } from '../audio/samples.js';
import { playAiVoice } from '../audio/ttsClient.js';
import { DEFAULT_PROFILE, mergeProfile } from './profile.js';
import { createQueue } from './queue.js';

const GAP_MS = 2000;
const DEFAULT_TRANSMISSION_LEAD_MS = 2000;
const TAIL_MS = 400;

const delay = ms => new Promise(r => setTimeout(r, ms));

export function createAnnouncer({ onShow = () => {}, onHide = () => {} } = {}) {
  const engine = createAudioContext();
  const stingers = createStingers(engine);
  let profile = DEFAULT_PROFILE;
  let backgroundAudio = null;

  function configure(next) {
    profile = mergeProfile(next);
    if (backgroundAudio && profile.background && backgroundAudio.src !== profile.background.src) {
      backgroundAudio.pause();
      backgroundAudio = null;
    }
  }

  function startBackground() {
    const bg = profile.background;
    if (!bg || backgroundAudio) return;
    backgroundAudio = makeAudio(bg.src, { volume: bg.volume ?? 0.25, loop: bg.loop !== false });
    if (!backgroundAudio) return;
    playAudio(backgroundAudio);
  }

  function startTransmission() {
    const tx = profile.transmission;
    if (!tx) return null;
    const audio = makeAudio(tx.src, { volume: tx.volume ?? 0.15, loop: tx.loop !== false });
    if (!audio) return null;
    playAudio(audio);
    return audio;
  }

  function unlock() {
    engine.resume();
    startBackground();
  }

  function playStinger(a, hasSample) {
    if (!engine.isReady()) return 0;
    const play = selectStinger(stingers, a, hasSample);
    return play ? play() : 0;
  }

  async function playOne(a) {
    let transmissionAudio = null;
    try {
      onShow(a);
      const sampleAudio = createSample(a, profile);
      const hasSample = Boolean(sampleAudio);
      const sampleMs = await measuredAudioMs(sampleAudio, sampleFallbackMs(a));
      transmissionAudio = startTransmission();
      const leadMs = transmissionAudio ? profile.transmission.leadMs ?? DEFAULT_TRANSMISSION_LEAD_MS : 0;
      if (leadMs) await delay(leadMs);
      playAudio(sampleAudio);
      const stingerMs = playStinger(a, hasSample);
      await delay(Math.max(sampleMs, stingerMs));
      await playAiVoice(a, profile);
      await delay(TAIL_MS);
    } finally {
      stopAudio(transmissionAudio);
      onHide();
    }
  }

  const queue = createQueue({ gapMs: GAP_MS, playOne });

  return {
    configure,
    unlock,
    enqueue: queue.enqueue
  };
}
