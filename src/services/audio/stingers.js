export function createStingers(engine) {
  const { tone, noiseHit } = engine;

  return {
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
    alert() {
      // Alternating low/high pulses imitate an ambulance siren without
      // requiring another sound asset to be downloaded by the browser.
      tone(640, 0, 0.42, { type: 'sawtooth', gain: 0.22, slideTo: 760 });
      tone(1040, 0.48, 0.42, { type: 'sawtooth', gain: 0.24, slideTo: 1180 });
      tone(640, 0.96, 0.42, { type: 'sawtooth', gain: 0.22, slideTo: 760 });
      tone(1040, 1.44, 0.42, { type: 'sawtooth', gain: 0.24, slideTo: 1180 });
      tone(640, 1.92, 0.42, { type: 'sawtooth', gain: 0.22, slideTo: 760 });
      noiseHit(0, 0.32, 0.16);
      noiseHit(0.96, 0.32, 0.16);
      noiseHit(1.92, 0.32, 0.16);
      return 2400;
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
}

// Strategy: which stinger (if any) plays for an announcement.
// A mapped MP3 sample always wins over a generated stinger.
export function selectStinger(stingers, a, hasSample) {
  if (hasSample) return null;
  const kind = a.sampleKind || a.kind;
  const count = a.sampleCount ?? a.count;
  if (kind === 'first_blood' || kind === 'first_blood_boss_defeated') return () => stingers.firstBlood();
  if (kind === 'new_ticket') return null;
  if (kind === 'tier') return count >= 2 ? () => stingers.tier(count) : () => stingers.solved();
  if (kind === 'team_combo') return () => stingers.tier(count);
  if (kind === 'urgent_boss_spawned' || kind === 'urgent_boss_defeated') return () => stingers.firstBlood();
  return null;
}
