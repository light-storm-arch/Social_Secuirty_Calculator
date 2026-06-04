import { describe, it, expect } from 'vitest'
import {
  getFRA, benefitFactor, backOutPIA, benefitTable, spousalTopUp,
  survivorBenefit, survivorAmountFromWorker, survivorReductionFactor,
  optimizeCouple,
} from '../ssEngine.js'

describe('getFRA', () => {
  it('returns 66y0m for 1943-1954', () => {
    expect(getFRA(1950)).toEqual({ years: 66, months: 0 })
    expect(getFRA(1954)).toEqual({ years: 66, months: 0 })
  })
  it('returns 66y2m for 1955', () => expect(getFRA(1955)).toEqual({ years: 66, months: 2 }))
  it('returns 66y6m for 1957', () => expect(getFRA(1957)).toEqual({ years: 66, months: 6 }))
  it('returns 67y0m for 1960+', () => expect(getFRA(1960)).toEqual({ years: 67, months: 0 }))
})

describe('benefitFactor - FRA 67 (born 1960)', () => {
  const fra = { years: 67, months: 0 }
  it('62 -> 70%', () => expect(benefitFactor({ years: 62, months: 0 }, fra)).toBeCloseTo(0.700, 5))
  it('63 -> 75%', () => expect(benefitFactor({ years: 63, months: 0 }, fra)).toBeCloseTo(0.750, 5))
  it('64 -> 80%', () => expect(benefitFactor({ years: 64, months: 0 }, fra)).toBeCloseTo(0.800, 5))
  it('65 -> 86.667%', () => expect(benefitFactor({ years: 65, months: 0 }, fra)).toBeCloseTo(0.86667, 3))
  it('66 -> 93.333%', () => expect(benefitFactor({ years: 66, months: 0 }, fra)).toBeCloseTo(0.93333, 3))
  it('67 -> 100%', () => expect(benefitFactor({ years: 67, months: 0 }, fra)).toBeCloseTo(1.000, 5))
  it('68 -> 108%', () => expect(benefitFactor({ years: 68, months: 0 }, fra)).toBeCloseTo(1.080, 5))
  it('69 -> 116%', () => expect(benefitFactor({ years: 69, months: 0 }, fra)).toBeCloseTo(1.160, 5))
  it('70 -> 124%', () => expect(benefitFactor({ years: 70, months: 0 }, fra)).toBeCloseTo(1.240, 5))
})

describe('benefitFactor - FRA 66 (born 1950)', () => {
  const fra = { years: 66, months: 0 }
  it('62 -> 75%', () => expect(benefitFactor({ years: 62, months: 0 }, fra)).toBeCloseTo(0.750, 5))
  it('66 -> 100%', () => expect(benefitFactor({ years: 66, months: 0 }, fra)).toBeCloseTo(1.000, 5))
  it('70 -> 132%', () => expect(benefitFactor({ years: 70, months: 0 }, fra)).toBeCloseTo(1.320, 5))
})

describe('benefitFactor - FRA 66y6m (born 1957)', () => {
  const fra = { years: 66, months: 6 }
  it('62 -> 72.5%', () => {
    // FRA = 66y6m = 798 months. Age 62 = 744 months. Diff = 54 months early.
    // 36 months x 5/9% + 18 months x 5/12% = 20% + 7.5% = 27.5% reduction -> 72.5%
    expect(benefitFactor({ years: 62, months: 0 }, fra)).toBeCloseTo(0.725, 5)
  })
})

describe('PIA round-trip', () => {
  it('back-out then forward should recover PIA', () => {
    const pia = 2000
    const claimAge = { years: 64, months: 0 }
    const benefit = pia * benefitFactor(claimAge, { years: 67, months: 0 })
    const recovered = backOutPIA(benefit, claimAge, 1960)
    expect(recovered).toBeCloseTo(pia, 2)
  })
})

describe('spousalTopUp', () => {
  it('spouse with no own record gets 50% of worker PIA at FRA', () => {
    const workerPia = 2000
    const fra = { years: 67, months: 0 }
    const topUp = spousalTopUp(workerPia, 0, { years: 67, months: 0 }, fra)
    expect(topUp).toBeCloseTo(1000, 2)
  })
  it('50% of WORKER PIA not 50% of worker reduced benefit', () => {
    const topUp = spousalTopUp(2000, 0, { years: 67, months: 0 }, { years: 67, months: 0 })
    expect(topUp).toBeCloseTo(1000, 2)
  })
})

