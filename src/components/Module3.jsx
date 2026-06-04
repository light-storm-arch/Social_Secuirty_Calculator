import React, { useState, useMemo, useEffect } from 'react'
import { getFRA, backOutPIA, benefitFactor, optimizeSingle, optimizeCouple, spousalTopUp, survivorAmountFromWorker, survivorReductionFactor } from '../engine/ssEngine.js'
import { lifeExpectancy, pDeathAtAge } from '../engine/mortalityTable.js'
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

// Single-person heatmap: claim age (X) vs death age (Y).
// Cell value = deterministic lifetime $ if you die at that age, with optional invest rate.
function genSingleClaimDeathHeatmap(piaA, fraA, claimAges, deathAges, investRate, startAge) {
  const data = []
  const xValues = [...claimAges]
  const yValues = [...deathAges]

  for (const da of deathAges) {
    for (const years of claimAges) {
      const claimAge = { years, months: 0 }
      const monthly = piaA * benefitFactor(claimAge, fraA)
      let balance = 0
      for (let age = startAge; age <= da; age++) {
        const income = age >= years ? monthly * 12 : 0
        balance = balance * (1 + investRate) + income
      }
      data.push({ xVal: years, yVal: da, value: balance })
    }
  }
  return { data, xValues, yValues }
}

// Couple heatmap helper: compute household deterministic lifetime $ for a given
// (claimAgeA, claimAgeB, deathA, deathB). Mirrors optimizeCouple deterministic loop.
function coupleLifetimeValue({ paramsA, paramsB, claimAgeA, claimAgeB, deathA, deathB, investRate, startAge }) {
  const fraA = getFRA(paramsA.birthYear)
  const fraB = getFRA(paramsB.birthYear)
  const higherEarnerIsA = paramsA.pia >= paramsB.pia
  const monthlyA_own = paramsA.pia * benefitFactor(claimAgeA, fraA)
  const monthlyB_own = paramsB.pia * benefitFactor(claimAgeB, fraB)
  const tmA = claimAgeA.years * 12 + claimAgeA.months
  const tmB = claimAgeB.years * 12 + claimAgeB.months
  const spousalStartMonths = Math.max(tmA, tmB)
  const spousalStartAge = {
    years: Math.floor(spousalStartMonths / 12),
    months: spousalStartMonths % 12,
  }
  let topUpA = 0
  let topUpB = 0
  if (higherEarnerIsA) {
    topUpB = spousalTopUp(paramsA.pia, monthlyB_own, spousalStartAge, fraB)
  } else {
    topUpA = spousalTopUp(paramsB.pia, monthlyA_own, spousalStartAge, fraA)
  }
  const survAmtFromA = survivorAmountFromWorker(paramsA, claimAgeA, deathA)
  const survAmtFromB = survivorAmountFromWorker(paramsB, claimAgeB, deathB)
  const bSurvStartAge = Math.max(60, deathA)
  const aSurvStartAge = Math.max(60, deathB)
  const survPayToB = survAmtFromA * survivorReductionFactor(
    { years: bSurvStartAge, months: 0 }, fraB,
  )
  const survPayToA = survAmtFromB * survivorReductionFactor(
    { years: aSurvStartAge, months: 0 }, fraA,
  )
  const end = Math.max(deathA, deathB)
  let val = 0
  for (let age = Math.ceil(startAge); age <= end; age++) {
    const aAlive = age <= deathA
    const bAlive = age <= deathB
    const ageMonths = age * 12
    const aStarted = ageMonths >= tmA
    const bStarted = ageMonths >= tmB
    const bothFiled = aStarted && bStarted
    let income = 0
    if (aAlive && bAlive) {
      const aPay = (aStarted ? monthlyA_own : 0) + (bothFiled ? topUpA : 0)
      const bPay = (bStarted ? monthlyB_own : 0) + (bothFiled ? topUpB : 0)
      income = (aPay + bPay) * 12
    } else if (aAlive) {
      const ownPay = aStarted ? monthlyA_own : 0
      const survPay = age >= aSurvStartAge ? survPayToA : 0
      income = Math.max(ownPay, survPay) * 12
    } else if (bAlive) {
      const ownPay = bStarted ? monthlyB_own : 0
      const survPay = age >= bSurvStartAge ? survPayToB : 0
      income = Math.max(ownPay, survPay) * 12
    }
    val = val * (1 + investRate) + income
  }
  return val
}

