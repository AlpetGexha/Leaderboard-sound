import React from 'react';

export function AnnouncementOverlay({ announcement }) {
  const gold = announcement.kind === 'tier' && announcement.count >= 5;
  return (
    <div className={`announce ${gold ? 'gold' : ''}`}>
      <div className="announce-inner">
        <div className="announce-title">{announcement.title}</div>
        <div className="announce-line">{announcement.line}</div>
      </div>
    </div>
  );
}
