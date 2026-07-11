import React from 'react';

export function SolvePopup({ announcement }) {
  return (
    <section className="solve-popup" aria-live="assertive">
      <div className="solve-popup-kicker">TICKET SECURED</div>
      <div className="solve-popup-name">{announcement.agent}</div>
      <div className="solve-popup-detail">
        <span>{announcement.service}</span>
        <span className="solve-popup-separator">/</span>
        <span>{announcement.ticketId}</span>
      </div>
    </section>
  );
}
