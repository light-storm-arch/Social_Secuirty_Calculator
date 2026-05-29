import React from 'react'

export default function AssumptionsPanel() {
  return (
    <footer className="assumptions-panel">
      <div className="assumptions-inner">
        <div className="assumptions-title">Assumptions &amp; Disclosures</div>
        <ul className="assumptions-list">
          <li>All values are in today's dollars. COLA (cost-of-living adjustments) are not modeled.</li>
          <li>Investment return <em>r</em> is a real (inflation-adjusted) rate.</li>
          <li>When the invest toggle is on, 100% of benefits are banked and invested at rate <em>r</em>. No withdrawals. No taxes modeled.</li>
          <li>Taxes on Social Security benefits are not modeled.</li>
          <li>
            Mortality data: SSA Office of the Chief Actuary, Period Life Table 2022 (2025 Trustees Report).{' '}
            <a href="https://www.ssa.gov/oact/STATS/table4c6.html" target="_blank" rel="noreferrer">
              Source: ssa.gov
            </a>
          </li>
          <li>Survival probabilities for couples assume independent lives (standard actuarial simplification).</li>
          <li><strong>Note:</strong> Scenario save/load requires a real browser (GitHub Pages or local dev). It does not work in Claude.ai artifact sandboxes.</li>
        </ul>
      </div>
    </footer>
  )
}
