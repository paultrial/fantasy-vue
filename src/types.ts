export interface ProgressionScore {
  weightedPriceDelta: number
  weightedPointDelta: number
}

export interface Athlete {
  id: string
  firstname: string
  lastname: string
  country: string
  countryname: string
  gender: 'Male' | 'Female'
  value: number
  totalpoints: number
  injury: boolean
  roundValues: string
  selected: boolean
  overBudget: boolean
  prices: number[]
  points: number[]
  oldValues: Record<string, number>
  progressionScore: ProgressionScore
  pricePerPoint: number
  instagram?: string
  appearances?: number
  thenValue?: number
  thenPoints?: number
  [key: string]: unknown
}

export interface TeamStats {
  sum: number
  [key: string]: number | { points: number; price: number }
}

export interface SavedTeam {
  number: number
  data: Athlete[]
  sum: number
  stats: TeamStats
}

export interface BestTeam {
  team: Athlete[]
  bestPoints?: number
  predictedPoints?: number
  totalValue: number
  roundname?: string
}
