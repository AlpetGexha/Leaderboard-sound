import React from 'react';

export function UnlockGate({ unlocked, onUnlock }) {
  return (
    <div id="unlock-gate" className={unlocked ? 'hidden' : ''} role="dialog" aria-modal="true"
      aria-labelledby="unlock-title" aria-describedby="unlock-hint">
      <div className="gate-inner">
        <h2 id="unlock-title" className="gate-title">TICKET ARENA</h2>
        <button id="unlock-btn" onClick={onUnlock}>CLICK TO ARM SPEAKERS</button>
        <div id="unlock-hint" className="gate-hint">Browser needs one click before it may play sound.</div>
      </div>
    </div>
  );
}
