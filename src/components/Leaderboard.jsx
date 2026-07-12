import React from 'react';
import { heatLevel } from '../domain/fx.js';

export function Leaderboard({ rows, rowRefs, scoredAgents, onScoreAnimationEnd, fxEnabled = true }) {
  return (
    <section className="board-wrap">
      <ol className="board">
        {rows.map(row => {
          const heat = fxEnabled ? heatLevel(row.solved) : 0;
          return (
            <li
              key={row.agent}
              ref={node => {
                if (node) rowRefs.current.set(row.agent, node);
                else rowRefs.current.delete(row.agent);
              }}
              className={[
                'board-row',
                row.rank === 1 && row.solved > 0 ? 'top1' : '',
                scoredAgents.has(row.agent) ? 'scored' : '',
                heat ? `heat-${heat}` : ''
              ].filter(Boolean).join(' ')}
              data-agent={row.agent}
              onAnimationEnd={() => onScoreAnimationEnd(row.agent)}
            >
              <span className="rank">#{row.rank}</span>
              <span className="agent">{row.agent} {row.streak ? <span className="streak-badge">*</span> : null}</span>
              <span className="solved">{row.solved}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
