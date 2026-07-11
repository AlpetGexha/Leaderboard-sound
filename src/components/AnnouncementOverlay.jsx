import React from 'react';

export function AnnouncementOverlay({ announcement }) {
  const gold = announcement.kind === 'award' || (announcement.kind === 'tier' && announcement.count >= 5);
  return (
    <div className={`announce ${gold ? 'gold' : ''}`} role="alert" aria-live="assertive">
      <div className="announce-inner">
        <div className="announce-title">{announcement.title}</div>
        <div className="announce-line">{announcement.line}</div>
      </div>
    </div>
  );
}
