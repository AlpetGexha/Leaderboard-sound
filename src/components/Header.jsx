import React from 'react';

export function Header({ snapshot, live }) {
  const firstBlood = snapshot?.state?.firstBlood;
  return (
    <header>
      <h1 className="site-title">TICKET <span className="accent">ARENA</span></h1>
      <div className="header-meta">
        <span className="day-label">{snapshot?.day || ''}</span>
        <span className={`fb-chip ${firstBlood ? '' : 'hidden'}`}>
          {firstBlood ? <>FIRST BLOOD: <strong>{firstBlood.agent}</strong> on {firstBlood.service}</> : null}
        </span>
        <span className={`conn-dot ${live ? 'live' : ''}`} role="status"
          aria-label={live ? 'Live connection' : 'Connection offline'} title={live ? 'Live connection' : 'Connection offline'} />
      </div>
    </header>
  );
}
