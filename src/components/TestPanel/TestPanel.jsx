import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { agentsFrom, servicesFrom } from '../../domain/snapshot.js';
import { randomPriority } from '../../domain/priority.js';
import { useHotkey } from '../../hooks/useHotkey.js';
import * as api from '../../services/arenaApi.js';
import { createSecretStore } from '../../services/secretStore.js';
import { createTicketIds } from '../../services/ticketIds.js';
import { createTicket } from '../../actions/createTicket.js';
import { resolveTicket } from '../../actions/resolveTicket.js';
import { resetDay } from '../../actions/resetDay.js';
import { TestPanelControls } from './TestPanelControls.jsx';
import { AgentGrid } from './AgentGrid.jsx';
import { EventPreview } from './EventPreview.jsx';

function announcementLabel(announcement) {
  if (!announcement) return 'Nothing is playing';
  return `${announcement.title || announcement.kind} — ${announcement.line || ''}`;
}

export function TestPanel({ snapshot, currentAnnouncement, queuedAnnouncements = [], onPreview }) {
  const [visible, setVisible] = useState(() => new URLSearchParams(window.location.search).get('test') === '1');
  const secretStore = useMemo(() => createSecretStore(), []);
  const ticketIds = useRef(null);
  if (!ticketIds.current) ticketIds.current = createTicketIds();

  const [secret, setSecret] = useState(() => secretStore.get());
  const [service, setService] = useState('');

  const agents = agentsFrom(snapshot);
  const services = servicesFrom(snapshot);
  const selectedService = service || services[0] || 'General';

  useEffect(() => {
    if (!services.includes(service)) setService(services[0] || 'General');
  }, [service, services]);

  useEffect(() => {
    // After a page refresh, restore the IDs already visible in Inbox Invasion
    // so Resolve removes the demon card the operator can actually see.
    ticketIds.current.syncOpen(snapshot?.state?.invasion?.enemies?.map(enemy => enemy.ticketId));
  }, [snapshot]);

  useHotkey('t', useCallback(() => setVisible(current => !current), []));

  const deps = { api, secretStore, ticketIds: ticketIds.current };

  function changeSecret(value) {
    setSecret(value);
    secretStore.set(value);
  }

  async function onCreate(agent) {
    const result = await createTicket(deps, { agent, service: selectedService, priority: randomPriority() });
    setSecret(result.secret);
  }

  async function onResolve(agent) {
    const result = await resolveTicket(deps, { agent, service: selectedService });
    setSecret(result.secret);
  }

  return (
    <>
      {!visible ? (
        <button
          className="test-panel-toggle"
          type="button"
          aria-expanded="false"
          aria-controls="test-panel"
          onClick={() => setVisible(true)}
        >
          OPEN TEST PANEL
        </button>
      ) : null}
      <div id="test-panel" className={`test-panel ${visible ? '' : 'hidden'}`} aria-hidden={!visible}>
        <div className="tp-head">
          <span>TEST PANEL <span className="tp-hint">(press T to hide)</span></span>
          <button className="tp-close" type="button" onClick={() => setVisible(false)}>Close</button>
        </div>
        <TestPanelControls
          services={services}
          selectedService={selectedService}
          onServiceChange={setService}
          secret={secret}
          onSecretChange={changeSecret}
          onReset={() => resetDay({ api })}
        />
        <AgentGrid agents={agents} onCreate={onCreate} onResolve={onResolve} />
        <EventPreview service={selectedService} onPreview={onPreview} />
        <section className="tp-queue" aria-label="Voice queue">
          <div className="tp-queue-current">
            <span>NOW</span>
            <strong>{announcementLabel(currentAnnouncement)}</strong>
          </div>
          <div className="tp-queue-next">
            <span>NEXT ({queuedAnnouncements.length})</span>
            {queuedAnnouncements.length ? (
              <ol>
                {queuedAnnouncements.map(announcement => (
                  <li key={announcement.announcementId || `${announcement.kind}:${announcement.ts || announcement.line}`}>
                    {announcementLabel(announcement)}
                  </li>
                ))}
              </ol>
            ) : <p>clear</p>}
          </div>
        </section>
      </div>
    </>
  );
}
