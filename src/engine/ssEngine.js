import { survivalProb } from './mortalityTable.js'

const FRA_TABLE = [
  { maxYear: 1954, years: 66, months: 0 },
  { maxYear: 1955, years: 66, months: 2 },
  { maxYear: 1956, years: 66, months: 4 },
  { maxYear: 1957, years: 66, months: 6 },
  { maxYear: 1958, years: 66, months: 8 },
  { maxYear: 1959, years: 66, months: 10 },
]

export function getFRA(birthYear) {
  for (const row of FRA_TABLE) {
    if (birthYear <= row.maxYear) return { years: row.years, months: row.months }
  }
  return { years: 67, months: 0 }
}

export function fraToMonths(fra) {
  return fra.years * 12 + fra.months
}

export function benefitFactor(claimAge, fra) {
  const claimMonths = claimAge.years * 12 + claimAge.months
  const fraMonths = fraToMonths(fra)
  const diff = claimMonths - fraMonths

  if (diff === 0) return 1.0

  if (diff < 0) {
    const monthsEarly = -diff
    let reduction = 0
    if (monthsEarly <= 36) {
      reduction = monthsEarly * (5 / 9 / 100)
    } else {
      reduction = 36 * (5 / 9 / 100) + (monthsEarly - 36) * (5 / 12 / 100)
    }
    return 1.0 - reduction
  } else {
    const fraMonthsVal = fraToMonths(fra)
    const maxDelayMonths = 70 * 12 - fraMonthsVal
    const delayMonths = Math.min(diff, maxDelayMonths)
    return 1.0 + delayMonths * (2 / 3 / 100)
  }
}

export function backOutPIA(estimate, estimateAge, birthYear) {
  const fra = getFRA(birthYear)
  const factor = benefitFactor(estimateAge, fra)
  return estimate / factor
}

export function benefitTable(birthYear, estimate, estimateAtAge) {
  const fra = getFRA(birthYear)
  const pia = backOutPIA(estimate, estimateAtAge, birthYear)
  const rows = []
  for (let totalMonths = 62 * 12; totalMonths <= 70 * 12; totalMonths++) {
    const years = Math.floor(totalMonths / 12)
    const months = totalMonths % 12
    const claimAge = { years, months }
    const factor = benefitFactor(claimAge, fra)
    rows.push({
      claimAge,
      monthlyBenefit: pia * factor,
      pctOfPia: factor * 100,
    })
  }
  return rows
}

export function spousalTopUp(workerPia, receiverOwnMonthly, claimerAge, claimerFra) {
  const claimerMonths = claimerAge.years * 12 + claimerAge.months
  const claimerFraMonths = fraToMonths(claimerFra)
  let spousalGross = workerPia * 0.5

  if (claimerMonths < claimerFraMonths) {
    const monthsEarly = claimerFraMonths - claimerMonths
    let reduction
    if (monthsEarly <= 36) {
      reduction = monthsEarly * (5 / 9 / 100)
    } else {
      reduction = 36 * (5 / 9 / 100) + (monthsEarly - 36) * (5 / 12 / 100)
    }
    spousalGross = spousalGross * (1 - reduction)
  }
  return Math.max(0, spousalGross - receiverOwnMonthly)
}

export function survivorBenefit(survivorOwnMonthly, deceasedMonthlyAtDeath) {
  return Math.max(survivorOwnMonthly, deceasedMonthlyAtDeath)
}

export function cumulativeByAge(monthlyBenefit, claimAge, startAge, endAge, investRate) {
  const claimTotalMonths = claimAge.years * 12 + claimAge.months
  const rows = []
  let balance = 0
  for (let age = startAge; age <= endAge; age++) {
    const ageTotalMonths = age * 12
    const monthlyIncome = ageTotalMonths >= claimTotalMonths ? monthlyBenefit : 0
    if (investRate > 0) {
      balance = balance * (1 + investRate) + 12 * monthlyIncome
    } else {
      balance += 12 * monthlyIncome
    }
    rows.push({ age, value: balance })
  }
  return rows
}

export function breakevenAnalysis(strategies, startAge, endAge, investRate) {
  const cumulatives = strategies.map(s =>
    cumulativeByAge(s.monthlyBenefit, s.claimAge, startAge, endAge, investRate)
  )
  const rows = []
  for (let i = 0; i < cumulatives[0].length; i++) {
    rows.push({
      age: cumulatives[0][i].age,
      values: cumulatives.map(c => c[i].value),
    })
  }
  const crossovers = []
  for (let a = 0; a < strategies.length; a++) {
    for (let b = a + 1; b < strategies.length; b++) {
      let crossoverAge = null
      for (let i = 1; i < rows.length; i++) {
        const prevDiff = rows[i - 1].values[b] - rows[i - 1].values[a]
        const currDiff = rows[i].values[b] - rows[i].values[a]
        if (prevDiff < 0 && currDiff >= 0) {
          crossoverAge = rows[i].age
          break
        }
      }
      crossovers.push({ stratA: a, stratB: b, age: crossoverAge })
    }
  }
  return { rows, crossovers }
}

