export const DEFAULT_PROFILE = {
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

export function mergeProfile(next = {}) {
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
