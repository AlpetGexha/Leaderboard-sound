import React from 'react';

export function FxLayer({ bursts, shock }) {
  return (
    <div className="fx-layer" aria-hidden="true">
      {bursts.map(burst => (
        <div key={burst.id} className="fx-burst" style={{ left: burst.x, top: burst.y }}>
          {burst.particles.map(particle => (
            <span
              key={particle.id}
              className="fx-particle"
              style={{
                '--dx': `${particle.dx}px`,
                '--dy': `${particle.dy}px`,
                '--size': `${particle.size}px`,
                '--dur': `${particle.durationMs}ms`
              }}
            />
          ))}
        </div>
      ))}
      {shock ? <div key={shock} className="fx-shockwave" /> : null}
    </div>
  );
}
