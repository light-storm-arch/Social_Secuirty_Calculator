import React, { useState, useRef, useMemo, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Legend, ResponsiveContainer
} from 'recharts'
import { getFRA, benefitFactor, backOutPIA, breakevenAnalysis, coupleCumulativeByAge } from '../engine/ssEngine.js'
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

function singleDefaults(pia, fra) {
  return [
    { label: 'Claim at 62', claimAge: { years: 62, months: 0 }, monthlyBenefit: pia * benefitFactor({ years: 62, months: 0 }, fra) },
    { label: 'Claim at 70', claimAge: { years: 70, months: 0 }, monthlyBenefit: pia * benefitFactor({ years: 70, months: 0 }, fra) },
  ]
}

function coupleDefaults() {
  return [
    { label: 'Both at 62', claimAgeA: { years: 62, months: 0 }, claimAgeB: { years: 62, months: 0 } },
    { label: 'Both at 70', claimAgeA: { years: 70, months: 0 }, claimAgeB: { years: 70, months: 0 } },
    { label: 'A@70, B@62', claimAgeA: { years: 70, months: 0 }, claimAgeB: { years: 62, months: 0 } },
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
  const [strategies, setStrategies] = useState(
    () => mode === 'couple' ? coupleDefaults() : singleDefaults(piaA, fraA),
  )

  // Reset strategies when toggling single ↔ couple
  useEffect(() => {
    setStrategies(mode === 'couple' ? coupleDefaults() : singleDefaults(piaA, fraA))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // Recompute single-mode monthly benefits when A's record changes
  useEffect(() => {
    if (mode === 'single') {
      setStrategies(singleDefaults(piaA, fraA))
    }
  }, [piaA, fraA, mode])

  const chartRef = useRef(null)
  const rate = invest ? investRate : 0
  const startAge = mode === 'couple'
    ? Math.max(62, Math.ceil(personA.currentAge), Math.ceil(personB?.currentAge ?? 0))
    : Math.max(62, Math.ceil(personA.currentAge))
  const endAge = 100

  function addStrategy() {
    if (mode === 'couple') {
      setStrategies(prev => [...prev, {
        label: `Strategy ${prev.length + 1}`,
        claimAgeA: { years: 67, months: 0 },
        claimAgeB: { years: 67, months: 0 },
      }])
    } else {
      const claimAge = { years: 67, months: 0 }
      setStrategies(prev => [...prev, {
        label: `Claim at 67`,
        claimAge,
        monthlyBenefit: piaA * benefitFactor(claimAge, fraA),
      }])
    }
  }

  function removeStrategy(idx) {
    setStrategies(prev => prev.filter((_, i) => i !== idx))
  }

  function updateStrategy(idx, patch) {
    setStrategies(prev => {
      const updated = [...prev]
      const s = { ...updated[idx], ...patch }
      if (mode === 'single' && (patch.claimAge != null)) {
        s.monthlyBenefit = piaA * benefitFactor(s.claimAge, fraA)
      }
      updated[idx] = s
      return updated
    })
  }

  function updateClaim(idx, who, field, raw) {
    const key = who === 'A' ? (mode === 'single' ? 'claimAge' : 'claimAgeA') : 'claimAgeB'
    setStrategies(prev => {
      const updated = [...prev]
      const s = { ...updated[idx] }
      const cur = s[key] ?? { years: 67, months: 0 }
      const next = { ...cur }
      if (field === 'years') next.years = Math.max(62, Math.min(70, parseInt(raw) || 62))
      if (field === 'months') next.months = Math.max(0, Math.min(11, parseInt(raw) || 0))
      s[key] = next
      if (mode === 'single' && who === 'A') {
        s.monthlyBenefit = piaA * benefitFactor(next, fraA)
      }
      updated[idx] = s
      return updated
    })
  }

  // Precompute per-strategy monthly amounts and cumulative rows.
  const computed = useMemo(() => {
    if (strategies.length === 0) return null
    if (mode === 'couple') {
      const paramsA = { birthYear: personA.birthYear, pia: piaA }
      const paramsB = { birthYear: personB.birthYear, pia: piaB }
      const perStrat = strategies.map(s => coupleCumulativeByAge(
        paramsA, paramsB, s.claimAgeA, s.claimAgeB, startAge, endAge, rate,
      ))
      const rows = []
      const len = perStrat[0].rows.length
      for (let i = 0; i < len; i++) {
        rows.push({
          age: perStrat[0].rows[i].age,
          values: perStrat.map(p => p.rows[i].value),
        })
      }
      const crossovers = []
      for (let a = 0; a < strategies.length; a++) {
        for (let b = a + 1; b < strategies.length; b++) {
          let crossoverAge = null
          for (let i = 1; i < rows.length; i++) {
            const prev = rows[i - 1].values[b] - rows[i - 1].values[a]
            const curr = rows[i].values[b] - rows[i].values[a]
            if (prev < 0 && curr >= 0) { crossoverAge = rows[i].age; break }
          }
          crossovers.push({ stratA: a, stratB: b, age: crossoverAge })
        }
      }
      return {
        rows, crossovers,
        monthly: perStrat.map(p => ({ a: p.monthlyA, b: p.monthlyB })),
      }
    }
    const a = breakevenAnalysis(strategies, startAge, endAge, rate)
    return {
      ...a,
      monthly: strategies.map(s => ({ a: s.monthlyBenefit })),
    }
  }, [strategies, startAge, endAge, rate, mode, personA, personB, piaA, piaB])

  const chartData = useMemo(() => {
    if (!computed) return []
    return computed.rows.map(r => {
      const obj = { age: r.age }
      strategies.forEach((s, i) => { obj[s.label] = Math.round(r.values[i]) })
      return obj
    })
  }, [computed, strategies])

  function handleCsv() {
    if (!computed) return
    const headers = ['Age', ...strategies.map(s => s.label)]
    const rows = computed.rows.map(r => [r.age, ...r.values.map(v => Math.round(v))])
    downloadCsv('breakeven_analysis.csv', headers, rows)
  }

  async function handlePdf() {
    if (!computed) return
    const headers = ['Age', ...strategies.map(s => s.label)]
    const rows = computed.rows.map(r => [r.age, ...r.values.map(v => `$${Math.round(v).toLocaleString()}`)])
    await exportPdf({
      title: 'Break-Even Analysis',
      inputs: {
        'Mode': mode === 'couple' ? 'Couple' : 'Single',
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
        <div className="card-title">
          Strategies {mode === 'couple' && <span style={{ fontSize: '0.78rem', color: '#6b7a9a', fontWeight: 400 }}>— each strategy has separate claim ages for A and B</span>}
        </div>
        {strategies.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap', paddingBottom: 8, borderBottom: i < strategies.length - 1 ? '1px solid #eef1f8' : 'none' }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', background: COLORS[i % COLORS.length], flexShrink: 0 }} />
            <input
              className="form-input"
              style={{ width: 160 }}
              value={s.label}
              onChange={e => updateStrategy(i, { label: e.target.value })}
              placeholder="Label"
            />
            {mode === 'couple' ? (
              <>
                <span style={{ fontSize: '0.82rem', color: '#4b5a7a', fontWeight: 600 }}>A:</span>
                <input type="number" className="form-input" style={{ width: 60 }} min={62} max={70}
                  value={s.claimAgeA.years}
                  onChange={e => updateClaim(i, 'A', 'years', e.target.value)} />
                <span style={{ fontSize: '0.78rem', color: '#6b7a9a' }}>y</span>
                <input type="number" className="form-input" style={{ width: 50 }} min={0} max={11}
                  value={s.claimAgeA.months}
                  onChange={e => updateClaim(i, 'A', 'months', e.target.value)} />
                <span style={{ fontSize: '0.78rem', color: '#6b7a9a' }}>m</span>
                <span style={{ fontSize: '0.82rem', color: '#4b5a7a', fontWeight: 600, marginLeft: 8 }}>B:</span>
                <input type="number" className="form-input" style={{ width: 60 }} min={62} max={70}
                  value={s.claimAgeB.years}
                  onChange={e => updateClaim(i, 'B', 'years', e.target.value)} />
                <span style={{ fontSize: '0.78rem', color: '#6b7a9a' }}>y</span>
                <input type="number" className="form-input" style={{ width: 50 }} min={0} max={11}
                  value={s.claimAgeB.months}
                  onChange={e => updateClaim(i, 'B', 'months', e.target.value)} />
                <span style={{ fontSize: '0.78rem', color: '#6b7a9a' }}>m</span>
                <span style={{ fontSize: '0.82rem', color: '#4b5a7a', marginLeft: 8 }}>
                  A: ${Math.round(computed?.monthly?.[i]?.a ?? 0).toLocaleString()}/mo, B: ${Math.round(computed?.monthly?.[i]?.b ?? 0).toLocaleString()}/mo
                </span>
              </>
            ) : (
              <>
                <span style={{ fontSize: '0.82rem', color: '#4b5a7a' }}>Claim Year:</span>
                <input type="number" className="form-input" style={{ width: 80 }} min={62} max={70}
                  value={s.claimAge.years}
                  onChange={e => updateClaim(i, 'A', 'years', e.target.value)} />
                <span style={{ fontSize: '0.82rem', color: '#4b5a7a' }}>Month:</span>
                <input type="number" className="form-input" style={{ width: 60 }} min={0} max={11}
                  value={s.claimAge.months}
                  onChange={e => updateClaim(i, 'A', 'months', e.target.value)} />
                <span style={{ fontSize: '0.82rem', color: '#4b5a7a' }}>
                  ${Math.round(s.monthlyBenefit).toLocaleString()}/mo
                </span>
              </>
            )}
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
          {mode === 'couple'
            ? 'Couple breakeven assumes both spouses live through the analysis window and includes spousal top-up (gated on both having filed). Survivor scenarios are modeled in the Optimizer tab.'
            : 'Taxes on benefits and investment gains are out of scope. Real rate r assumes 100% of benefits are invested with no withdrawals.'}
        </p>
      </div>

      <div className="card">
        <div className="card-title">Cumulative Benefits Over Time</div>
        {computed && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {computed.crossovers.map((c, i) => (
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
                  {computed.crossovers.map((c, i) =>
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
                  {computed.rows.map((r, i) => (
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
