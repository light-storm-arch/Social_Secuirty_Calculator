# Social Security Calculator

A comprehensive, client-side Social Security retirement benefit optimizer built with React + Vite.

**Live URL:** https://light-storm-arch.github.io/Social_Secuirty_Calculator/

## Features

- **Module 1 — Benefit Table:** View monthly benefit amounts for every possible claim age (62–70), computed from your SSA benefit estimate. Shows PIA, FRA reference lines, and a full 97-row table.
- **Module 2 — Break-Even Analysis:** Compare multiple claiming strategies over time. Add/remove strategies, toggle benefit investing with a real return rate, and see breakeven crossover ages.
- **Module 3 — Optimizer:** Find the optimal claim age(s) using either deterministic (specified death age) or probabilistic (SSA 2022 mortality table) analysis. Includes sensitivity heatmaps.
- **Couple Mode:** All modules support two-person households with spousal and survivor benefit calculations.
- **Scenario Manager:** Save and load complete calculator states via localStorage.
- **Export:** CSV and PDF export for all tables and charts.

## Local Development

```bash
npm install
npm run dev
```

Open http://localhost:5173/Social_Secuirty_Calculator/

## Run Tests

```bash
npm test
```

## Build

```bash
npm run build
```

## Deploy

GitHub Actions automatically deploys to GitHub Pages on push to `main` or `claude/brave-keller-NQCbQ`.

## Data Sources

- Mortality: [SSA Office of the Chief Actuary, Period Life Table 2022](https://www.ssa.gov/oact/STATS/table4c6.html) (2025 Trustees Report)
- FRA rules: SSA full retirement age schedule by birth year

## Assumptions

- All values in today's dollars (no COLA modeling)
- Investment return r is real (inflation-adjusted)
- Taxes on Social Security benefits are not modeled
- Couple survival probabilities assume independent lives
