const GAP_MS = 2000;
const SPEECH_TIMEOUT_MS = 8000;
const DEFAULT_TRANSMISSION_LEAD_MS = 2000;
const AUDIO_METADATA_TIMEOUT_MS = 300;

const DEFAULT_PROFILE = {
  voice: {
    rate: 0.82,
    pitch: 0.35,
    volume: 1,
    preferredVoices: ['Microsoft David', 'Google US English', 'Daniel', 'Alex']
  },
  background: null,
  transmission: null,
  tts: { enabled: false, volume: 1, timeoutMs: 9000 },
  samples: {},
  sampleVolume: 0.9
};

const SAMPLE_KEYS = {
  first_blood: 'first_blood',
  new_ticket: 'new_ticket',
  1: 'solved',
  2: 'double_kill',
  3: 'triple_kill',
  4: 'killing_spree',
  5: 'unstoppable',
  7: 'rampage',
  10: 'godlike',
  15: 'monster_kill'
};

function mergeProfile(next = {}) {
  return {
    ...DEFAULT_PROFILE,
    ...next,
    voice: { ...DEFAULT_PROFILE.voice, ...(next.voice || {}) },
    samples: { ...DEFAULT_PROFILE.samples, ...(next.samples || {}) },
    tts: { ...DEFAULT_PROFILE.tts, ...(next.tts || {}) },
    transmission: next.transmission === undefined ? DEFAULT_PROFILE.transmission : next.transmission,
    background: next.background === undefined ? DEFAULT_PROFILE.background : next.background
  };
}

function getWindow() {
  return typeof window === 'undefined' ? {} : window;
}

function getAudioCtor() {
  const win = getWindow();
  return win.Audio || globalThis.Audio;
}

