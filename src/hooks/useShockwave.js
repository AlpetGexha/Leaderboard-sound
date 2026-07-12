import { useEffect, useState } from 'react';
import { isUrgentDefeat } from '../guards/fxGuards.js';

export function useShockwave(effects) {
  const [shock, setShock] = useState(0);
  const [shaking, setShaking] = useState(false);

  useEffect(() => {
    if (!effects.some(isUrgentDefeat)) return undefined;
    setShock(id => id + 1);
  }, [effects]);

  useEffect(() => {
    if (shock === 0) return undefined;
    setShaking(true);
    const timer = setTimeout(() => setShaking(false), 600);
    return () => clearTimeout(timer);
  }, [shock]);

  return { shock, shaking };
}
