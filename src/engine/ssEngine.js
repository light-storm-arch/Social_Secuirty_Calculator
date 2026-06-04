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

// Amount available to the surviving spouse FROM the deceased worker's record,
// before taking max with the survivor's own benefit.
//
// SSA rules:
//   • Worker died BEFORE filing, BEFORE FRA → survivor gets 100% of PIA.
//   • Worker died BEFORE filing, AFTER FRA → PIA + delayed credits earned
//     up to min(death age, 70).
//   • Worker died AFTER filing → RIB-LIM: max(82.5% of PIA, worker's actual
//     benefit at death). Delayed credits the worker actually earned do flow
//     through to the survivor; reductions for early claim are partly
//     protected by the 82.5% floor.
export function survivorAmountFromWorker(workerParams, workerClaimAge, workerDeathAge) {
  const fra = getFRA(workerParams.birthYear)
  const claimMonths = workerClaimAge.years * 12 + workerClaimAge.months
  const fraMonths = fra.years * 12 + fra.months
  const deathMonths = Math.floor(workerDeathAge) * 12

  if (deathMonths < claimMonths) {
    // Died before filing
    if (deathMonths < fraMonths) {
      return workerParams.pia
    }
    const drcMonths = Math.min(deathMonths, 70 * 12)
    const drcAge = { years: Math.floor(drcMonths / 12), months: drcMonths % 12 }
    return workerParams.pia * benefitFactor(drcAge, fra)
  }
  // Died after filing
  const actual = workerParams.pia * benefitFactor(workerClaimAge, fra)
  return Math.max(0.825 * workerParams.pia, actual)
}

