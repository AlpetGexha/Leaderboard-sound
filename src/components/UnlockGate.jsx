import React from 'react';

export function UnlockGate({ unlocked, onUnlock }) {
  return (
    <div id="unlock-gate" className={unlocked ? 'hidden' : ''}>
      <div className="gate-inner">
        <div className="gate-title">TICKET ARENA</div>
        <button id="unlock-btn" onClick={onUnlock}>CLICK TO ARM SPEAKERS</button>
        <div className="gate-hint">browser needs one click before it may play sound</div>
      </div>
    </div>
  );
}
