import React, { useState } from 'react';

const PREVIEWS = [
  { key: 'new-ticket', label: 'New Ticket', kind: 'new_ticket', title: 'NEW TICKET', line: 'New ticket by {name} on {service}' },
  { key: 'urgent-boss', label: 'Urgent Boss', kind: 'urgent_boss_arrival', title: 'URGENT BOSS INCOMING', line: 'Urgent Boss incoming! {name} opened a critical {service} ticket!' },
  { key: 'first-blood', label: 'First Blood', kind: 'first_blood', title: 'FIRST BLOOD', line: 'First Blood on {service} by {name}!' },
  { key: 'solved', label: 'Solved', kind: 'tier', count: 1, title: 'SOLVED', line: 'Solved by {name} on {service}.' },
  { key: 'double-kill', label: 'Double Kill', kind: 'tier', count: 2, title: 'DOUBLE KILL', line: 'Double Kill! {name}' },
  { key: 'triple-kill', label: 'Triple Kill', kind: 'tier', count: 3, title: 'TRIPLE KILL', line: 'Triple Kill! {name}' },
  { key: 'unstoppable', label: 'Unstoppable', kind: 'tier', count: 5, title: 'UNSTOPPABLE', line: '{name} is unstoppable!' },
  { key: 'rampage', label: 'Rampage', kind: 'tier', count: 7, title: 'RAMPAGE', line: '{name} is on a rampage!' },
  { key: 'godlike', label: 'Godlike', kind: 'tier', count: 10, title: 'GODLIKE', line: '{name} is GODLIKE!' },
  { key: 'monster-kill', label: 'Monster Kill', kind: 'tier', count: 15, title: 'MONSTER KILL', line: 'M M M MONSTER KILL! {name}' },
  { key: 'boss-defeated', label: 'Boss Defeated', kind: 'urgent_boss_defeated', title: 'BOSS DEFEATED', line: 'The SLA Apocalypse has been defeated by {name}!' },
  { key: 'comeback', label: 'Comeback', kind: 'comeback', title: 'CROWN STOLEN', line: '{name} has stolen the crown!' },
  { key: 'award', label: 'Award', kind: 'award', title: 'MVP', line: 'Attention, attention everybody: today’s MVP is {name}! I repeat: today’s MVP is {name}!' }
];

function previewAnnouncement(preview, service) {
  const name = 'Test Operator';
  const now = Date.now();
  const replace = text => text.replace(/\{name\}/g, name).replace(/\{service\}/g, service);
  return {
    ...preview,
    announcementId: `preview:${preview.key}:${now}`,
    ticketId: `PREVIEW-${now}`,
    agent: name,
    service,
    ts: now,
    line: replace(preview.line)
  };
}

export function EventPreview({ service, onPreview }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="tp-preview" aria-label="Event preview">
      <button
        className="tp-preview-toggle"
        type="button"
        aria-expanded={expanded}
        aria-controls="event-preview-options"
        onClick={() => setExpanded(value => !value)}
      >
        {expanded ? 'HIDE EVENT PREVIEW' : 'PREVIEW ANY EVENT'}
      </button>
      {expanded ? (
        <div id="event-preview-options" className="tp-preview-options">
          <p>Plays the announcement only — it does not change scores or tickets.</p>
          <div className="tp-preview-grid">
            {PREVIEWS.map(preview => (
              <button key={preview.key} type="button" onClick={() => onPreview(previewAnnouncement(preview, service))}>
                {preview.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
