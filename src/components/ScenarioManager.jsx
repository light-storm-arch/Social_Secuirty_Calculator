import React, { useState, useEffect } from 'react'
import { saveScenario, loadScenario, listScenarios, deleteScenario } from '../utils/storage.js'

export default function ScenarioManager({ sharedState, sharedSetters }) {
  const [scenarioName, setScenarioName] = useState('')
  const [scenarios, setScenarios] = useState([])
  const [message, setMessage] = useState(null)

  useEffect(() => {
    try {
      setScenarios(listScenarios())
    } catch {
      // localStorage not available
    }
  }, [])

  function refresh() {
    try {
      setScenarios(listScenarios())
    } catch {
      setScenarios([])
    }
  }

  function handleSave() {
    if (!scenarioName.trim()) {
      setMessage({ type: 'error', text: 'Please enter a scenario name.' })
      return
    }
    try {
      saveScenario(scenarioName.trim(), sharedState)
      refresh()
      setMessage({ type: 'success', text: `Saved "${scenarioName.trim()}"` })
      setScenarioName('')
    } catch (e) {
      setMessage({ type: 'error', text: 'Could not save (localStorage may be unavailable).' })
    }
  }

  function handleLoad(name) {
    try {
      const data = loadScenario(name)
      if (!data) {
        setMessage({ type: 'error', text: `Scenario "${name}" not found.` })
        return
      }
      if (data.mode) sharedSetters.setMode(data.mode)
      if (data.personA) sharedSetters.setPersonA(data.personA)
      if (data.personB) sharedSetters.setPersonB(data.personB)
      setMessage({ type: 'success', text: `Loaded "${name}"` })
    } catch (e) {
      setMessage({ type: 'error', text: 'Could not load scenario.' })
    }
  }

  function handleDelete(name) {
    try {
      deleteScenario(name)
      refresh()
      setMessage({ type: 'success', text: `Deleted "${name}"` })
    } catch (e) {
      setMessage({ type: 'error', text: 'Could not delete.' })
    }
  }

  return (
    <div>
      <div className="card">
        <div className="card-title">Save Current Scenario</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: 1, minWidth: 200 }}>
            <label className="form-label">Scenario Name</label>
            <input
              className="form-input"
              value={scenarioName}
              onChange={e => setScenarioName(e.target.value)}
              placeholder="e.g. Base Case"
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
          </div>
          <button className="btn btn-primary" onClick={handleSave}>Save</button>
        </div>
        {message && (
          <div style={{
            marginTop: 10,
            padding: '8px 14px',
            borderRadius: 6,
            background: message.type === 'success' ? '#f0fdf4' : '#fef2f2',
            color: message.type === 'success' ? '#166534' : '#dc2626',
            fontSize: '0.85rem',
            fontWeight: 500,
          }}>
            {message.text}
          </div>
        )}
        <p style={{ fontSize: '0.78rem', color: '#6b7a9a', marginTop: 10, fontStyle: 'italic' }}>
          Note: Scenario save/load requires a real browser (GitHub Pages or local dev). It does not work in Claude.ai artifact sandboxes.
        </p>
      </div>

      <div className="card">
        <div className="card-title">Saved Scenarios</div>
        {scenarios.length === 0 ? (
          <p style={{ color: '#6b7a9a', fontSize: '0.85rem' }}>No saved scenarios yet.</p>
        ) : (
          <ul className="scenario-list">
            {scenarios.map(name => (
              <li key={name} className="scenario-item">
                <span className="scenario-name">{name}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => handleLoad(name)}>Load</button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(name)}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
