import { describe, it, expect } from 'vitest'
import { getFRA, benefitFactor, backOutPIA, benefitTable, spousalTopUp, survivorBenefit } from '../ssEngine.js'

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
