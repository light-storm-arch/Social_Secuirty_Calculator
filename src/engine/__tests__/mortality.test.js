import { describe, it, expect } from 'vitest'
import { survivalProb } from '../mortalityTable.js'

describe('survivalProb', () => {
  it('S(t=currentAge) = 1', () => {
    expect(survivalProb('male', 65, 65)).toBe(1.0)
    expect(survivalProb('female', 70, 70)).toBe(1.0)
  })
  it('S is monotonically decreasing', () => {
    let prev = 1.0
    for (let age = 63; age <= 100; age++) {
      const s = survivalProb('male', 62, age)
      expect(s).toBeLessThanOrEqual(prev)
      prev = s
    }
  })
  it('S approaches 0 near terminal age', () => {
    expect(survivalProb('male', 62, 115)).toBeLessThan(0.01)
  })
})
