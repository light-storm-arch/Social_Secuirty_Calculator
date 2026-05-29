import React from 'react'

const ESTIMATE_AGE_OPTIONS = [
  { label: 'Age 62', value: JSON.stringify({ years: 62, months: 0 }) },
  { label: 'FRA', value: 'FRA' },
  { label: 'Age 70', value: JSON.stringify({ years: 70, months: 0 }) },
]

export default function PersonForm({ label, person, onChange }) {
  function handle(field, val) {
    onChange({ ...person, [field]: val })
  }

  function handleEstimateAtAge(val) {
    if (val === 'FRA') {
      // Will be resolved in engine; store sentinel
      onChange({ ...person, estimateAtAgeMode: 'FRA' })
    } else {
      onChange({ ...person, estimateAtAge: JSON.parse(val), estimateAtAgeMode: undefined })
    }
  }

  const estimateAtAgeVal = person.estimateAtAgeMode === 'FRA'
    ? 'FRA'
    : JSON.stringify(person.estimateAtAge ?? { years: 62, months: 0 })

  return (
    <div>
      {label && <div className="person-label">{label}</div>}
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Birth Year</label>
          <input
            type="number"
            className="form-input"
            value={person.birthYear}
            min={1930}
            max={2010}
            onChange={e => handle('birthYear', parseInt(e.target.value) || person.birthYear)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Sex</label>
          <select className="form-select" value={person.sex} onChange={e => handle('sex', e.target.value)}>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Current Age</label>
          <input
            type="number"
            className="form-input"
            value={person.currentAge}
            min={40}
            max={70}
            step={0.5}
            onChange={e => handle('currentAge', parseFloat(e.target.value) || person.currentAge)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Benefit Estimate ($)</label>
          <input
            type="number"
            className="form-input"
            value={person.estimate}
            min={0}
            max={99999}
            onChange={e => handle('estimate', parseFloat(e.target.value) || 0)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Estimate is at Age</label>
          <select
            className="form-select"
            value={estimateAtAgeVal}
            onChange={e => handleEstimateAtAge(e.target.value)}
          >
            {ESTIMATE_AGE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
