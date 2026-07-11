import React, { memo, useEffect, useState } from 'react';

const PRIORITY_MONSTERS = {
  low: { emoji: '🦠', title: 'Tiny Queue Slime', hue: 145 },
  medium: { emoji: '👾', title: 'Inbox Goblin', hue: 210 },
  high: { emoji: '👹', title: 'Escalation Demon', hue: 30 },
  urgent: { emoji: '💀', title: 'SLA Apocalypse', hue: 355 }
};

function hash(value) {
  let result = 2166136261;
  for (const char of value || 'General') result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return result >>> 0;
}

export function monsterFor(service, priority = 'medium') {
  const category = PRIORITY_MONSTERS[priority] || PRIORITY_MONSTERS.medium;
  const serviceVariation = hash(service) % 18 - 9;
  return { ...category, hue: (category.hue + serviceVariation + 360) % 360 };
}

export const InboxInvasion = memo(function InboxInvasion({ invasion, effects }) {
  const [defeats, setDefeats] = useState([]);
  const spawned = new Set(effects.filter(e => e.type === 'monster_spawned').map(e => e.ticketId));

  useEffect(() => {
    const next = effects.filter(e => e.type === 'monster_defeated');
    if (!next.length) return undefined;
    setDefeats(current => [...current, ...next]);
    const timer = setTimeout(() => setDefeats(current => current.filter(item => !next.includes(item))), 900);
    return () => clearTimeout(timer);
  }, [effects]);

  const enemies = invasion?.enemies || [];
  const overflow = Math.max(0, (invasion?.activeCount || 0) - enemies.length);
  return (
    <section className="invasion" aria-labelledby="invasion-title">
      <div className="invasion-head"><h2 id="invasion-title">INBOX INVASION</h2><strong aria-live="polite">{invasion?.activeCount || 0} ACTIVE</strong></div>
      <div className="battlefield">
        {enemies.map(enemy => {
          const priority = enemy.priority || 'medium';
          const monster = monsterFor(enemy.service, priority);
          return (
            <article key={enemy.ticketId} className={`monster priority-${priority} ${spawned.has(enemy.ticketId) ? 'spawned' : ''}`}
              style={{ '--monster-hue': monster.hue }}>
              <div className="monster-emoji" aria-hidden="true">{monster.emoji}</div>
              <strong>{monster.title}</strong><span>{enemy.ticketId}</span>
              <b className="monster-priority">{priority}</b>
              <small>{enemy.service} · opened by {enemy.agent}</small>
            </article>
          );
        })}
        {defeats.map(effect => <div className="monster defeated" key={`${effect.ticketId}:${effect.agent}`}>
          <div className="monster-emoji" aria-hidden="true">💥</div><strong>DEFEATED</strong><span>{effect.ticketId}</span>
          <small>slain by {effect.agent}</small>
        </div>)}
        {overflow > 0 ? <div className="invasion-overflow">+{overflow} MORE</div> : null}
        {!enemies.length && !defeats.length ? <div className="invasion-clear">INBOX CLEAR — FOR NOW</div> : null}
      </div>
    </section>
  );
});
