const GAP_MS = 1200;
const SPEECH_TIMEOUT_MS = 8000;

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

  function startBackground() {
    const bg = profile.background;
    if (!bg || backgroundAudio) return;
    backgroundAudio = makeAudio(bg.src, { volume: bg.volume ?? 0.25, loop: bg.loop !== false });
    if (!backgroundAudio) return;
    const started = backgroundAudio.play();
    if (started && started.catch) started.catch(() => {});
  }

  function playTransmission() {
    const tx = profile.transmission;
    if (!tx) return 0;
    const audio = makeAudio(tx.src, { volume: tx.volume ?? 0.8 });
    if (!audio) return 0;
    const started = audio.play();
    if (started && started.catch) started.catch(() => {});
    return tx.durationMs ?? 900;
  }

  function unlock() {
    const win = getWindow();
    const AudioContext = win.AudioContext || win.webkitAudioContext;
    if (AudioContext && !ctx) ctx = new AudioContext();
    if (ctx && ctx.resume) ctx.resume();
    startBackground();
    if (!win.speechSynthesis || !win.SpeechSynthesisUtterance) return;
    const u = new win.SpeechSynthesisUtterance('');
    u.volume = 0;
    win.speechSynthesis.speak(u);
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

  function playSample(a) {
    const src = profile.samples && profile.samples[sampleKey(a)];
    const audio = makeAudio(src, { volume: profile.sampleVolume });
    if (!audio) return 0;
    const started = audio.play();
    if (started && started.catch) started.catch(() => {});
    return a.kind === 'tier' && a.count >= 5 ? 900 : 650;
  }

  function playStinger(a) {
    if (!ctx) return 0;
    if (a.kind === 'first_blood') return stingers.firstBlood();
    if (a.kind === 'new_ticket') return stingers.blip();
    if (a.kind === 'tier') return a.count >= 2 ? stingers.tier(a.count) : stingers.solved();
    return 0;
  }

  function speak(line) {
    return new Promise(resolve => {
      const win = getWindow();
      if (!win.speechSynthesis || !win.SpeechSynthesisUtterance) return setTimeout(resolve, 2000);
      const u = new win.SpeechSynthesisUtterance(line);
      u.rate = profile.voice.rate;
      u.pitch = profile.voice.pitch;
      u.volume = profile.voice.volume;
      const voices = win.speechSynthesis.getVoices();
      const preferred = profile.voice.preferredVoices || [];
      const chosen = preferred
        .map(name => voices.find(v => v.name && v.name.toLowerCase().includes(name.toLowerCase())))
        .find(Boolean) || voices.find(v => v.lang && v.lang.startsWith('en'));
      if (chosen) u.voice = chosen;
      const done = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(done, SPEECH_TIMEOUT_MS);
      u.onend = done;
      u.onerror = done;
      win.speechSynthesis.speak(u);
    });
  }

  function ttsUrl(a) {
    const params = new URLSearchParams({
      text: a.line || '',
      kind: a.kind || '',
      title: a.title || ''
    });
    if (a.count !== undefined) params.set('count', String(a.count));
    return `/api/tts?${params.toString()}`;
  }

  function playAiVoice(a) {
    return new Promise(resolve => {
      if (!profile.tts || !profile.tts.enabled) return resolve(false);
      const audio = makeAudio(ttsUrl(a), { volume: profile.tts.volume ?? 1 });
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
    try {
      showBanner(a);
      const transmissionMs = playTransmission();
      const leadMs = transmissionMs ? profile.transmission.leadMs ?? 180 : 0;
      if (leadMs) await new Promise(r => setTimeout(r, leadMs));
      const sampleMs = playSample(a);
      const stingerMs = playStinger(a);
      await new Promise(r => setTimeout(r, Math.max(sampleMs, stingerMs, transmissionMs - leadMs)));
      const aiSpoke = await playAiVoice(a);
      if (!aiSpoke) await speak(a.line);
      await new Promise(r => setTimeout(r, 400));
    } finally {
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
