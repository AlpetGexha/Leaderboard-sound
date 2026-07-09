/* Announcer: strictly-serial announcement queue.
   Each item: stinger (WebAudio synth) -> voice line (SpeechSynthesis) -> banner hides -> gap -> next.
   Pattern adapted from first-strike-alert's announcement queue. */
(function () {
  'use strict';

  const GAP_MS = 1200;
  const SPEECH_TIMEOUT_MS = 8000;

  const overlay = document.getElementById('announce');
  const overlayTitle = document.getElementById('announce-title');
  const overlayLine = document.getElementById('announce-line');
  const mini = document.getElementById('mini-banner');

  let ctx = null;
  let queue = [];
  let playing = false;

  function unlock() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume();
    // prime speechSynthesis inside the user gesture
    const u = new SpeechSynthesisUtterance('');
    u.volume = 0;
    speechSynthesis.speak(u);
  }

  // ---- stinger synthesis ----
  function tone(freq, start, dur, { type = 'square', gain = 0.18, slideTo = null } = {}) {
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

  // each stinger returns its duration in ms
  const STINGERS = {
    blip() { tone(880, 0, 0.1, { type: 'sine', gain: 0.12 }); tone(1320, 0.1, 0.12, { type: 'sine', gain: 0.10 }); return 300; },
    solved() { tone(523, 0, 0.11); tone(784, 0.12, 0.18, { gain: 0.15 }); return 400; },
    first_blood() {
      noiseHit(0, 0.5, 0.3);
      tone(150, 0, 0.7, { type: 'sawtooth', gain: 0.28, slideTo: 40 });
      tone(75, 0.25, 0.9, { type: 'sawtooth', gain: 0.22, slideTo: 30 });
      noiseHit(0.55, 0.35, 0.18);
      return 1400;
    },
    tier(count) {
      // rising arpeggio, one note per kill (capped), ending on a power chord
      const notes = Math.min(count, 8);
      const base = 330;
      for (let i = 0; i < notes; i++) {
        tone(base * Math.pow(1.2, i), i * 0.09, 0.12, { gain: 0.14 });
      }
      const endAt = notes * 0.09;
      tone(base * Math.pow(1.2, notes), endAt, 0.5, { type: 'sawtooth', gain: 0.2 });
      tone(base * Math.pow(1.2, notes) * 1.5, endAt, 0.5, { type: 'sawtooth', gain: 0.12 });
      if (count >= 5) noiseHit(endAt, 0.4, 0.2);
      return Math.round((endAt + 0.6) * 1000);
    }
  };

  function playStinger(a) {
    if (!ctx) return 0;
    if (a.kind === 'first_blood') return STINGERS.first_blood();
    if (a.kind === 'new_ticket') return STINGERS.blip();
    if (a.kind === 'tier') return a.count >= 2 ? STINGERS.tier(a.count) : STINGERS.solved();
    return 0;
  }

  // ---- speech ----
  function speak(line) {
    return new Promise(resolve => {
      if (!('speechSynthesis' in window)) return setTimeout(resolve, 2000);
      const u = new SpeechSynthesisUtterance(line);
      u.rate = 0.95;
      u.pitch = 0.7;
      u.volume = 1;
      const en = speechSynthesis.getVoices().find(v => v.lang.startsWith('en'));
      if (en) u.voice = en;
      const done = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(done, SPEECH_TIMEOUT_MS);
      u.onend = done;
      u.onerror = done;
      speechSynthesis.speak(u);
    });
  }

  // ---- banners ----
  function showBanner(a) {
    const big = a.kind === 'first_blood' || (a.kind === 'tier' && a.count >= 2);
    if (big) {
      overlayTitle.textContent = a.title;
      overlayLine.textContent = a.line;
      overlay.classList.toggle('gold', a.kind === 'tier' && a.count >= 5);
      overlay.classList.remove('hidden');
    } else {
      mini.textContent = `${a.title} — ${a.line}`;
      mini.classList.remove('hidden');
    }
  }

  function hideBanners() {
    overlay.classList.add('hidden');
    mini.classList.add('hidden');
  }

  // ---- queue ----
  async function playNext() {
    if (playing) return;
    const a = queue.shift();
    if (!a) return;
    playing = true;
    try {
      showBanner(a);
      const stingerMs = playStinger(a);
      await new Promise(r => setTimeout(r, stingerMs));
      await speak(a.line);
      await new Promise(r => setTimeout(r, 400));
    } finally {
      hideBanners();
      playing = false;
      if (queue.length) setTimeout(playNext, GAP_MS);
    }
  }

  window.Announcer = {
    unlock,
    enqueue(a) { queue.push(a); playNext(); }
  };
})();
