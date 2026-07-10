import React from 'react';

export function AgentGrid({ agents, onCreate, onResolve }) {
  return (
    <div className="tp-grid">
      {agents.map(agent => (
        <React.Fragment key={agent}>
          <span className="tp-name">{agent}</span>
          <button data-agent={agent} data-type="ticket.created" onClick={() => onCreate(agent)}>+ ticket</button>
          <button data-agent={agent} data-type="ticket.resolved" className="solve" onClick={() => onResolve(agent)}>resolve</button>
        </React.Fragment>
      ))}
    </div>
  );
}
