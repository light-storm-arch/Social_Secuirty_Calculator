import React, { useState } from 'react'
import Module1 from './components/Module1.jsx'
import Module2 from './components/Module2.jsx'
import Module3 from './components/Module3.jsx'
import ScenarioManager from './components/ScenarioManager.jsx'
import AssumptionsPanel from './components/AssumptionsPanel.jsx'

const defaultPerson = {
  birthYear: 1962,
  sex: 'male',
  currentAge: 62,
  estimate: 2000,
  estimateAtAge: { years: 62, months: 0 },
}

export default function App() {
  const [mode, setMode] = useState('single')
  const [personA, setPersonA] = useState({ ...defaultPerson })
  const [personB, setPersonB] = useState({ ...defaultPerson, sex: 'female', birthYear: 1964 })
  const [activeTab, setActiveTab] = useState('module1')

  const sharedState = { mode, personA, personB }
  const sharedSetters = { setMode, setPersonA, setPersonB }

  const tabs = [
    { id: 'module1', label: 'Benefit Table' },
    { id: 'module2', label: 'Break-Even' },
    { id: 'module3', label: 'Optimizer' },
    { id: 'scenarios', label: 'Scenarios' },
  ]

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <div className="header-brand">
            <h1>Social Security Calculator</h1>
            <span className="header-subtitle">Retirement Benefit Optimizer</span>
          </div>
          <div className="mode-toggle">
            <span className="mode-label">Mode:</span>
            <button
              className={`mode-btn ${mode === 'single' ? 'active' : ''}`}
              onClick={() => setMode('single')}
            >
              Single
            </button>
            <button
              className={`mode-btn ${mode === 'couple' ? 'active' : ''}`}
              onClick={() => setMode('couple')}
            >
              Couple
            </button>
          </div>
        </div>
      </header>

      <nav className="tab-nav">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="app-main">
        {activeTab === 'module1' && (
          <Module1 sharedState={sharedState} sharedSetters={sharedSetters} />
        )}
        {activeTab === 'module2' && (
          <Module2 sharedState={sharedState} sharedSetters={sharedSetters} />
        )}
        {activeTab === 'module3' && (
          <Module3 sharedState={sharedState} sharedSetters={sharedSetters} />
        )}
        {activeTab === 'scenarios' && (
          <ScenarioManager
            sharedState={sharedState}
            sharedSetters={sharedSetters}
          />
        )}
      </main>

      <AssumptionsPanel />
    </div>
  )
}