export function optimizeSingle({ birthYear, currentAge, sex, pia, mode, deathAge, investRate = 0 }) {
  const fra = getFRA(birthYear)
  const results = []
  const startAge = Math.max(62, Math.ceil(currentAge))

  for (let totalMonths = 62 * 12; totalMonths <= 70 * 12; totalMonths++) {
    const years = Math.floor(totalMonths / 12)
    const months = totalMonths % 12
    const claimAge = { years, months }
    const monthly = pia * benefitFactor(claimAge, fra)

    let value
    if (mode === 'deterministic') {
      const endAge = deathAge
      const cumRows = cumulativeByAge(monthly, claimAge, startAge, endAge, investRate)
      value = cumRows[cumRows.length - 1]?.value ?? 0
    } else {
      const claimTotalMonths = totalMonths
      value = 0
      const maxAge = 119
      for (let age = startAge; age <= maxAge; age++) {
        const S = survivalProb(sex, currentAge, age)
        const inThisYear = age * 12 >= claimTotalMonths ? monthly * 12 : 0
        if (investRate > 0) {
          const years_away = age - currentAge
          value += S * inThisYear / Math.pow(1 + investRate, years_away)
        } else {
          value += S * inThisYear
        }
      }
    }

    results.push({ claimAge, value, monthlyBenefit: monthly })
  }

  const optimal = results.reduce((best, r) => (r.value > best.value ? r : best), results[0])
  return { optimal, matrix: results }
}

export function optimizeCouple({ paramsA, paramsB, mode, investRate = 0 }) {
  const fraA = getFRA(paramsA.birthYear)
  const fraB = getFRA(paramsB.birthYear)
  const startAge = Math.max(paramsA.currentAge, paramsB.currentAge, 62)
  const maxAge = 119

  const higherEarnerIsA = paramsA.pia >= paramsB.pia

  const results = []
  let bestValue = -Infinity
  let bestEntry = null

  for (let tmA = 62 * 12; tmA <= 70 * 12; tmA++) {
    for (let tmB = 62 * 12; tmB <= 70 * 12; tmB++) {
      const claimAgeA = { years: Math.floor(tmA / 12), months: tmA % 12 }
      const claimAgeB = { years: Math.floor(tmB / 12), months: tmB % 12 }

      const monthlyA_own = paramsA.pia * benefitFactor(claimAgeA, fraA)
      const monthlyB_own = paramsB.pia * benefitFactor(claimAgeB, fraB)

      let monthlyA_spousal = monthlyA_own
      let monthlyB_spousal = monthlyB_own

      if (higherEarnerIsA) {
        const topUp = spousalTopUp(paramsA.pia, monthlyB_own, claimAgeB, fraB)
        monthlyB_spousal = monthlyB_own + topUp
      } else {
        const topUp = spousalTopUp(paramsB.pia, monthlyA_own, claimAgeA, fraA)
        monthlyA_spousal = monthlyA_own + topUp
      }

      const survivorIfADies = survivorBenefit(monthlyB_own, monthlyA_own)
      const survivorIfBDies = survivorBenefit(monthlyA_own, monthlyB_own)

      let value = 0
      if (mode === 'deterministic') {
        const endAge = Math.max(paramsA.deathAge ?? 85, paramsB.deathAge ?? 85)
        for (let age = Math.ceil(startAge); age <= endAge; age++) {
          const aAlive = age <= (paramsA.deathAge ?? 85)
          const bAlive = age <= (paramsB.deathAge ?? 85)
          const ageMonths = age * 12
          const aStarted = ageMonths >= tmA
          const bStarted = ageMonths >= tmB

          let income = 0
          if (aAlive && bAlive) {
            income = (aStarted ? (higherEarnerIsA ? monthlyA_own : monthlyA_spousal) : 0) * 12
                   + (bStarted ? (higherEarnerIsA ? monthlyB_spousal : monthlyB_own) : 0) * 12
          } else if (aAlive && !bAlive) {
            income = (aStarted ? survivorIfBDies : 0) * 12
          } else if (!aAlive && bAlive) {
            income = (bStarted ? survivorIfADies : 0) * 12
          }

          if (investRate > 0) {
            value = value * (1 + investRate) + income
          } else {
            value += income
          }
        }
      } else {
        for (let age = Math.ceil(startAge); age <= maxAge; age++) {
          const SA = survivalProb(paramsA.sex, paramsA.currentAge, age)
          const SB = survivalProb(paramsB.sex, paramsB.currentAge, age)
          const ageMonths = age * 12
          const aStarted = ageMonths >= tmA
          const bStarted = ageMonths >= tmB

          const bothAliveIncome = (
            (aStarted ? (higherEarnerIsA ? monthlyA_own : monthlyA_spousal) : 0)
            + (bStarted ? (higherEarnerIsA ? monthlyB_spousal : monthlyB_own) : 0)
          ) * 12
          const onlyAIncome = (aStarted ? survivorIfBDies : 0) * 12
          const onlyBIncome = (bStarted ? survivorIfADies : 0) * 12

          const expectedIncome = SA * SB * bothAliveIncome
                               + SA * (1 - SB) * onlyAIncome
                               + (1 - SA) * SB * onlyBIncome

          if (investRate > 0) {
            const discountBase = Math.min(paramsA.currentAge, paramsB.currentAge)
            const years_away = age - discountBase
            value += expectedIncome / Math.pow(1 + investRate, years_away)
          } else {
            value += expectedIncome
          }
        }
      }

      const entry = { claimAgeA, claimAgeB, value, monthlyA: monthlyA_own, monthlyB: monthlyB_own }
      results.push(entry)
      if (value > bestValue) {
        bestValue = value
        bestEntry = entry
      }
    }
  }

  return { optimal: bestEntry, heatmapMatrix: results }
}
