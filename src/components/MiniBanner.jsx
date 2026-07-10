import React from 'react';

export function MiniBanner({ announcement }) {
  return <div className="mini-banner">{announcement.title} - {announcement.line}</div>;
}
