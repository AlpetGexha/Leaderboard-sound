import { sampleKey } from '../../domain/announcement.js';
import { makeAudio } from './audioElement.js';

export function createSample(a, profile) {
  const src = profile.samples && profile.samples[sampleKey(a)];
  return makeAudio(src, { volume: profile.sampleVolume });
}
