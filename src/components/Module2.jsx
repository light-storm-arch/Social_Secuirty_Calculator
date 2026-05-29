import React, { useState, useRef, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Legend, ResponsiveContainer
} from 'recharts'
import { getFRA, benefitFactor, backOutPIA, breakevenAnalysis } from '../engine/ssEngine.js'
import { downloadCsv } from '../utils/exportCsv.js'
import { exportPdf } from '../utils/exportPdf.js'

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6']

function resolveEstimateAtAge(person) {
  if (person.estimateAtAgeMode === 'FRA') return getFRA(person.birthYear)
  return person.estimateAtAge ?? { years: 62, months: 0 }
}

function getPIA(person) {
  const eAtAge = resolveEstimateAtAge(person)
  return backOutPIA(person.estimate, eAtAge, person.birthYear)
}

function makeDefaultStrategies(pia, fra) {
  return [
    { label: 'Claim at 62', claimAge: { years: 62, months: 0 }, monthlyBenefit: pia * benefitFactor({ years: 62, months: 0 }, fra) },
    { label: 'Claim at 70', claimAge: { years: 70, months: 0 }, monthlyBenefit: pia * benefitFactor({ years: 70, months: 0 }, fra) },
  ]
}

export default function Module2({ sharedState }) {
  const { mode, personA, personB } = sharedState
  const piaA = useMemo(() => getPIA(personA), [personA])
  const fraA = useMemo(() => getFRA(personA.birthYear), [personA.birthYear])
  const piaB = useMemo(() => (mode === 'couple' ? getPIA(personB) : 0), [personB, mode])
  const fraB = useMemo(() => (mode === 'couple' ? getFRA(personB.birthYear) : null), [personB, mode])

  const [invest, setInvest] = useState(false)
  const [investRate, setInvestRate] = useState(0.02)
  const [strategies, setStrategies] = useState(() => makeDefaultStrategies(piaA, fraA))

  const chartRef = useRef(null)

  // Recompute strategies when PIA or FRA changes
  const effectivePia = mode === 'single' ? piaA : (piaA + (piaB || 0))
  const effectiveFra = fraA

  function addStrategy() {
    const claimAge = { years: 67, months: 0 }
    const monthly = piaA * benefitFactor(claimAge, fraA) + (mode === 'couple' ? (piaB || 0) * benefitFactor(claimAge, fraB || fraA) : 0)
    setStrategies(prev => [...prev, {
      label: `Claim at ${claimAge.years}`,
      claimAge,
      monthlyBenefit: monthly,
    }])
  }

  function removeStrategy(idx) {
    setStrategies(prev => prev.filter((_, i) => i !== idx))
  }

  function updateStrategy(idx, field, rawVal) {
    setStrategies(prev => {
      const updated = [...prev]
      const s = { ...updated[idx] }
      if (field === 'label') {
        s.label = rawVal
      } else if (field === 'claimYears') {
        const years = parseInt(rawVal) || 62
        const claimAge = { years, months: s.claimAge.months }
        const monthly = piaA * benefitFactor(claimAge, fraA) + (mode === 'couple' ? (piaB || 0) * benefitFactor(claimAge, fraB || fraA) : 0)
        s.claimAge = claimAge
        s.monthlyBenefit = monthly
      } else if (field === 'claimMonths') {
        const months = parseInt(rawVal) || 0
        const claimAge = { years: s.claimAge.years, months }
        const monthly = piaA * benefitFactor(claimAge, fraA) + (mode === 'couple' ? (piaB || 0) * benefitFactor(claimAge, fraB || fraA) : 0)
        s.claimAge = claimAge
        s.monthlyBenefit = monthly
      }
      updated[idx] = s
      return updated
    })
  }

  const rate = invest ? investRate : 0
  const startAge = Math.max(62, Math.ceil(personA.currentAge))
  const endAge = 100

  const analysis = useMemo(() => {
    if (strategies.length === 0) return null
    return breakevenAnalysis(strategies, startAge, endAge, rate)
  }, [strategies, startAge, endAge, rate])

  const chartData = useMemo(() => {
    if (!analysis) return []
    return analysis.rows.map(r => {
      const obj = { age: r.age }
      strategies.forEach((s, i) => { obj[s.label] = Math.round(r.values[i]) })
      return obj
    })
  }, [analysis, strategies])

  function handleCsv() {
    if (!analysis) return
    const headers = ['Age', ...strategies.map(s => s.label)]
    const rows = analysis.rows.map(r => [r.age, ...r.values.map(v => Math.round(v))])
    downloadCsv('breakeven_analysis.csv', headers, rows)
  }

  async function handlePdf() {
    if (!analysis) return
    const headers = ['Age', ...strategies.map(s => s.label)]
    const rows = analysis.rows.map(r => [r.age, ...r.values.map(v => `$${Math.round(v).toLocaleString()}`)])
    await exportPdf({
      title: 'Break-Even Analysis',
      inputs: {
        'Invest toggle': invest ? `On (r=${(investRate * 100).toFixed(1)}%)` : 'Off',
        'Start age': startAge,
      },
      headers,
      rows,
      chartRef,
    })
  }

  return (
    <div>
      <div className="card">
        <div className="card-title">Strategies</div>
        {strategies.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', background: COLORS[i % COLORS.length], flexShrink: 0 }} />
            <input
              className="form-input"
              style={{ width: 160 }}
              value={s.label}
              onChange={e => updateStrategy(i, 'label', e.target.value)}
              placeholder="Label"
            />
            <span style={{ fontSize: '0.82rem', color: '#4b5a7a' }}>Claim Year:</span>
            <input
              type="number"
              className="form-input"
              style={{ width: 80 }}
              min={62}
              max={70}
              value={s.claimAge.years}
              onChange={e => updateStrategy(i, 'claimYears', e.target.value)}
            />
            <span style={{ fontSize: '0.82rem', color: '#4b5a7a' }}>Month:</span>
            <input
              type="number"
              className="form-input"
              style={{ width: 60 }}
              min={0}
              max={11}
              value={s.claimAge.months}
              onChange={e => updateStrategy(i, 'claimMonths', e.target.value)}
            />
            <span style={{ fontSize: '0.82rem', color: '#4b5a7a' }}>
              ${Math.round(s.monthlyBenefit).toLocaleString()}/mo
            </span>
            {strategies.length > 2 && (
              <button className="btn btn-danger btn-sm" onClick={() => removeStrategy(i)}>Remove</button>
            )}
          </div>
        ))}
        <button className="btn btn-secondary btn-sm" onClick={addStrategy}>+ Add Strategy</button>
      </div>

      <div className="card">
        <div className="card-title">Investment Assumptions</div>
        <div className="toggle-row">
          <label className="toggle-switch">
            <input type="checkbox" checked={invest} onChange={e => setInvest(e.target.checked)} />
            <span className="toggle-slider" />
          </label>
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Invest Benefits</span>
          {invest && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 16 }}>
              <span style={{ fontSize: '0.82rem', color: '#4b5a7a' }}>Real rate r:</span>
              <input
                type="number"
                className="form-input"
                style={{ width: 90 }}
                min={0}
                max={0.2}
                step={0.005}
                value={investRate}
                onChange={e => setInvestRate(parseFloat(e.target.value) || 0)}
              />
              <span style={{ fontSize: '0.82rem', color: '#4b5a7a' }}>{(investRate * 100).toFixed(1)}%</span>
            </div>
          )}
        </div>
        <p style={{ fontSize: '0.78rem', color: '#6b7a9a', fontStyle: 'italic' }}>
          Taxes on benefits and investment gains are out of scope. Real rate <em>r</em> assumes 100% of benefits are invested with no withdrawals.
        </p>
      </div>

      <div className="card">
        <div className="card-title">Cumulative Benefits Over Time</div>
        {analysis && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {analysis.crossovers.map((c, i) => (
                c.age !== null && (
                  <span key={i} className="crossover-badge">
                    {strategies[c.stratA].label} vs {strategies[c.stratB].label}: break-even age {c.age}
                  </span>
                )
              ))}
            </div>
            <div className="chart-container" ref={chartRef}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8ecf4" />
                  <XAxis dataKey="age" label={{ value: 'Age', position: 'insideBottom', offset: -4, fontSize: 12 }} />
                  <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} width={70} />
                  <Tooltip formatter={(v) => `$${v.toLocaleString()}`} />
                  <Legend />
                  {strategies.map((s, i) => (
                    <Line
                      key={s.label}
                      type="monotone"
                      dataKey={s.label}
                      stroke={COLORS[i % COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                  {analysis.crossovers.map((c, i) =>
                    c.age !== null ? (
                      <ReferenceLine
                        key={i}
                        x={c.age}
                        stroke="#6b7a9a"
                        strokeDasharray="4 3"
                        label={{ value: `B/E ${c.age}`, fill: '#4b5a7a', fontSize: 10 }}
                      />
                    ) : null
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="btn-group">
              <button className="btn btn-secondary btn-sm" onClick={handleCsv}>Export CSV</button>
              <button className="btn btn-secondary btn-sm" onClick={handlePdf}>Export PDF</button>
            </div>
            <div className="table-wrap" style={{ maxHeight: 300, marginTop: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th>Age</th>
                    {strategies.map((s, i) => <th key={i}>{s.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {analysis.rows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.age}</td>
                      {r.values.map((v, j) => <td key={j}>${Math.round(v).toLocaleString()}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