export function createAnnouncer({ getOverlayElements }) {
  let ctx = null;
  let queue = [];
  let playing = false;
  let profile = DEFAULT_PROFILE;
  let backgroundAudio = null;

  function configure(next) {
    profile = mergeProfile(next);
    if (backgroundAudio && profile.background && backgroundAudio.src !== profile.background.src) {
      backgroundAudio.pause();
      backgroundAudio = null;
    }
  }

  function makeAudio(src, { volume = 1, loop = false } = {}) {
    const AudioCtor = getAudioCtor();
    if (!src || typeof AudioCtor === 'undefined') return null;
    const audio = new AudioCtor(src);
    audio.volume = volume;
    audio.loop = loop;
    return audio;
  }

  function stopAudio(audio) {
    if (!audio) return;
    if (audio.pause) audio.pause();
    try {
      audio.currentTime = 0;
    } catch (_) {
      // Some test/browser audio implementations expose currentTime as read-only.
    }
  }

  function playAudio(audio) {
    if (!audio) return false;
    const started = audio.play();
    if (started && started.catch) started.catch(() => {});
    return true;
  }

  function measuredAudioMs(audio, fallbackMs) {
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
    const win = getWindow();
    const AudioContext = win.AudioContext || win.webkitAudioContext;
    if (AudioContext && !ctx) ctx = new AudioContext();
    if (ctx && ctx.resume) ctx.resume();
    startBackground();
  }

  function tone(freq, start, dur, { type = 'square', gain = 0.18, slideTo = null } = {}) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + start + dur);
    g.gain.setValueAtTime(0, ctx.currentTime + start);
    g.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(ctx.currentTime + start);
    osc.stop(ctx.currentTime + start + dur + 0.05);
  }

  function noiseHit(start, dur, gain = 0.25) {
    if (!ctx) return;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    src.buffer = buf;
    g.gain.value = gain;
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start(ctx.currentTime + start);
  }

  const stingers = {
    blip() {
      tone(980, 0, 0.08, { type: 'square', gain: 0.12 });
      tone(1960, 0.08, 0.1, { type: 'square', gain: 0.08 });
      return 260;
    },
    solved() {
      noiseHit(0, 0.18, 0.18);
      tone(110, 0, 0.28, { type: 'sawtooth', gain: 0.2, slideTo: 70 });
      tone(440, 0.08, 0.18, { type: 'square', gain: 0.12 });
      return 480;
    },
    firstBlood() {
      noiseHit(0, 0.5, 0.3);
      tone(150, 0, 0.7, { type: 'sawtooth', gain: 0.28, slideTo: 40 });
      tone(75, 0.25, 0.9, { type: 'sawtooth', gain: 0.22, slideTo: 30 });
      noiseHit(0.55, 0.35, 0.18);
      return 1400;
    },
    tier(count) {
      noiseHit(0, 0.45, count >= 5 ? 0.32 : 0.22);
      tone(72, 0, 0.8, { type: 'sawtooth', gain: count >= 5 ? 0.3 : 0.22, slideTo: 42 });
      const notes = Math.min(count, 8);
      const base = 330;
      for (let i = 0; i < notes; i++) {
        tone(base * Math.pow(1.2, i), 0.08 + i * 0.09, 0.12, { gain: 0.14 });
      }
      const endAt = 0.08 + notes * 0.09;
      tone(base * Math.pow(1.2, notes), endAt, 0.5, { type: 'sawtooth', gain: 0.2 });
      tone(base * Math.pow(1.2, notes) * 1.5, endAt, 0.5, { type: 'sawtooth', gain: 0.12 });
      if (count >= 5) noiseHit(endAt, 0.4, 0.2);
      return Math.round((endAt + 0.6) * 1000);
    }
  };

  function sampleKey(a) {
    if (a.kind === 'tier') return SAMPLE_KEYS[a.count] || `tier_${a.count}`;
    return SAMPLE_KEYS[a.kind] || a.kind;
  }

  function sampleFallbackMs(a) {
    return a.kind === 'tier' && a.count >= 5 ? 900 : 650;
  }

  function createSample(a) {
    const src = profile.samples && profile.samples[sampleKey(a)];
    return makeAudio(src, { volume: profile.sampleVolume });
  }

  function voiceLine(a, hasSample) {
    if (!hasSample) return a.line || '';
    if (!a.title || !a.line) return a.line || '';
    const prefix = `${a.title}, `;
    return a.line.startsWith(prefix) ? a.line.slice(prefix.length) : a.line;
  }

  function playStinger(a, hasSample) {
    if (!ctx) return 0;
    if (hasSample) return 0;
    if (a.kind === 'first_blood') return stingers.firstBlood();
    if (a.kind === 'new_ticket') return 0;
    if (a.kind === 'tier') return a.count >= 2 ? stingers.tier(a.count) : stingers.solved();
    return 0;
  }

  function ttsUrl(a, hasSample) {
    const params = new URLSearchParams({
      text: voiceLine(a, hasSample),
      kind: a.kind || '',
      title: a.title || ''
    });
    if (a.count !== undefined) params.set('count', String(a.count));
    return `/api/tts?${params.toString()}`;
  }

  function playAiVoice(a, hasSample) {
    return new Promise(resolve => {
      if (!profile.tts || !profile.tts.enabled) return resolve(false);
      const text = voiceLine(a, hasSample);
      if (!text) return resolve(false);
      const audio = makeAudio(ttsUrl(a, hasSample), { volume: profile.tts.volume ?? 1 });
      if (!audio) return resolve(false);
      let finished = false;
      const done = ok => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve(ok);
      };
      const timer = setTimeout(() => done(false), profile.tts.timeoutMs || 9000);
      audio.onended = () => done(true);
      audio.onerror = () => done(false);
      const started = audio.play();
      if (started && started.catch) started.catch(() => done(false));
    });
  }

  function showBanner(a) {
    const { overlay, overlayTitle, overlayLine, mini } = getOverlayElements();
    const big = a.kind === 'first_blood' || (a.kind === 'tier' && a.count >= 2);
    if (big && overlay && overlayTitle && overlayLine) {
      overlayTitle.textContent = a.title;
      overlayLine.textContent = a.line;
      overlay.classList.toggle('gold', a.kind === 'tier' && a.count >= 5);
      overlay.classList.remove('hidden');
    } else if (mini) {
      mini.textContent = `${a.title} - ${a.line}`;
      mini.classList.remove('hidden');
    }
  }

  function hideBanners() {
    const { overlay, mini } = getOverlayElements();
    if (overlay) overlay.classList.add('hidden');
    if (mini) mini.classList.add('hidden');
  }

  async function playNext() {
    if (playing) return;
    const a = queue.shift();
    if (!a) return;
    playing = true;
    let transmissionAudio = null;
    try {
      showBanner(a);
      const sampleAudio = createSample(a);
      const hasSample = Boolean(sampleAudio);
      const sampleMs = await measuredAudioMs(sampleAudio, sampleFallbackMs(a));
      transmissionAudio = startTransmission();
      const leadMs = transmissionAudio ? profile.transmission.leadMs ?? DEFAULT_TRANSMISSION_LEAD_MS : 0;
      if (leadMs) await new Promise(r => setTimeout(r, leadMs));
      playAudio(sampleAudio);
      const stingerMs = playStinger(a, hasSample);
      await new Promise(r => setTimeout(r, Math.max(sampleMs, stingerMs)));
      await playAiVoice(a, hasSample);
      await new Promise(r => setTimeout(r, 400));
    } finally {
      stopAudio(transmissionAudio);
      hideBanners();
      playing = false;
      if (queue.length) setTimeout(playNext, GAP_MS);
    }
  }

  return {
    configure,
    unlock,
    enqueue(a) {
      queue.push(a);
      playNext();
    }
  };
}
