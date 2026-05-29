import React, { useState, useMemo, useEffect } from 'react'
import { getFRA, backOutPIA, benefitFactor, optimizeSingle, optimizeCouple } from '../engine/ssEngine.js'
import SensitivityHeatmap from './SensitivityHeatmap.jsx'

function resolveEstimateAtAge(person) {
  if (person.estimateAtAgeMode === 'FRA') return getFRA(person.birthYear)
  return person.estimateAtAge ?? { years: 62, months: 0 }
}

function getPIA(person) {
  const eAtAge = resolveEstimateAtAge(person)
  return backOutPIA(person.estimate, eAtAge, person.birthYear)
}

function ageLabel(a) {
  if (!a) return '-'
  if (a.months === 0) return `${a.years}`
  return `${a.years}y${a.months}m`
}

function buildSingleHeatmapData(matrix, mode, invest, deathAgeRange) {
  // X = claim age (years 62-70), Y = death age (deterministic) or return rate (probabilistic)
  if (mode === 'deterministic') {
    // We need to re-run for each death age
    return null // Handled separately
  }
  // Probabilistic: claim age vs return rate — but matrix is single-dim over claim ages
  // We'll show claim age on X, benefit on Y (just the matrix values)
  return null
}

// Generate deterministic heatmap data for single person
function genSingleDetHeatmap(piaA, fraA, person, deathAges, investRateFixed, startAge) {
  const data = []
  const xValues = [] // claim age months -> label
  const yValues = [...deathAges]

  for (let tm = 62 * 12; tm <= 70 * 12; tm += 12) {
    const years = Math.floor(tm / 12)
    xValues.push(years)
  }

  for (const da of deathAges) {
    for (let tm = 62 * 12; tm <= 70 * 12; tm += 12) {
      const years = Math.floor(tm / 12)
      const claimAge = { years, months: 0 }
      const monthly = piaA * benefitFactor(claimAge, fraA)
      let balance = 0
      for (let age = startAge; age <= da; age++) {
        const income = age >= years ? monthly * 12 : 0
        if (investRateFixed > 0) {
          balance = balance * (1 + investRateFixed) + income
        } else {
          balance += income
        }
      }
      data.push({ xVal: years, yVal: da, value: balance })
    }
  }
  return { data, xValues, yValues }
}

// Generate probabilistic heatmap: claim age vs return rate
function genSingleProbHeatmap(piaA, fraA, person, investRates) {
  const data = []
  const xValues = []
  const yValues = [...investRates]
  const startAge = Math.max(62, Math.ceil(person.currentAge))

  for (let tm = 62 * 12; tm <= 70 * 12; tm += 12) {
    xValues.push(Math.floor(tm / 12))
  }

  for (const r of investRates) {
    const result = optimizeSingle({
      birthYear: person.birthYear,
      currentAge: person.currentAge,
      sex: person.sex,
      pia: piaA,
      mode: 'probabilistic',
      investRate: r,
    })
    for (const entry of result.matrix) {
      if (entry.claimAge.months !== 0) continue
      data.push({ xVal: entry.claimAge.years, yVal: parseFloat(r.toFixed(3)), value: entry.value })
    }
  }
  return { data, xValues, yValues: investRates.map(r => parseFloat(r.toFixed(3))) }
}

