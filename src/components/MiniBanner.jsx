import React from 'react';

export function MiniBanner({ announcement }) {
  return <div className="mini-banner" role="status" aria-live="polite">{announcement.title} — {announcement.line}</div>;
}
