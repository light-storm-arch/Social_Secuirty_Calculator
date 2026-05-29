import React, { useRef, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Legend, ResponsiveContainer
} from 'recharts'
import { getFRA, fraToMonths, benefitTable, backOutPIA } from '../engine/ssEngine.js'
import { downloadCsv } from '../utils/exportCsv.js'
import { exportPdf } from '../utils/exportPdf.js'
import PersonForm from './PersonForm.jsx'

function resolveEstimateAtAge(person) {
  if (person.estimateAtAgeMode === 'FRA') {
    const fra = getFRA(person.birthYear)
    return fra
  }
  return person.estimateAtAge ?? { years: 62, months: 0 }
}

function computeForPerson(person) {
  const estimateAtAge = resolveEstimateAtAge(person)
  const fra = getFRA(person.birthYear)
  const pia = backOutPIA(person.estimate, estimateAtAge, person.birthYear)
  const rows = benefitTable(person.birthYear, person.estimate, estimateAtAge)
  return { fra, pia, rows }
}

function ageLabel(claimAge) {
  if (claimAge.months === 0) return `${claimAge.years}`
  return `${claimAge.years}y${claimAge.months}m`
}

function BenefitChart({ rows, fra, chartRef }) {
  const fraMonths = fraToMonths(fra)
  const chartData = rows.map(r => ({
    ageMonths: r.claimAge.years * 12 + r.claimAge.months,
    monthly: Math.round(r.monthlyBenefit),
    pct: parseFloat(r.pctOfPia.toFixed(1)),
  }))
  return (
    <div className="chart-container" ref={chartRef}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8ecf4" />
          <XAxis
            dataKey="ageMonths"
            tickFormatter={v => `${Math.floor(v / 12)}`}
            ticks={[744, 756, 768, 780, 792, 804, 816, 828, 840]}
            label={{ value: 'Claim Age', position: 'insideBottom', offset: -4, fontSize: 12 }}
          />
          <YAxis
            tickFormatter={v => `$${v.toLocaleString()}`}
            width={80}
          />
          <Tooltip
            formatter={(v) => [`$${v.toLocaleString()}`, 'Monthly Benefit']}
            labelFormatter={v => `Age ${Math.floor(v / 12)}y${v % 12}m`}
          />
          <ReferenceLine x={744} stroke="#ef4444" strokeDasharray="4 3" label={{ value: '62', fill: '#ef4444', fontSize: 11 }} />
          <ReferenceLine x={fraMonths} stroke="#f59e0b" strokeDasharray="4 3" label={{ value: 'FRA', fill: '#f59e0b', fontSize: 11 }} />
          <ReferenceLine x={840} stroke="#10b981" strokeDasharray="4 3" label={{ value: '70', fill: '#10b981', fontSize: 11 }} />
          <Line type="monotone" dataKey="monthly" stroke="#3b82f6" strokeWidth={2} dot={false} name="Monthly Benefit" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function BenefitTableComp({ rows, fra }) {
  const fraMonths = fraToMonths(fra)
  const [period, setPeriod] = React.useState('monthly')
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: '0.82rem', color: '#4b5a7a', fontWeight: 600 }}>Show:</span>
        <div className="seg-control" style={{ fontSize: '0.82rem' }}>
          <button className={`seg-btn ${period === 'monthly' ? 'active' : ''}`} onClick={() => setPeriod('monthly')}>Monthly</button>
          <button className={`seg-btn ${period === 'annual' ? 'active' : ''}`} onClick={() => setPeriod('annual')}>Annual</button>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Claim Age</th>
              <th>{period === 'monthly' ? 'Monthly Benefit' : 'Annual Benefit'}</th>
              <th>% of PIA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const am = r.claimAge.years * 12 + r.claimAge.months
              const isFra = am === fraMonths
              const amount = period === 'monthly'
                ? Math.round(r.monthlyBenefit)
                : Math.round(r.monthlyBenefit * 12)
              return (
                <tr key={i} className={isFra ? 'fra-row' : ''}>
                  <td>{ageLabel(r.claimAge)}{isFra ? ' (FRA)' : ''}</td>
                  <td>${amount.toLocaleString()}</td>
                  <td>{r.pctOfPia.toFixed(1)}%</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PersonSection({ label, person, fra, pia, rows, chartRef }) {
  return (
    <div>
      {label && <div className="person-label">{label}</div>}
      <div className="pia-badge">Computed PIA: ${Math.round(pia).toLocaleString()}/mo</div>
      <div style={{ fontSize: '0.82rem', color: '#4b5a7a', marginTop: 4 }}>
        FRA: {fra.years}y{fra.months > 0 ? `${fra.months}m` : ''}
      </div>
      <BenefitChart rows={rows} fra={fra} chartRef={chartRef} />
      <BenefitTableComp rows={rows} fra={fra} />
    </div>
  )
}

export default function Module1({ sharedState, sharedSetters }) {
  const { mode, personA, personB } = sharedState
  const { setPersonA, setPersonB } = sharedSetters

  const chartRefA = useRef(null)
  const chartRefB = useRef(null)

  const dataA = useMemo(() => computeForPerson(personA), [personA])
  const dataB = useMemo(() => (mode === 'couple' ? computeForPerson(personB) : null), [personB, mode])

  function handleCsvA() {
    downloadCsv(
      'benefit_table_person_a.csv',
      ['Claim Age', 'Monthly Benefit', 'Pct of PIA'],
      dataA.rows.map(r => [ageLabel(r.claimAge), Math.round(r.monthlyBenefit), r.pctOfPia.toFixed(1)])
    )
  }

  function handleCsvB() {
    if (!dataB) return
    downloadCsv(
      'benefit_table_person_b.csv',
      ['Claim Age', 'Monthly Benefit', 'Pct of PIA'],
      dataB.rows.map(r => [ageLabel(r.claimAge), Math.round(r.monthlyBenefit), r.pctOfPia.toFixed(1)])
    )
  }

  async function handlePdfA() {
    await exportPdf({
      title: 'Benefit Table - Person A',
      inputs: {
        'Birth Year': personA.birthYear,
        'Sex': personA.sex,
        'PIA': `$${Math.round(dataA.pia).toLocaleString()}/mo`,
        'FRA': `${dataA.fra.years}y${dataA.fra.months}m`,
      },
      headers: ['Claim Age', 'Monthly Benefit', 'Pct of PIA'],
      rows: dataA.rows.map(r => [ageLabel(r.claimAge), `$${Math.round(r.monthlyBenefit).toLocaleString()}`, `${r.pctOfPia.toFixed(1)}%`]),
      chartRef: chartRefA,
    })
  }

  async function handlePdfB() {
    if (!dataB) return
    await exportPdf({
      title: 'Benefit Table - Person B',
      inputs: {
        'Birth Year': personB.birthYear,
        'Sex': personB.sex,
        'PIA': `$${Math.round(dataB.pia).toLocaleString()}/mo`,
        'FRA': `${dataB.fra.years}y${dataB.fra.months}m`,
      },
      headers: ['Claim Age', 'Monthly Benefit', 'Pct of PIA'],
      rows: dataB.rows.map(r => [ageLabel(r.claimAge), `$${Math.round(r.monthlyBenefit).toLocaleString()}`, `${r.pctOfPia.toFixed(1)}%`]),
      chartRef: chartRefB,
    })
  }

  return (
    <div>
      <div className="card">
        <div className="card-title">Inputs</div>
        {mode === 'single' ? (
          <PersonForm person={personA} onChange={setPersonA} />
        ) : (
          <div className="couple-cols">
            <PersonForm label="Person A (You)" person={personA} onChange={setPersonA} />
            <PersonForm label="Person B (Spouse)" person={personB} onChange={setPersonB} />
          </div>
        )}
      </div>

      {mode === 'single' ? (
        <div className="card">
          <div className="card-title">Benefit Table — Person A</div>
          <PersonSection
            person={personA}
            fra={dataA.fra}
            pia={dataA.pia}
            rows={dataA.rows}
            chartRef={chartRefA}
          />
          <div className="btn-group">
            <button className="btn btn-secondary btn-sm" onClick={handleCsvA}>Export CSV</button>
            <button className="btn btn-secondary btn-sm" onClick={handlePdfA}>Export PDF</button>
          </div>
        </div>
      ) : (
        <div className="couple-cols">
          <div className="card">
            <div className="card-title">Benefit Table — Person A</div>
            <PersonSection
              label="Person A"
              person={personA}
              fra={dataA.fra}
              pia={dataA.pia}
              rows={dataA.rows}
              chartRef={chartRefA}
            />
            <div className="btn-group">
              <button className="btn btn-secondary btn-sm" onClick={handleCsvA}>Export CSV</button>
              <button className="btn btn-secondary btn-sm" onClick={handlePdfA}>Export PDF</button>
            </div>
          </div>
          <div className="card">
            <div className="card-title">Benefit Table — Person B</div>
            {dataB && (
              <PersonSection
                label="Person B"
                person={personB}
                fra={dataB.fra}
                pia={dataB.pia}
                rows={dataB.rows}
                chartRef={chartRefB}
              />
            )}
            <div className="btn-group">
              <button className="btn btn-secondary btn-sm" onClick={handleCsvB}>Export CSV</button>
              <button className="btn btn-secondary btn-sm" onClick={handlePdfB}>Export PDF</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