describe('survivorBenefit', () => {
  it('survivor gets deceased benefit if higher', () => {
    expect(survivorBenefit(1500, 2480)).toBe(2480)
  })
  it('survivor keeps own benefit if higher', () => {
    expect(survivorBenefit(2000, 1500)).toBe(2000)
  })
})

describe('survivorAmountFromWorker', () => {
  // Worker: born 1960 (FRA 67), PIA = $2000.
  const worker = { birthYear: 1960, pia: 2000 }

  it('died before filing, before FRA → 100% of PIA', () => {
    const claim = { years: 70, months: 0 }
    expect(survivorAmountFromWorker(worker, claim, 65)).toBeCloseTo(2000, 2)
  })

  it('died before filing, after FRA → PIA + DRCs up to death age', () => {
    // Planned claim at 70 but died at 69 → DRCs from 67 to 69 = 24 months × 2/3% = 16% → 116%
    const claim = { years: 70, months: 0 }
    expect(survivorAmountFromWorker(worker, claim, 69)).toBeCloseTo(2000 * 1.16, 2)
  })

  it('died before filing, past 70 → DRCs capped at age 70', () => {
    const claim = { years: 70, months: 0 }
    expect(survivorAmountFromWorker(worker, claim, 75)).toBeCloseTo(2000 * 1.24, 2)
  })

  it('died after filing at FRA → 100% of PIA (RIB-LIM floor irrelevant)', () => {
    const claim = { years: 67, months: 0 }
    expect(survivorAmountFromWorker(worker, claim, 75)).toBeCloseTo(2000, 2)
  })

  it('died after filing at 62 (reduced) → max(82.5% PIA, reduced) = 82.5% floor', () => {
    // 70% of PIA = $1400 < 82.5% = $1650 → survivor gets $1650
    const claim = { years: 62, months: 0 }
    expect(survivorAmountFromWorker(worker, claim, 75)).toBeCloseTo(2000 * 0.825, 2)
  })

  it('died after filing at 70 → 124% of PIA passes through', () => {
    const claim = { years: 70, months: 0 }
    expect(survivorAmountFromWorker(worker, claim, 80)).toBeCloseTo(2000 * 1.24, 2)
  })
})

describe('survivorReductionFactor', () => {
  const fra67 = { years: 67, months: 0 }
  it('returns 1.0 at FRA', () => {
    expect(survivorReductionFactor(fra67, fra67)).toBeCloseTo(1.0, 5)
  })
  it('returns 1.0 past FRA', () => {
    expect(survivorReductionFactor({ years: 70, months: 0 }, fra67)).toBeCloseTo(1.0, 5)
  })
  it('returns 0.715 at age 60 (max reduction)', () => {
    expect(survivorReductionFactor({ years: 60, months: 0 }, fra67)).toBeCloseTo(0.715, 4)
  })
  it('returns 0 if claimed before 60 (ineligible)', () => {
    expect(survivorReductionFactor({ years: 59, months: 0 }, fra67)).toBe(0)
  })
  it('interpolates linearly between 60 and FRA', () => {
    // Halfway: age 63.5, factor = 1 - 0.5 * 0.285 = 0.8575
    const factor = survivorReductionFactor({ years: 63, months: 6 }, fra67)
    expect(factor).toBeCloseTo(0.8575, 4)
  })
})

