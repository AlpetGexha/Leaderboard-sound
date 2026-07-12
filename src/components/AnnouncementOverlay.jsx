import React from 'react';
import { isMonsterKillAnnouncement } from '../guards/announcementGuards.js';

export function AnnouncementOverlay({ announcement }) {
  const gold = announcement.kind === 'award' || (announcement.kind === 'tier' && announcement.count >= 5);
  const urgent = announcement.kind === 'urgent_boss_arrival';
  const monsterKill = isMonsterKillAnnouncement(announcement);
  return (
    <div className={`announce ${gold ? 'gold' : ''} ${urgent ? 'urgent' : ''} ${monsterKill ? 'monster-kill' : ''}`} role="alert" aria-live="assertive">
      <div className="announce-inner">
        <div className="announce-title">{announcement.title}</div>
        <div className="announce-line">{announcement.line}</div>
      </div>
    </div>
  );
}
