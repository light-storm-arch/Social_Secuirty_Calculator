export const SSA_PERIOD_LIFE_TABLE_2022 = {
  source: "SSA Office of the Chief Actuary, Period Life Table 2022 (2025 Trustees Report)",
  url: "https://www.ssa.gov/oact/STATS/table4c6.html",
  startAge: 62,
  male: [
    0.014450, 0.015571, 0.016737, 0.017897, 0.019017, 0.020213, 0.021569,
    0.023088, 0.024828, 0.026705, 0.028761, 0.031116, 0.033861, 0.037088,
    0.041126, 0.045241, 0.049793, 0.054768, 0.060660, 0.067027, 0.073999,
    0.081737, 0.090458, 0.100525, 0.111793, 0.124494, 0.138398, 0.153207,
    0.169704, 0.187963, 0.208395, 0.230808, 0.253914, 0.277402, 0.300882,
    0.324326, 0.347332, 0.369430, 0.391927, 0.414726, 0.437722, 0.460800,
    0.483840, 0.508032, 0.533434, 0.560105, 0.588111, 0.617516, 0.648392,
    0.680812, 0.714852, 0.750595, 0.788125, 0.827531, 0.868907, 0.912353,
    0.957970, 1.000000
  ],
  female: [
    0.008991, 0.009681, 0.010343, 0.011018, 0.011743, 0.012532, 0.013512,
    0.014684, 0.016025, 0.017468, 0.019195, 0.021195, 0.023452, 0.025980,
    0.029153, 0.032394, 0.035888, 0.039676, 0.044156, 0.049087, 0.054635,
    0.061066, 0.068431, 0.076841, 0.086205, 0.096851, 0.109019, 0.121867,
    0.135805, 0.151108, 0.168020, 0.186340, 0.206432, 0.228086, 0.250406,
    0.273699, 0.296984, 0.319502, 0.342716, 0.366532, 0.390844, 0.415531,
    0.440463, 0.466891, 0.494904, 0.524599, 0.556075, 0.589439, 0.624805,
    0.662294, 0.702031, 0.744153, 0.788125, 0.827531, 0.868907, 0.912353,
    0.957970, 1.000000
  ]
}

// Returns P(alive at exact age targetAge | alive at exact age fromAge)
export function survivalProb(sex, fromAge, targetAge) {
  const table = SSA_PERIOD_LIFE_TABLE_2022
  const qx = table[sex]
  const start = table.startAge
  if (targetAge <= fromAge) return 1.0
  let S = 1.0
  for (let age = Math.floor(fromAge); age < Math.floor(targetAge); age++) {
    const idx = age - start
    if (idx < 0 || idx >= qx.length) break
    S *= (1 - qx[idx])
  }
  return S
}

// Joint survival (independent lives)
export function jointSurvivalProbs(sexA, fromAgeA, sexB, fromAgeB, targetAge) {
  return {
    SA: survivalProb(sexA, fromAgeA, targetAge),
    SB: survivalProb(sexB, fromAgeB, targetAge),
  }
}
