import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { agentsFrom, servicesFrom } from '../../domain/snapshot.js';
import { useHotkey } from '../../hooks/useHotkey.js';
import * as api from '../../services/arenaApi.js';
import { createSecretStore } from '../../services/secretStore.js';
import { createTicketIds } from '../../services/ticketIds.js';
import { createTicket } from '../../actions/createTicket.js';
import { resolveTicket } from '../../actions/resolveTicket.js';
import { resetDay } from '../../actions/resetDay.js';
import { TestPanelControls } from './TestPanelControls.jsx';
import { AgentGrid } from './AgentGrid.jsx';

export function TestPanel({ snapshot }) {
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

  useHotkey('t', useCallback(() => setVisible(current => !current), []));

  const deps = { api, secretStore, ticketIds: ticketIds.current };

  function changeSecret(value) {
    setSecret(value);
    secretStore.set(value);
  }

  async function onCreate(agent) {
    const result = await createTicket(deps, { agent, service: selectedService });
    setSecret(result.secret);
  }

  async function onResolve(agent) {
    const result = await resolveTicket(deps, { agent, service: selectedService });
    setSecret(result.secret);
  }

  return (
    <div id="test-panel" className={`test-panel ${visible ? '' : 'hidden'}`}>
      <div className="tp-head">TEST PANEL <span className="tp-hint">(press T to hide)</span></div>
      <TestPanelControls
        services={services}
        selectedService={selectedService}
        onServiceChange={setService}
        secret={secret}
        onSecretChange={changeSecret}
        onReset={() => resetDay({ api })}
      />
      <AgentGrid agents={agents} onCreate={onCreate} onResolve={onResolve} />
    </div>
  );
}
