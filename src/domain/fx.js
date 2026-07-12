export function heatLevel(solved) {
  if (solved >= 10) return 3;
  if (solved >= 5) return 2;
  if (solved >= 3) return 1;
  return 0;
}

export function burstParticles(count = 14, random = Math.random) {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + random() * 0.5;
    const distance = 40 + random() * 70;
    return {
      id: i,
      dx: Math.round(Math.cos(angle) * distance),
      dy: Math.round(Math.sin(angle) * distance),
      size: Math.round(4 + random() * 6),
      durationMs: Math.round(500 + random() * 400)
    };
  });
}