describe('optimizeCouple — spousal gating', () => {
  // Both born 1960 (FRA 67), male, currentAge 62, A has PIA $2000, B has $0.
  // B is a spousal-only claimant, so cannot collect anything until A files.
  const baseA = { birthYear: 1960, currentAge: 62, sex: 'male', pia: 2000 }
  const baseB = { birthYear: 1960, currentAge: 62, sex: 'male', pia: 0 }

  it('B with $0 PIA earns nothing while A has not filed (det.)', () => {
    // A claims at 70, B "claims" at 67. B should receive $0 from 67–69 (4 yrs),
    // then full 50%-of-PIA spousal from 70 onward (no reduction — start age 70).
    // Total = $1000 * 12 * (deathAge - 70 + 1)
    const r = optimizeCouple({
      paramsA: { ...baseA, deathAge: 80 },
      paramsB: { ...baseB, deathAge: 80 },
      mode: 'deterministic',
      investRate: 0,
    })
    // Gating forces claimAgeB >= claimAgeA when B has $0 PIA.
    const e = r.heatmapMatrix.find(x =>
      x.claimAgeA.years === 70 && x.claimAgeA.months === 0 &&
      x.claimAgeB.years === 70 && x.claimAgeB.months === 0
    )
    // A: $2000 * 1.24 = $2480/mo from 70 to 80 (11 yrs)
    // B: $1000/mo (50% PIA, unreduced — top-up starts at 70 = FRA) from 70 to 80
    const expected = (2480 * 12 + 1000 * 12) * 11
    expect(e.value).toBeCloseTo(expected, 0)
  })

  it('reported monthlyB includes spousal top-up (steady state)', () => {
    const r = optimizeCouple({
      paramsA: { ...baseA, deathAge: 85 },
      paramsB: { ...baseB, deathAge: 85 },
      mode: 'deterministic',
    })
    const e = r.heatmapMatrix.find(x =>
      x.claimAgeA.years === 67 && x.claimAgeA.months === 0 &&
      x.claimAgeB.years === 67 && x.claimAgeB.months === 0
    )
    // Both file at FRA: A gets $2000, B gets 50% of A's PIA = $1000
    expect(e.monthlyA).toBeCloseTo(2000, 2)
    expect(e.monthlyB).toBeCloseTo(1000, 2)
  })

  it("top-up reduction uses spouse's age when top-up actually starts", () => {
    // B has a small PIA (so gating allows tmB < tmA). B claims own at 62
    // (reduced own benefit), A claims at 70. Spousal top-up starts at age 70
    // (= max claim age), so the top-up portion is unreduced (start past FRA).
    const lowB = { birthYear: 1960, currentAge: 62, sex: 'male', pia: 800 }
    const r = optimizeCouple({
      paramsA: { ...baseA, deathAge: 85 },
      paramsB: { ...lowB, deathAge: 85 },
      mode: 'deterministic',
    })
    const e = r.heatmapMatrix.find(x =>
      x.claimAgeA.years === 70 && x.claimAgeA.months === 0 &&
      x.claimAgeB.years === 62 && x.claimAgeB.months === 0
    )
    // B's own at 62 = $800 * 0.7 = $560.
    // Spousal gross = 50% * $2000 PIA = $1000. Top-up = $1000 - $560 = $440
    // (unreduced — start age 70 is past B's FRA).
    // monthlyB = own + topUp = $560 + $440 = $1000.
    expect(e.monthlyB).toBeCloseTo(1000, 2)
  })

  it('A delays to 70 but dies at 65 → B gets reduced PIA-based survivor', () => {
    // A planned to claim at 70, died at 65 (pre-FRA, pre-filing). Survivor
    // amount from A = 100% PIA = $2000 (no 124% delayed credits). B becomes
    // survivor at age 66 (first age A is dead). bSurvStartAge = max(60, 65)
    // = 65; B's FRA = 67, reduction = (67-65)/(67-60) * 28.5% = 8.143%.
    // Factor = 0.91857. survPayToB = $2000 * 0.91857. B receives it from age
    // 66 to 84 (19 years). B's PIA = 0 so own pay is irrelevant.
    // Gating forces claimAgeB >= claimAgeA when B has $0 PIA, so use 70/70.
    const r = optimizeCouple({
      paramsA: { ...baseA, deathAge: 65 },
      paramsB: { ...baseB, deathAge: 84 },
      mode: 'deterministic',
      investRate: 0,
    })
    const e = r.heatmapMatrix.find(x =>
      x.claimAgeA.years === 70 && x.claimAgeA.months === 0 &&
      x.claimAgeB.years === 70 && x.claimAgeB.months === 0
    )
    const expected = 2000 * (1 - 0.285 * 2 / 7) * 12 * 19
    expect(e.value).toBeCloseTo(expected, 0)
  })

  it('B receives survivor benefit at age 60+ even before B files for own', () => {
    // A dies at 62. B is 62, claim 67. Pre-fix B got $0 between 63 and 66
    // because bStarted=false. Post-fix B gets reduced survivor immediately
    // from age 63. bSurvStartAge = max(60, 62) = 62. Reduction = 5/7 * 28.5%.
    // survAmtFromA = $2000. survPayToB = $2000 * (1 - 0.285 * 5/7).
    // B receives it from age 63 to 84 (22 years). B's own is $0.
    const r = optimizeCouple({
      paramsA: { ...baseA, deathAge: 62 },
      paramsB: { ...baseB, deathAge: 84 },
      mode: 'deterministic',
      investRate: 0,
    })
    const e = r.heatmapMatrix.find(x =>
      x.claimAgeA.years === 67 && x.claimAgeA.months === 0 &&
      x.claimAgeB.years === 67 && x.claimAgeB.months === 0
    )
    const expected = 2000 * (1 - 0.285 * 5 / 7) * 12 * 22
    expect(e.value).toBeCloseTo(expected, 0)
  })

  it('skips claimAgeB < claimAgeA combos when B has $0 PIA', () => {
    const r = optimizeCouple({
      paramsA: { ...baseA, deathAge: 85 },
      paramsB: { ...baseB, deathAge: 85 },
      mode: 'deterministic',
    })
    const violating = r.heatmapMatrix.find(e => {
      const tmA = e.claimAgeA.years * 12 + e.claimAgeA.months
      const tmB = e.claimAgeB.years * 12 + e.claimAgeB.months
      return tmB < tmA
    })
    expect(violating).toBeUndefined()
  })

  it('skips claimAgeA < claimAgeB combos when A has $0 PIA', () => {
    const r = optimizeCouple({
      paramsA: { ...baseB, deathAge: 85 },  // A has $0
      paramsB: { ...baseA, deathAge: 85 },  // B has $2000
      mode: 'deterministic',
    })
    const violating = r.heatmapMatrix.find(e => {
      const tmA = e.claimAgeA.years * 12 + e.claimAgeA.months
      const tmB = e.claimAgeB.years * 12 + e.claimAgeB.months
      return tmA < tmB
    })
    expect(violating).toBeUndefined()
  })

  it('A claims at 62 (reduced) then dies → B gets 82.5% PIA survivor floor', () => {
    // A claims at 62 → reduced own benefit of $1400. A dies at 75.
    // Survivor amount from A = max(0.825 × $2000, $1400) = $1650 (RIB-LIM floor).
    // B claims at 67. Between 67 and 75: both alive, A gets $1400, B gets
    // spousal top-up unreduced (start age 67 = FRA) so $1000 → household $2400/mo.
    // After A dies at 75 (ages 76-85): B alone, receives $1650/mo.
    const r = optimizeCouple({
      paramsA: { ...baseA, deathAge: 75 },
      paramsB: { ...baseB, deathAge: 85 },
      mode: 'deterministic',
      investRate: 0,
    })
    const e = r.heatmapMatrix.find(x =>
      x.claimAgeA.years === 62 && x.claimAgeA.months === 0 &&
      x.claimAgeB.years === 67 && x.claimAgeB.months === 0
    )
    // Ages 62-66: A has filed, B hasn't. A alone gets $1400 × 12 × 5 = $84,000
    // Ages 67-75: both filed. A = $1400, B own = $0, top-up = $1000 (50% PIA).
    //   Household = $2400 × 12 × 9 = $259,200
    // Ages 76-85: A dead, B alone gets max($0, $1650) = $1650/mo
    //   = $1650 × 12 × 10 = $198,000
    const expected = 84000 + 259200 + 198000
    expect(e.value).toBeCloseTo(expected, 0)
  })

  it('when B has $0 PIA, optimal B claim equals optimal A claim', () => {
    // With $0 PIA, B's optimal is to claim alongside A so the spousal top-up
    // starts as early as possible. Gating already forces tmB >= tmA;
    // the optimizer should also not delay tmB beyond tmA (would lose top-up).
    const r = optimizeCouple({
      paramsA: { ...baseA, deathAge: 85 },
      paramsB: { ...baseB, deathAge: 85 },
      mode: 'deterministic',
    })
    expect(r.optimal.claimAgeB.years).toBe(r.optimal.claimAgeA.years)
  })
})