// Reduction factor applied to the survivor amount based on the survivor's age
// when they first receive the survivor benefit. Earliest survivor eligibility
// is age 60; full benefit at the survivor's FRA. Maximum reduction is 28.5%
// at age 60, linear with months between 60 and FRA.
export function survivorReductionFactor(survivorClaimAge, survivorFra) {
  const claimMonths = survivorClaimAge.years * 12 + survivorClaimAge.months
  const fraMonths = fraToMonths(survivorFra)
  const minMonths = 60 * 12
  if (claimMonths < minMonths) return 0
  if (claimMonths >= fraMonths) return 1
  const earlyMonths = fraMonths - claimMonths
  const maxEarlyMonths = fraMonths - minMonths
  return 1 - 0.285 * (earlyMonths / maxEarlyMonths)
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
      // Probabilistic: survival-weighted future value.
      // Walk year by year accumulating a balance that compounds at investRate
      // and receives S(age) * income(age) as a deposit each year.
      // Higher r → larger final balance, consistent with deterministic mode.
      const claimTotalMonths = totalMonths
      let balance = 0
      const maxAge = 119
      for (let age = startAge; age <= maxAge; age++) {
        const S = survivalProb(sex, currentAge, age)
        const inThisYear = age * 12 >= claimTotalMonths ? S * monthly * 12 : 0
        balance = balance * (1 + investRate) + inThisYear
      }
      value = balance
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
      // A spouse with $0 PIA has no own record to file against — they can only
      // collect a spousal benefit (which requires the worker to have filed) or
      // a survivor benefit (which begins when the worker dies). Picking a
      // claim age earlier than the worker's is meaningless, so skip it.
      if (paramsB.pia === 0 && tmB < tmA) continue
      if (paramsA.pia === 0 && tmA < tmB) continue

      const claimAgeA = { years: Math.floor(tmA / 12), months: tmA % 12 }
      const claimAgeB = { years: Math.floor(tmB / 12), months: tmB % 12 }

      const monthlyA_own = paramsA.pia * benefitFactor(claimAgeA, fraA)
      const monthlyB_own = paramsB.pia * benefitFactor(claimAgeB, fraB)

      // Spousal top-up cannot be paid until the worker spouse has actually
      // filed. The reduction factor on the top-up is based on the receiving
      // spouse's age when the top-up actually starts — i.e. when both have
      // filed (max of the two claim ages on the shared age axis).
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

      let value = 0
      if (mode === 'deterministic') {
        const aDeathAge = paramsA.deathAge ?? 85
        const bDeathAge = paramsB.deathAge ?? 85
        // Survivor amount from each worker's record, modified by the
        // survivor-side reduction (locked in at max(60, ageAtWorkerDeath)).
        const survAmtFromA = survivorAmountFromWorker(paramsA, claimAgeA, aDeathAge)
        const survAmtFromB = survivorAmountFromWorker(paramsB, claimAgeB, bDeathAge)
        const bSurvStartAge = Math.max(60, aDeathAge)  // B's age when B starts survivor
        const aSurvStartAge = Math.max(60, bDeathAge)
        const bSurvFactor = survivorReductionFactor(
          { years: bSurvStartAge, months: 0 }, fraB,
        )
        const aSurvFactor = survivorReductionFactor(
          { years: aSurvStartAge, months: 0 }, fraA,
        )
        const survPayToA = survAmtFromB * aSurvFactor
        const survPayToB = survAmtFromA * bSurvFactor

        const endAge = Math.max(aDeathAge, bDeathAge)
        for (let age = Math.ceil(startAge); age <= endAge; age++) {
          const aAlive = age <= aDeathAge
          const bAlive = age <= bDeathAge
          const ageMonths = age * 12
          const aStarted = ageMonths >= tmA
          const bStarted = ageMonths >= tmB
          const bothFiled = aStarted && bStarted

          let income = 0
          if (aAlive && bAlive) {
            const aPay = (aStarted ? monthlyA_own : 0) + (bothFiled ? topUpA : 0)
            const bPay = (bStarted ? monthlyB_own : 0) + (bothFiled ? topUpB : 0)
            income = (aPay + bPay) * 12
          } else if (aAlive && !bAlive) {
            // A is the survivor of B. A can collect survivor benefit
            // independently from own filing starting at age >= aSurvStartAge.
            const ownPay = aStarted ? monthlyA_own : 0
            const survPay = age >= aSurvStartAge ? survPayToA : 0
            income = Math.max(ownPay, survPay) * 12
          } else if (!aAlive && bAlive) {
            const ownPay = bStarted ? monthlyB_own : 0
            const survPay = age >= bSurvStartAge ? survPayToB : 0
            income = Math.max(ownPay, survPay) * 12
          }

          if (investRate > 0) {
            value = value * (1 + investRate) + income
          } else {
            value += income
          }
        }
      } else {
        // Probabilistic mode: integrate the survivor pay over the distribution
        // of when the worker died, applying the survivor-side reduction based
        // on max(60, deathAge) for each possible death age.
        const startInt = Math.ceil(startAge)
        const SA_arr = new Float64Array(maxAge + 2)
        const SB_arr = new Float64Array(maxAge + 2)
        const survFromA = new Float64Array(maxAge + 2)
        const survFromB = new Float64Array(maxAge + 2)
        for (let age = startInt; age <= maxAge + 1; age++) {
          SA_arr[age] = survivalProb(paramsA.sex, paramsA.currentAge, age)
          SB_arr[age] = survivalProb(paramsB.sex, paramsB.currentAge, age)
          survFromA[age] = survivorAmountFromWorker(paramsA, claimAgeA, age)
          survFromB[age] = survivorAmountFromWorker(paramsB, claimAgeB, age)
        }
        const fA = new Float64Array(maxAge + 2)
        const fB = new Float64Array(maxAge + 2)
        const survPayToA_byD = new Float64Array(maxAge + 2)
        const survPayToB_byD = new Float64Array(maxAge + 2)
        for (let d = startInt; d <= maxAge; d++) {
          fA[d] = Math.max(0, SA_arr[d] - SA_arr[d + 1])
          fB[d] = Math.max(0, SB_arr[d] - SB_arr[d + 1])
          const startAgeIfWorkerDiedAtD = Math.max(60, d)
          const factorForA = survivorReductionFactor(
            { years: startAgeIfWorkerDiedAtD, months: 0 }, fraA,
          )
          const factorForB = survivorReductionFactor(
            { years: startAgeIfWorkerDiedAtD, months: 0 }, fraB,
          )
          survPayToA_byD[d] = survFromB[d] * factorForA  // A is survivor; B died at d
          survPayToB_byD[d] = survFromA[d] * factorForB  // B is survivor; A died at d
        }

        for (let age = startInt; age <= maxAge; age++) {
          const SA = SA_arr[age]
          const SB = SB_arr[age]
          const ageMonths = age * 12
          const aStarted = ageMonths >= tmA
          const bStarted = ageMonths >= tmB
          const bothFiled = aStarted && bStarted

          const A_normal = (aStarted ? monthlyA_own : 0) + (bothFiled ? topUpA : 0)
          const B_normal = (bStarted ? monthlyB_own : 0) + (bothFiled ? topUpB : 0)

          // Integrate over the dead spouse's death age d < current age. The
          // surviving spouse can collect survivor benefit independently of
          // their own filing (so we always take max(own_if_filed, survPay)).
          const A_ownIfFiled = aStarted ? monthlyA_own : 0
          const B_ownIfFiled = bStarted ? monthlyB_own : 0
          let A_surv = 0
          let B_surv = 0
          for (let d = startInt; d < age; d++) {
            if (fB[d] > 0) {
              A_surv += fB[d] * Math.max(A_ownIfFiled, survPayToA_byD[d])
            }
            if (fA[d] > 0) {
              B_surv += fA[d] * Math.max(B_ownIfFiled, survPayToB_byD[d])
            }
          }

          const expectedIncome = (
            SA * SB * (A_normal + B_normal)
            + SA * A_surv
            + SB * B_surv
          ) * 12

          value = value * (1 + investRate) + expectedIncome
        }
      }

      // Reported monthly is the steady-state amount once both have filed,
      // which is what the user actually receives long-term.
      const entry = {
        claimAgeA, claimAgeB, value,
        monthlyA: monthlyA_own + topUpA,
        monthlyB: monthlyB_own + topUpB,
      }
      results.push(entry)
      if (value > bestValue) {
        bestValue = value
        bestEntry = entry
      }
    }
  }

  return { optimal: bestEntry, heatmapMatrix: results }
}