// Build per-year cumulative rows for a single claim age (used by verification table)
function singleCumulative(pia, fra, claimAge, startAge, endAge, investRate) {
  const monthly = pia * benefitFactor(claimAge, fra)
  const tmClaim = claimAge.years * 12 + claimAge.months
  const rows = []
  let balance = 0
  for (let age = Math.ceil(startAge); age <= endAge; age++) {
    const income = age * 12 >= tmClaim ? monthly * 12 : 0
    balance = balance * (1 + investRate) + income
    rows.push({ age, value: balance })
  }
  return { monthly, rows }
}

// Per-year cumulative rows for a couple at a given claim combo
function coupleCumulative({ paramsA, paramsB, claimAgeA, claimAgeB, deathA, deathB, investRate, startAge }) {
  const fraA = getFRA(paramsA.birthYear)
  const fraB = getFRA(paramsB.birthYear)
  const higherEarnerIsA = paramsA.pia >= paramsB.pia
  const monthlyA_own = paramsA.pia * benefitFactor(claimAgeA, fraA)
  const monthlyB_own = paramsB.pia * benefitFactor(claimAgeB, fraB)
  const tmA = claimAgeA.years * 12 + claimAgeA.months
  const tmB = claimAgeB.years * 12 + claimAgeB.months
  const spousalStartMonths = Math.max(tmA, tmB)
  const spousalStartAge = {
    years: Math.floor(spousalStartMonths / 12),
    months: spousalStartMonths % 12,
  }
  let topUpA = 0
  let topUpB = 0
  if (higherEarnerIsA) {
    topUpB = spousalTopUp(paramsA.pia, monthlyB_own, spousalStartAge, fraB)
  } else {
    topUpA = spousalTopUp(paramsB.pia, monthlyA_own, spousalStartAge, fraA)
  }
  const survAmtFromA = survivorAmountFromWorker(paramsA, claimAgeA, deathA)
  const survAmtFromB = survivorAmountFromWorker(paramsB, claimAgeB, deathB)
  const bSurvStartAge = Math.max(60, deathA)
  const aSurvStartAge = Math.max(60, deathB)
  const survPayToB = survAmtFromA * survivorReductionFactor(
    { years: bSurvStartAge, months: 0 }, fraB,
  )
  const survPayToA = survAmtFromB * survivorReductionFactor(
    { years: aSurvStartAge, months: 0 }, fraA,
  )
  const end = Math.max(deathA, deathB)
  const rows = []
  let balance = 0
  for (let age = Math.ceil(startAge); age <= end; age++) {
    const aAlive = age <= deathA
    const bAlive = age <= deathB
    const ageMonths = age * 12
    const aStarted = ageMonths >= tmA
    const bStarted = ageMonths >= tmB
    const bothFiled = aStarted && bStarted
    let income = 0
    if (aAlive && bAlive) {
      const aPay = (aStarted ? monthlyA_own : 0) + (bothFiled ? topUpA : 0)
      const bPay = (bStarted ? monthlyB_own : 0) + (bothFiled ? topUpB : 0)
      income = (aPay + bPay) * 12
    } else if (aAlive) {
      const ownPay = aStarted ? monthlyA_own : 0
      const survPay = age >= aSurvStartAge ? survPayToA : 0
      income = Math.max(ownPay, survPay) * 12
    } else if (bAlive) {
      const ownPay = bStarted ? monthlyB_own : 0
      const survPay = age >= bSurvStartAge ? survPayToB : 0
      income = Math.max(ownPay, survPay) * 12
    }
    balance = balance * (1 + investRate) + income
    rows.push({ age, value: balance })
  }
  return {
    monthlyA: monthlyA_own + topUpA,
    monthlyB: monthlyB_own + topUpB,
    rows,
  }
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
  const [claimAgeMin, setClaimAgeMin] = useState(62)
  const [claimAgeMax, setClaimAgeMax] = useState(70)

  const getDefaultAxes = (cm, m) => {
    if (m === 'single') return { x: 'claimAge', y: 'deathAge' }
    return { x: 'claimAgeA', y: 'claimAgeB' }
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

  // Heatmap data. Couples must use max-of-both ages to match optimizeCouple.
  const startAge = mode === 'couple'
    ? Math.max(62, Math.ceil(personA.currentAge), Math.ceil(personB?.currentAge ?? 0))
    : Math.max(62, Math.ceil(personA.currentAge))
  const safeDeathMin = Math.max(63, Math.min(deathAgeMin, deathAgeMax - 1))
  const safeDeathMax = Math.max(safeDeathMin + 1, Math.min(deathAgeMax, 120))
  const safeClaimMin = Math.max(62, Math.min(claimAgeMin, claimAgeMax - 1))
  const safeClaimMax = Math.max(safeClaimMin + 1, Math.min(claimAgeMax, 70))
  const deathAgeRange = Array.from(
    { length: safeDeathMax - safeDeathMin + 1 },
    (_, i) => safeDeathMin + i,
  )
  const claimAgeRange = Array.from(
    { length: safeClaimMax - safeClaimMin + 1 },
    (_, i) => safeClaimMin + i,
  )

  // Life expectancy (probabilistic highlight target)
  const lifeExpA = useMemo(
    () => lifeExpectancy(personA.sex, Math.max(personA.currentAge, 62)),
    [personA.sex, personA.currentAge],
  )
  const lifeExpB = useMemo(
    () => (mode === 'couple' ? lifeExpectancy(personB.sex, Math.max(personB.currentAge, 62)) : null),
    [mode, personB?.sex, personB?.currentAge],
  )

  const heatmapData = useMemo(() => {
    if (mode === 'single') {
      // Always claim age × death age in both modes; rate is the user-toggled invest rate.
      const raw = genSingleClaimDeathHeatmap(piaA, fraA, claimAgeRange, deathAgeRange, rate, startAge)
      const xIsClaimAge = heatXAxis === 'claimAge'
      if (xIsClaimAge) return raw
      return {
        data: raw.data.map(d => ({ xVal: d.yVal, yVal: d.xVal, value: d.value })),
        xValues: raw.yValues,
        yValues: raw.xValues,
      }
    }

    // Couple mode
    if (!result?.heatmapMatrix) return null

    // Both axes are claim ages — pull from the already-computed heatmapMatrix
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

    // Couple: one claim age axis + one death age axis.
    // Pin the other claim age at optimal; for probabilistic mode also pin the
    // other spouse's death age at their life expectancy (otherwise default 85).
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

        const dA = deathAgeAxis === 'deathAgeA' ? da : deathAgeA
        const dB = deathAgeAxis === 'deathAgeB' ? da : deathAgeB
        const val = coupleLifetimeValue({
          paramsA: { birthYear: personA.birthYear, currentAge: personA.currentAge, pia: piaA },
          paramsB: { birthYear: personB.birthYear, currentAge: personB.currentAge, pia: piaB },
          claimAgeA, claimAgeB,
          deathA: dA, deathB: dB,
          investRate: rate, startAge,
        })
        data.push({ xVal: xv, yVal: yv, value: val })
      }
    }
    return {
      data,
      xValues: [...xSet].sort((a, b) => a - b),
      yValues: [...ySet].sort((a, b) => a - b),
    }
  }, [mode, calcMode, heatXAxis, heatYAxis, piaA, fraA, personA, piaB, fraB, personB, rate, result, deathAgeA, deathAgeB, startAge, deathAgeRange, claimAgeRange])

  // Row weights (P(death@age)) for probabilistic mode when an axis is a death age
  const heatmapRowWeights = useMemo(() => {
    if (calcMode !== 'probabilistic') return null
    const sexForAxis = (axis) => {
      if (axis === 'deathAge') return personA.sex
      if (axis === 'deathAgeA') return personA.sex
      if (axis === 'deathAgeB') return personB?.sex
      return null
    }
    const ageForAxis = (axis) => {
      if (axis === 'deathAge' || axis === 'deathAgeA') return personA.currentAge
      if (axis === 'deathAgeB') return personB?.currentAge
      return null
    }
    const isDeath = (axis) => axis === 'deathAge' || axis === 'deathAgeA' || axis === 'deathAgeB'
    if (!isDeath(heatYAxis)) return null
    const sex = sexForAxis(heatYAxis)
    const fromAge = Math.max(62, Math.ceil(ageForAxis(heatYAxis) ?? 62))
    if (!sex) return null
    const map = new Map()
    for (const da of deathAgeRange) {
      map.set(da, pDeathAtAge(sex, fromAge, da))
    }
    return map
  }, [calcMode, heatYAxis, personA, personB, deathAgeRange])

  // Probabilistic-mode optimal cell: the (claim age, death age) cell at life
  // expectancy that maximizes lifetime value within that row.
  const probOptimalCell = useMemo(() => {
    if (calcMode !== 'probabilistic') return null
    if (!heatmapData) return null
    const isDeath = (axis) => axis === 'deathAge' || axis === 'deathAgeA' || axis === 'deathAgeB'
    if (!isDeath(heatYAxis)) return null
    // Pick the death age in our grid closest to the relevant life expectancy
    const targetLE = (heatYAxis === 'deathAgeB' && lifeExpB != null) ? lifeExpB : lifeExpA
    let nearestDa = deathAgeRange[0]
    let best = Infinity
    for (const da of deathAgeRange) {
      const d = Math.abs(da - targetLE)
      if (d < best) { best = d; nearestDa = da }
    }
    // Find best cell in that row
    const rowCells = heatmapData.data.filter(c => c.yVal === nearestDa)
    if (rowCells.length === 0) return null
    const bestCell = rowCells.reduce((b, c) => c.value > b.value ? c : b, rowCells[0])
    return { x: bestCell.xVal, y: bestCell.yVal, lifeExpectancy: targetLE }
  }, [calcMode, heatmapData, heatYAxis, lifeExpA, lifeExpB, deathAgeRange])

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
            <div>
              Using SSA Period Life Table 2022 (2025 Trustees Report) for survival probabilities.{' '}
              <a href="https://www.ssa.gov/oact/STATS/table4c6.html" target="_blank" rel="noreferrer" style={{ color: '#1d4ed8', fontWeight: 600 }}>
                Source
              </a>
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              <span>
                {mode === 'couple' ? 'Person A' : 'Your'} life expectancy:{' '}
                <strong>{lifeExpA.toFixed(1)}</strong>
              </span>
              {mode === 'couple' && lifeExpB != null && (
                <span>
                  Person B life expectancy: <strong>{lifeExpB.toFixed(1)}</strong>
                </span>
              )}
            </div>
            {mode === 'couple' && (
              <div style={{ marginTop: 6, fontSize: '0.8rem', color: '#3b5dad' }}>
                Couple optimization folds in spousal top-up (up to 50% of higher earner's PIA)
                and survivor benefits (survivor receives the larger of own or deceased's benefit),
                weighted by each year's joint survival probabilities.
              </div>
            )}
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
            ? ['claimAge', 'deathAge']
            : ['claimAgeA', 'claimAgeB', 'deathAgeA', 'deathAgeB']
          const axisLabels = {
            claimAge: 'Claim Age',
            deathAge: 'Death Age',
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
          const showClaim = activeAxes.has('claimAge') || activeAxes.has('claimAgeA') || activeAxes.has('claimAgeB')
          if (!showDeath && !showClaim) return null
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

        {calcMode === 'probabilistic' && (
          <div style={{ marginBottom: 10, fontSize: '0.82rem', color: '#4b5a7a' }}>
            Cells are tinted by the probability of dying at each age (SSA 2022 table).
            Brighter rows are more likely; the white-outlined cell is the optimal claim age
            at {mode === 'couple' ? "each person's" : 'your'} life expectancy
            {probOptimalCell?.lifeExpectancy != null && (
              <> (<strong>{probOptimalCell.lifeExpectancy.toFixed(1)}</strong>)</>
            )}.
          </div>
        )}

        {heatmapData ? (() => {
          const axisLabels = {
            claimAge: 'Claim Age', deathAge: 'Death Age',
            claimAgeA: 'Person A Claim Age', claimAgeB: 'Person B Claim Age',
            deathAgeA: 'Person A Death Age', deathAgeB: 'Person B Death Age',
          }
          // Optimal cell: probabilistic mode highlights life-expectancy row's best
          // claim age; deterministic mode highlights the grid maximum.
          let optimalX, optimalY
          if (calcMode === 'probabilistic' && probOptimalCell) {
            optimalX = probOptimalCell.x
            optimalY = probOptimalCell.y
          } else if (heatmapData.data && heatmapData.data.length > 0) {
            const best = heatmapData.data.reduce((b, c) => c.value > b.value ? c : b, heatmapData.data[0])
            optimalX = best.xVal
            optimalY = best.yVal
          }
          return (
            <SensitivityHeatmap
              data={heatmapData.data}
              xLabel={axisLabels[heatXAxis] ?? heatXAxis}
              yLabel={axisLabels[heatYAxis] ?? heatYAxis}
              xValues={heatmapData.xValues}
              yValues={heatmapData.yValues}
              optimalX={optimalX}
              optimalY={optimalY}
              rowWeights={heatmapRowWeights}
              rowWeightLabel="P(death @ age)"
            />
          )
        })() : (
          <div className="loading-text">Computing heatmap...</div>
        )}
      </div>

      {calcMode === 'deterministic' && (
        <LifetimeValueTable
          mode={mode}
          piaA={piaA}
          fraA={fraA}
          piaB={piaB}
          fraB={fraB}
          personA={personA}
          personB={personB}
          deathAgeA={deathAgeA}
          deathAgeB={deathAgeB}
          investRate={rate}
          startAge={startAge}
          optimal={optimal}
        />
      )}
    </div>
  )
}

function LifetimeValueTable({ mode, piaA, fraA, piaB, fraB, personA, personB, deathAgeA, deathAgeB, investRate, startAge, optimal }) {
  if (mode === 'single') {
    const endAge = deathAgeA
    const years = []
    for (let a = Math.ceil(startAge); a <= endAge; a++) years.push(a)
    const claimAges = [62, 63, 64, 65, 66, 67, 68, 69, 70]
    const rows = claimAges.map(y => {
      const ca = { years: y, months: 0 }
      const { monthly, rows: cumRows } = singleCumulative(piaA, fraA, ca, startAge, endAge, investRate)
      const valueByAge = new Map(cumRows.map(r => [r.age, r.value]))
      return { claimYear: y, monthly, valueByAge, final: cumRows[cumRows.length - 1]?.value ?? 0 }
    })
    const optimalYear = optimal?.claimAge?.years
    return (
      <div className="card">
        <div className="card-title">Lifetime Value Breakdown — Through Age {endAge}</div>
        <p style={{ fontSize: '0.82rem', color: '#4b5a7a', marginBottom: 10 }}>
          Verifies the optimizer: each row shows cumulative lifetime $ at every age, by claim age.
          {investRate > 0 && <> Balance compounds at <strong>{(investRate * 100).toFixed(1)}%</strong> per year.</>}
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Claim Age</th>
                <th>Monthly $</th>
                {years.map(a => <th key={a}>{a}</th>)}
                <th>Final</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.claimYear} className={r.claimYear === optimalYear ? 'fra-row' : ''}>
                  <td><strong>{r.claimYear}</strong></td>
                  <td>${Math.round(r.monthly).toLocaleString()}</td>
                  {years.map(a => (
                    <td key={a}>${Math.round(r.valueByAge.get(a) ?? 0).toLocaleString()}</td>
                  ))}
                  <td><strong>${Math.round(r.final).toLocaleString()}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // Couple mode: 9 rows on the diagonal (both claim same age) + an Optimal row
  const endAge = Math.max(deathAgeA, deathAgeB)
  const years = []
  for (let a = Math.ceil(startAge); a <= endAge; a++) years.push(a)
  const paramsA = { birthYear: personA.birthYear, currentAge: personA.currentAge, pia: piaA }
  const paramsB = { birthYear: personB.birthYear, currentAge: personB.currentAge, pia: piaB }

  const diag = []
  for (let y = 62; y <= 70; y++) {
    const ca = { years: y, months: 0 }
    const { monthlyA, monthlyB, rows: cumRows } = coupleCumulative({
      paramsA, paramsB, claimAgeA: ca, claimAgeB: ca,
      deathA: deathAgeA, deathB: deathAgeB, investRate, startAge,
    })
    const valueByAge = new Map(cumRows.map(r => [r.age, r.value]))
    diag.push({
      label: `Both @ ${y}`,
      monthlyA, monthlyB,
      valueByAge,
      final: cumRows[cumRows.length - 1]?.value ?? 0,
      isOptimal: false,
    })
  }

  // Add optimal row if it differs from any diagonal entry
  let optimalRow = null
  if (optimal?.claimAgeA && optimal?.claimAgeB) {
    const { monthlyA, monthlyB, rows: cumRows } = coupleCumulative({
      paramsA, paramsB,
      claimAgeA: optimal.claimAgeA, claimAgeB: optimal.claimAgeB,
      deathA: deathAgeA, deathB: deathAgeB, investRate, startAge,
    })
    const valueByAge = new Map(cumRows.map(r => [r.age, r.value]))
    optimalRow = {
      label: `Optimal: A@${optimal.claimAgeA.years}, B@${optimal.claimAgeB.years}`,
      monthlyA, monthlyB,
      valueByAge,
      final: cumRows[cumRows.length - 1]?.value ?? 0,
      isOptimal: true,
    }
  }

  const allRows = optimalRow ? [optimalRow, ...diag] : diag

  return (
    <div className="card">
      <div className="card-title">Lifetime Value Breakdown — Through Age {endAge}</div>
      <p style={{ fontSize: '0.82rem', color: '#4b5a7a', marginBottom: 10 }}>
        Household cumulative $ year by year. Shows the optimal combo plus each "both claim at age N" scenario.
        {investRate > 0 && <> Balance compounds at <strong>{(investRate * 100).toFixed(1)}%</strong> per year.</>}
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Scenario</th>
              <th>A $/mo</th>
              <th>B $/mo</th>
              {years.map(a => <th key={a}>{a}</th>)}
              <th>Final</th>
            </tr>
          </thead>
          <tbody>
            {allRows.map((r, i) => (
              <tr key={i} className={r.isOptimal ? 'fra-row' : ''}>
                <td><strong>{r.label}</strong></td>
                <td>${Math.round(r.monthlyA).toLocaleString()}</td>
                <td>${Math.round(r.monthlyB).toLocaleString()}</td>
                {years.map(a => (
                  <td key={a}>${Math.round(r.valueByAge.get(a) ?? 0).toLocaleString()}</td>
                ))}
                <td><strong>${Math.round(r.final).toLocaleString()}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
