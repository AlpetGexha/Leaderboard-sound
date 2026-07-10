import React from 'react';
import { fmtTime } from '../domain/time.js';

function feedClass(label) {
  if (label === 'FIRST BLOOD') return 'blood';
  if (label === 'solved') return 'solved';
  return 'opened';
}

export function KillFeed({ feed }) {
  return (
    <aside className="feed-wrap">
      <h2 className="feed-title">KILL FEED</h2>
      <ul className="feed">
        {feed.map(item => (
          <li key={`${item.ts}-${item.ticketId}-${item.label}`}>
            <span>
              <span className="who">{item.agent}</span>{' '}
              <span className={`what ${feedClass(item.label)}`}>{item.label}</span>{' '}
              {item.ticketId} <em>{item.service}</em>
            </span>
            <time>{fmtTime(item.ts)}</time>
          </li>
        ))}
      </ul>
    </aside>
  );
}