export default function Module3({ sharedState }) {
  const { mode, personA, personB } = sharedState
  const [calcMode, setCalcMode] = useState('deterministic')
  const [deathAgeA, setDeathAgeA] = useState(85)
  const [deathAgeB, setDeathAgeB] = useState(85)
  const [invest, setInvest] = useState(false)
  const [investRate, setInvestRate] = useState(0.02)

  // Heatmap axis range controls
  const [deathAgeMin, setDeathAgeMin] = useState(70)
  const [deathAgeMax, setDeathAgeMax] = useState(100)
  const [rateMin, setRateMin] = useState(0)
  const [rateMax, setRateMax] = useState(8)   // stored as whole-number percent, converted on use
  const [claimAgeMin, setClaimAgeMin] = useState(62)
  const [claimAgeMax, setClaimAgeMax] = useState(70)

  const getDefaultAxes = (cm, m) => {
    if (m === 'single') {
      return cm === 'deterministic'
        ? { x: 'claimAge', y: 'deathAge' }
        : { x: 'claimAge', y: 'returnRate' }
    }
    return cm === 'deterministic'
      ? { x: 'claimAgeA', y: 'claimAgeB' }
      : { x: 'claimAgeA', y: 'claimAgeB' }
  }

  const [heatXAxis, setHeatXAxis] = useState(() => getDefaultAxes('deterministic', 'single').x)
  const [heatYAxis, setHeatYAxis] = useState(() => getDefaultAxes('deterministic', 'single').y)

  useEffect(() => {
    const defaults = getDefaultAxes(calcMode, mode)
    setHeatXAxis(defaults.x)
    setHeatYAxis(defaults.y)
  }, [calcMode, mode])

  const piaA = useMemo(() => getPIA(personA), [personA])
  const fraA = useMemo(() => getFRA(personA.birthYear), [personA.birthYear])
  const piaB = useMemo(() => (mode === 'couple' ? getPIA(personB) : 0), [personB, mode])
  const fraB = useMemo(() => (mode === 'couple' ? getFRA(personB.birthYear) : null), [personB, mode])

  const rate = invest ? investRate : 0

  const result = useMemo(() => {
    if (mode === 'single') {
      return optimizeSingle({
        birthYear: personA.birthYear,
        currentAge: personA.currentAge,
        sex: personA.sex,
        pia: piaA,
        mode: calcMode,
        deathAge: deathAgeA,
        investRate: rate,
      })
    } else {
      return optimizeCouple({
        paramsA: {
          birthYear: personA.birthYear,
          currentAge: personA.currentAge,
          sex: personA.sex,
          pia: piaA,
          deathAge: deathAgeA,
        },
        paramsB: {
          birthYear: personB.birthYear,
          currentAge: personB.currentAge,
          sex: personB.sex,
          pia: piaB,
          deathAge: deathAgeB,
        },
        mode: calcMode,
        investRate: rate,
      })
    }
  }, [mode, personA, personB, piaA, piaB, calcMode, deathAgeA, deathAgeB, rate])

  // Heatmap data
  const startAge = Math.max(62, Math.ceil(personA.currentAge))
  const safeDeathMin = Math.max(63, Math.min(deathAgeMin, deathAgeMax - 1))
  const safeDeathMax = Math.max(safeDeathMin + 1, Math.min(deathAgeMax, 120))
  const safeRateMin = Math.max(0, Math.min(rateMin, rateMax - 1))
  const safeRateMax = Math.max(safeRateMin + 1, Math.min(rateMax, 30))
  const safeClaimMin = Math.max(62, Math.min(claimAgeMin, claimAgeMax - 1))
  const safeClaimMax = Math.max(safeClaimMin + 1, Math.min(claimAgeMax, 70))
  const deathAgeRange = Array.from(
    { length: safeDeathMax - safeDeathMin + 1 },
    (_, i) => safeDeathMin + i
  )
  const investRateRange = (() => {
    const rates = []
    // Aim for ~9 steps across the range; snap to sensible 0.5% increments
    const span = safeRateMax - safeRateMin
    const step = span <= 4 ? 0.5 : span <= 8 ? 1 : 2
    for (let p = safeRateMin; p <= safeRateMax + 0.001; p += step) {
      rates.push(parseFloat((p / 100).toFixed(4)))
    }
    return rates
  })()
  const claimAgeRange = Array.from(
    { length: safeClaimMax - safeClaimMin + 1 },
    (_, i) => safeClaimMin + i
  )

  const heatmapData = useMemo(() => {
    if (mode === 'single') {
      // Build the raw grid (always claimAge on one axis, deathAge/returnRate on the other)
      const raw = calcMode === 'deterministic'
        ? genSingleDetHeatmap(piaA, fraA, personA, deathAgeRange, rate, startAge)
        : genSingleProbHeatmap(piaA, fraA, personA, investRateRange)
      // Transpose if user swapped the axes
      const xIsClaimAge = (calcMode === 'deterministic' && heatXAxis === 'claimAge') ||
                          (calcMode === 'probabilistic' && heatXAxis === 'claimAge')
      if (xIsClaimAge) return raw
      return {
        data: raw.data.map(d => ({ xVal: d.yVal, yVal: d.xVal, value: d.value })),
        xValues: raw.yValues,
        yValues: raw.xValues,
      }
    }

    // Couple mode
    if (!result?.heatmapMatrix) return null

    // Axes involving claim ages — pull from the already-computed heatmapMatrix
    if ((heatXAxis === 'claimAgeA' || heatXAxis === 'claimAgeB') &&
        (heatYAxis === 'claimAgeA' || heatYAxis === 'claimAgeB')) {
      const data = []
      const xSet = new Set()
      const ySet = new Set()
      for (const entry of result.heatmapMatrix) {
        if (entry.claimAgeA.months !== 0 || entry.claimAgeB.months !== 0) continue
        const xv = heatXAxis === 'claimAgeA' ? entry.claimAgeA.years : entry.claimAgeB.years
        const yv = heatYAxis === 'claimAgeA' ? entry.claimAgeA.years : entry.claimAgeB.years
        xSet.add(xv)
        ySet.add(yv)
        data.push({ xVal: xv, yVal: yv, value: entry.value })
      }
      return {
        data,
        xValues: [...xSet].sort((a, b) => a - b),
        yValues: [...ySet].sort((a, b) => a - b),
      }
    }

    // Couple deterministic: one claim age axis + one death age axis
    // Pin the other claim age at optimal; sweep the death age
    if (!result?.optimal) return null
    const pinnedClaimAgeA = result.optimal.claimAgeA ?? { years: 67, months: 0 }
    const pinnedClaimAgeB = result.optimal.claimAgeB ?? { years: 67, months: 0 }

    const claimAgeAxis = heatXAxis.startsWith('claimAge') ? heatXAxis : heatYAxis
    const deathAgeAxis = heatXAxis.startsWith('deathAge') ? heatXAxis : heatYAxis


    const data = []
    const xSet = new Set()
    const ySet = new Set()

    for (const da of deathAgeRange) {
      for (const ca of claimAgeRange) {
        const claimAgeA = deathAgeAxis === 'deathAgeA' ? pinnedClaimAgeA : { years: ca, months: 0 }
        const claimAgeB = deathAgeAxis === 'deathAgeB' ? pinnedClaimAgeB : { years: ca, months: 0 }
        const xv = claimAgeAxis === heatXAxis ? ca : da
        const yv = claimAgeAxis === heatYAxis ? ca : da
        xSet.add(xv)
        ySet.add(yv)

        // Score this combo
        const monthlyA = piaA * benefitFactor(claimAgeA, fraA)
        const monthlyB = piaB * benefitFactor(claimAgeB, fraB ?? fraA)
        const deathA = deathAgeAxis === 'deathAgeA' ? da : deathAgeA
        const deathB = deathAgeAxis === 'deathAgeB' ? da : deathAgeB
        let val = 0
        const end = Math.max(deathA, deathB)
        for (let age = Math.ceil(startAge); age <= end; age++) {
          const aAlive = age <= deathA
          const bAlive = age <= deathB
          const aStarted = age >= claimAgeA.years
          const bStarted = age >= claimAgeB.years
          let income = 0
          if (aAlive && bAlive) income = (aStarted ? monthlyA : 0) * 12 + (bStarted ? monthlyB : 0) * 12
          else if (aAlive) income = (aStarted ? Math.max(monthlyA, monthlyB) : 0) * 12
          else if (bAlive) income = (bStarted ? Math.max(monthlyB, monthlyA) : 0) * 12
          val = rate > 0 ? val * (1 + rate) + income : val + income
        }
        data.push({ xVal: xv, yVal: yv, value: val })
      }
    }
    return {
      data,
      xValues: [...xSet].sort((a, b) => a - b),
      yValues: [...ySet].sort((a, b) => a - b),
    }
  }, [mode, calcMode, heatXAxis, heatYAxis, piaA, fraA, personA, piaB, fraB, personB, rate, result, deathAgeA, deathAgeB, deathAgeRange, investRateRange, claimAgeRange])

  const optimal = result?.optimal

  return (
    <div>
      <div className="card">
        <div className="card-title">Optimization Mode</div>
        <div className="seg-control">
          <button className={`seg-btn ${calcMode === 'deterministic' ? 'active' : ''}`} onClick={() => setCalcMode('deterministic')}>
            Deterministic
          </button>
          <button className={`seg-btn ${calcMode === 'probabilistic' ? 'active' : ''}`} onClick={() => setCalcMode('probabilistic')}>
            Probabilistic
          </button>
        </div>

        {calcMode === 'deterministic' ? (
          <div className="form-grid" style={{ marginTop: 16 }}>
            <div className="form-group">
              <label className="form-label">Death Age {mode === 'couple' ? '— Person A' : ''}</label>
              <input type="number" className="form-input" min={62} max={120} value={deathAgeA} onChange={e => setDeathAgeA(parseInt(e.target.value) || 85)} />
            </div>
            {mode === 'couple' && (
              <div className="form-group">
                <label className="form-label">Death Age — Person B</label>
                <input type="number" className="form-input" min={62} max={120} value={deathAgeB} onChange={e => setDeathAgeB(parseInt(e.target.value) || 85)} />
              </div>
            )}
          </div>
        ) : (
          <div style={{ marginTop: 14, padding: '12px 16px', background: '#eff6ff', borderRadius: 8, fontSize: '0.85rem', color: '#1d4ed8' }}>
            Using SSA Period Life Table 2022 (2025 Trustees Report) for survival probabilities.{' '}
            <a href="https://www.ssa.gov/oact/STATS/table4c6.html" target="_blank" rel="noreferrer" style={{ color: '#1d4ed8', fontWeight: 600 }}>
              Source
            </a>
          </div>
        )}

        <div className="toggle-row" style={{ marginTop: 16 }}>
          <label className="toggle-switch">
            <input type="checkbox" checked={invest} onChange={e => setInvest(e.target.checked)} />
            <span className="toggle-slider" />
          </label>
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Invest Benefits</span>
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
      </div>

      {optimal && (
        <div className="result-card">
          <div className="result-grid">
            {mode === 'single' ? (
              <>
                <div>
                  <h3>Optimal Claim Age</h3>
                  <div className="result-value">{ageLabel(optimal.claimAge)}</div>
                  <div className="result-sub">${Math.round(optimal.monthlyBenefit).toLocaleString()}/mo</div>
                </div>
                <div>
                  <h3>Lifetime Score</h3>
                  <div className="result-value">${Math.round(optimal.value / 1000).toLocaleString()}k</div>
                  <div className="result-sub">{calcMode === 'probabilistic' ? 'Survival-weighted' : `Through age ${deathAgeA}`}</div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <h3>Person A — Claim At</h3>
                  <div className="result-value">{ageLabel(optimal.claimAgeA)}</div>
                  <div className="result-sub">${Math.round(optimal.monthlyA).toLocaleString()}/mo</div>
                </div>
                <div>
                  <h3>Person B — Claim At</h3>
                  <div className="result-value">{ageLabel(optimal.claimAgeB)}</div>
                  <div className="result-sub">${Math.round(optimal.monthlyB).toLocaleString()}/mo</div>
                </div>
                <div>
                  <h3>Household Score</h3>
                  <div className="result-value">${Math.round(optimal.value / 1000).toLocaleString()}k</div>
                  <div className="result-sub">{calcMode === 'probabilistic' ? 'Survival-weighted' : 'Cumulative'}</div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">Sensitivity Heatmap</div>

        {/* Axis selector UI */}
        {(() => {
          const axisOptions = mode === 'single'
            ? calcMode === 'deterministic'
              ? ['claimAge', 'deathAge']
              : ['claimAge', 'returnRate']
            : calcMode === 'deterministic'
              ? ['claimAgeA', 'claimAgeB', 'deathAgeA', 'deathAgeB']
              : ['claimAgeA', 'claimAgeB', 'returnRate']
          const axisLabels = {
            claimAge: 'Claim Age',
            deathAge: 'Death Age',
            returnRate: 'Return Rate',
            claimAgeA: 'Person A Claim Age',
            claimAgeB: 'Person B Claim Age',
            deathAgeA: 'Person A Death Age',
            deathAgeB: 'Person B Death Age',
          }
          return (
            <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ minWidth: 160 }}>
                <label className="form-label">X Axis</label>
                <select className="form-input" value={heatXAxis} onChange={e => setHeatXAxis(e.target.value)}>
                  {axisOptions.map(opt => (
                    <option key={opt} value={opt}>{axisLabels[opt]}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ minWidth: 160 }}>
                <label className="form-label">Y Axis</label>
                <select className="form-input" value={heatYAxis} onChange={e => setHeatYAxis(e.target.value)}>
                  {axisOptions.filter(opt => opt !== heatXAxis).map(opt => (
                    <option key={opt} value={opt}>{axisLabels[opt]}</option>
                  ))}
                </select>
              </div>
            </div>
          )
        })()}

        {/* Axis range controls */}
        {(() => {
          const activeAxes = new Set([heatXAxis, heatYAxis])
          const showDeath = activeAxes.has('deathAge') || activeAxes.has('deathAgeA') || activeAxes.has('deathAgeB')
          const showRate  = activeAxes.has('returnRate')
          const showClaim = activeAxes.has('claimAge') || activeAxes.has('claimAgeA') || activeAxes.has('claimAgeB')
          if (!showDeath && !showRate && !showClaim) return null
          return (
            <details style={{ marginBottom: 14 }}>
              <summary style={{ cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: '#3b82f6', userSelect: 'none' }}>
                Axis Ranges
              </summary>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 10, padding: '12px 0' }}>
                {showDeath && (
                  <div>
                    <div className="form-label" style={{ marginBottom: 6 }}>Death Age Range</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="number" className="form-input" style={{ width: 70 }} min={63} max={119}
                        value={deathAgeMin} onChange={e => setDeathAgeMin(parseInt(e.target.value) || 70)} />
                      <span style={{ color: '#4b5a7a' }}>to</span>
                      <input type="number" className="form-input" style={{ width: 70 }} min={64} max={120}
                        value={deathAgeMax} onChange={e => setDeathAgeMax(parseInt(e.target.value) || 100)} />
                    </div>
                  </div>
                )}
                {showRate && (
                  <div>
                    <div className="form-label" style={{ marginBottom: 6 }}>Return Rate Range (%)</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="number" className="form-input" style={{ width: 70 }} min={0} max={29} step={0.5}
                        value={rateMin} onChange={e => setRateMin(parseFloat(e.target.value) || 0)} />
                      <span style={{ color: '#4b5a7a' }}>to</span>
                      <input type="number" className="form-input" style={{ width: 70 }} min={0.5} max={30} step={0.5}
                        value={rateMax} onChange={e => setRateMax(parseFloat(e.target.value) || 8)} />
                      <span style={{ fontSize: '0.8rem', color: '#4b5a7a' }}>%</span>
                    </div>
                  </div>
                )}
                {showClaim && (
                  <div>
                    <div className="form-label" style={{ marginBottom: 6 }}>Claim Age Range</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="number" className="form-input" style={{ width: 70 }} min={62} max={69}
                        value={claimAgeMin} onChange={e => setClaimAgeMin(parseInt(e.target.value) || 62)} />
                      <span style={{ color: '#4b5a7a' }}>to</span>
                      <input type="number" className="form-input" style={{ width: 70 }} min={63} max={70}
                        value={claimAgeMax} onChange={e => setClaimAgeMax(parseInt(e.target.value) || 70)} />
                    </div>
                  </div>
                )}
              </div>
            </details>
          )
        })()}

        {heatmapData ? (() => {
          const axisLabels = {
            claimAge: 'Claim Age', deathAge: 'Death Age', returnRate: 'Return Rate (%)',
            claimAgeA: 'Person A Claim Age', claimAgeB: 'Person B Claim Age',
            deathAgeA: 'Person A Death Age', deathAgeB: 'Person B Death Age',
          }
          const optimalCell = heatmapData.data && heatmapData.data.length > 0
            ? heatmapData.data.reduce((best, cell) => cell.value > best.value ? cell : best, heatmapData.data[0])
            : null
          return (
            <SensitivityHeatmap
              data={heatmapData.data}
              xLabel={axisLabels[heatXAxis] ?? heatXAxis}
              yLabel={axisLabels[heatYAxis] ?? heatYAxis}
              xValues={heatmapData.xValues}
              yValues={heatmapData.yValues}
              optimalX={optimalCell?.xVal}
              optimalY={optimalCell?.yVal}
            />
          )
        })() : (
          <div className="loading-text">Computing heatmap...</div>
        )}
      </div>
    </div>
  )
}
