import React from 'react';

export function Leaderboard({ rows, rowRefs, scoredAgents, onScoreAnimationEnd }) {
  return (
    <section className="board-wrap">
      <ol className="board">
        {rows.map(row => (
          <li
            key={row.agent}
            ref={node => {
              if (node) rowRefs.current.set(row.agent, node);
              else rowRefs.current.delete(row.agent);
            }}
            className={[
              'board-row',
              row.rank === 1 && row.solved > 0 ? 'top1' : '',
              scoredAgents.has(row.agent) ? 'scored' : ''
            ].filter(Boolean).join(' ')}
            data-agent={row.agent}
            onAnimationEnd={() => onScoreAnimationEnd(row.agent)}
          >
            <span className="rank">#{row.rank}</span>
            <span className="agent">{row.agent} {row.streak ? <span className="streak-badge">*</span> : null}</span>
            <span className="solved">{row.solved}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
