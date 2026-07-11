import React from 'react';

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

export function TestPanelControls({ services, selectedService, onServiceChange, priority, onPriorityChange, secret, onSecretChange, onReset }) {
  return (
    <div className="tp-row">
      <label>
        service
        <select value={selectedService} onChange={event => onServiceChange(event.target.value)}>
          {services.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <label>
        priority
        <select value={priority} onChange={event => onPriorityChange(event.target.value)}>
          {PRIORITIES.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <label>
        secret
        <input value={secret} type="text" size="16" onChange={event => onSecretChange(event.target.value)} />
      </label>
      <button id="test-reset" className="tp-danger" onClick={onReset}>RESET DAY</button>
    </div>
  );
}
