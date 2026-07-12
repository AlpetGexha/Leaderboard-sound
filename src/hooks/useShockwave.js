import { useEffect, useState } from 'react';
import { isUrgentDefeat } from '../guards/fxGuards.js';
import { isMonsterKillAnnouncement } from '../guards/announcementGuards.js';

export function useShockwave(effects, announcement = null) {
  const [shock, setShock] = useState(0);
  const [urgentShake, setUrgentShake] = useState(0);
  const [urgentShaking, setUrgentShaking] = useState(false);
  const monsterKillActive = isMonsterKillAnnouncement(announcement);

  useEffect(() => {
    if (!effects.some(isUrgentDefeat)) return undefined;
    setShock(id => id + 1);
    setUrgentShake(id => id + 1);
  }, [effects]);

  useEffect(() => {
    if (urgentShake === 0) return undefined;
    setUrgentShaking(true);
    const timer = setTimeout(() => setUrgentShaking(false), 600);
    return () => clearTimeout(timer);
  }, [urgentShake]);

  useEffect(() => {
    if (!monsterKillActive) return;
    setShock(id => id + 1);
  }, [monsterKillActive]);

  return { shock, shaking: urgentShaking || monsterKillActive };
}
