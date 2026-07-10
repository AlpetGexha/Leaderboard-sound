export function getWindow() {
  return typeof window === 'undefined' ? {} : window;
}

export function getAudioCtor() {
  const win = getWindow();
  return win.Audio || globalThis.Audio;
}

export function getAudioContextCtor() {
  const win = getWindow();
  return win.AudioContext || win.webkitAudioContext;
}
