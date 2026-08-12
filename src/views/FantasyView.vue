<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { Athlete, BestTeam, SavedTeam, TeamStats } from '@/types'

const route = useRoute()
const money = 1_500_000
const maxMen = 4
const maxWomen = 2
const numberOfRounds = 6
const rounds = Array.from({ length: numberOfRounds }, (_, i) => `round${i + 1}`)
const roundAliases = [
  "South Korea World Cup #1",
    "Loudenvielle World Cup #2",
    "Leogang World Cup #3",
    "Lenzerheide World Cup #4",
    "La Thuile World Cup #5",
    "Andorra World Cup #6",
    "Les Gets World Cup #7",
    "2026 World Championships",
    "Whistler World Cup #8",
    "Lake Placid World Cup #9"
]
const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const loading = ref(true)
const loadError = ref('')
const athletes = ref<Athlete[]>([])
const filteredAthletes = ref<Athlete[]>([])
const team = ref<Athlete[]>([])
const historyTeams = ref<SavedTeam[]>([])
const bestTeams = ref<BestTeam[]>([])
const predictedTeam = ref<BestTeam | null>(null)
const calculatingBest = ref(false)
const calculatingPrediction = ref(false)
const sortKey = reactive({ key: 'value', direction: 'desc' as 'asc' | 'desc' })

const filters = reactive({
  injuryOnly: true,
  name: '',
  gender: '',
  country: '',
  priceMin: undefined as number | undefined,
  priceMax: undefined as number | undefined,
  oneRoundMin: undefined as number | undefined,
  oneRoundMax: undefined as number | undefined,
  totalMin: undefined as number | undefined,
  totalMax: undefined as number | undefined,
  pointDeltaMin: undefined as number | undefined,
  pointDeltaMax: undefined as number | undefined,
  priceDeltaMin: undefined as number | undefined,
  priceDeltaMax: undefined as number | undefined,
})
const roundFilters = reactive<Record<string, number | undefined>>(
  Object.fromEntries(rounds.map((r) => [r, undefined])),
)

const sum = computed(() => team.value.reduce((total, athlete) => total + athlete.value, 0))
const budget = computed(() => money - sum.value)
const menCount = computed(() => team.value.filter((athlete) => athlete.gender === 'Male').length)
const womenCount = computed(
  () => team.value.filter((athlete) => athlete.gender === 'Female').length,
)
const errorMessage = computed(() => {
  if (menCount.value > maxMen && womenCount.value > maxWomen) return 'Too many people on the team'
  if (menCount.value > maxMen) return 'Too many men on the team'
  if (womenCount.value > maxWomen) return 'Too many women on the team'
  if (budget.value < 0) return 'Team is over budget'
  return ''
})
const currentStats = computed(() => calculateStats(team.value))
const maxPointsPossible = computed(() =>
  bestTeams.value.reduce((total, item) => total + Number(item.bestPoints || 0), 0),
)
const pointDeltaRange = computed(() => rangeFor('weightedPointDelta'))
const priceDeltaRange = computed(() => rangeFor('weightedPriceDelta'))
const countryList = computed(() => {
  const countries = new Map<
    string,
    { code: string; name: string; athletes: number; points: number }
  >()
  for (const athlete of athletes.value) {
    const current = countries.get(athlete.country) || {
      code: athlete.country,
      name: athlete.countryname,
      athletes: 0,
      points: 0,
    }
    current.athletes += 1
    current.points += athlete.totalpoints
    countries.set(athlete.country, current)
  }
  return [...countries.values()].sort((a, b) => b.points - a.points)
})

function numeric(value: unknown): number {
  return Number(value || 0)
}

function parseAthlete(raw: Record<string, unknown>): Athlete {
  const prices = String(raw.roundValues || '')
    .replace(/,/g, '')
    .split(';')
    .filter(Boolean)
    .map((entry) => numeric(entry.split(':')[1]))
  const points = rounds.map((round) => numeric(raw[round]))
  const oldValues: Record<string, number> = {}
  prices.forEach((price, i) => {
    oldValues[`round${i}`] = price
  })
  const value = numeric(raw.value)
  const totalpoints = numeric(raw.totalpoints)
  const athlete = {
    ...raw,
    id: String(raw.id),
    firstname: String(raw.firstname || ''),
    lastname: String(raw.lastname || ''),
    country: String(raw.country || ''),
    countryname: String(raw.countryname || ''),
    gender: numeric(raw.gender) === 1 ? 'Male' : 'Female',
    value,
    totalpoints,
    injury: Boolean(raw.injury),
    roundValues: String(raw.roundValues || ''),
    selected: false,
    overBudget: false,
    prices,
    points,
    oldValues,
    progressionScore: { weightedPriceDelta: 0, weightedPointDelta: 0 },
    pricePerPoint: totalpoints > 0 ? value / totalpoints : 0,
  } as Athlete
  athlete.progressionScore = computeProgressionScore(athlete)
  return athlete
}

function computeProgressionScore(athlete: Athlete) {
  const weights = Array.from({ length: 11 }, (_, i) => (i + 1) / numberOfRounds)
  const priceDeltas = athlete.prices
    .slice(1)
    .filter((price) => price > 0)
    .map((price, i) => price - (athlete.prices[i] ?? 0))
  const firstFourPoints = rounds.slice(0, 4).map((round) => numeric(athlete[round]))
  const pointDeltas = firstFourPoints
    .slice(1)
    .map((points, i) => points - (firstFourPoints[i] ?? 0))
  return {
    weightedPriceDelta: priceDeltas.reduce(
      (total, delta, i) => total + delta * (weights[i] ?? 0),
      0,
    ),
    weightedPointDelta: pointDeltas.reduce(
      (total, delta, i) => total + delta * (weights[i] ?? 0),
      0,
    ),
  }
}

function rangeFor(key: 'weightedPointDelta' | 'weightedPriceDelta') {
  const values = athletes.value.map((athlete) => athlete.progressionScore[key])
  return {
    min: values.length ? Math.min(...values) : 0,
    max: values.length ? Math.max(...values) : 0,
  }
}

function calculateStats(list: Athlete[]): TeamStats {
  const stats: TeamStats = { sum: 0 }
  rounds.forEach((round, i) => {
    const points = list.reduce((total, athlete) => total + numeric(athlete[round]), 0)
    const price = list.reduce(
      (total, athlete) => total + numeric(athlete.oldValues[`round${i}`]),
      0,
    )
    stats[roundAliases[i] ?? round] = { points, price }
    stats.sum += points
  })
  return stats
}

function sortAthletes() {
  filteredAthletes.value.sort((a, b) => {
    const av = numeric(a[sortKey.key]) || numeric(a.pricePerPoint)
    const bv = numeric(b[sortKey.key]) || numeric(b.pricePerPoint)
    return sortKey.direction === 'asc' ? av - bv : bv - av
  })
}

function sortBy(key: string) {
  if (sortKey.key === key) sortKey.direction = sortKey.direction === 'asc' ? 'desc' : 'asc'
  else {
    sortKey.key = key
    sortKey.direction = 'desc'
  }
  sortAthletes()
}

function bounded(value: number, min?: number, max?: number) {
  return (min == null || value >= min) && (max == null || value <= max)
}

function applyFilters() {
  const query = filters.name.trim().toLowerCase()
  filteredAthletes.value = athletes.value.filter((athlete) => {
    const nameMatch =
      !query || `${athlete.firstname} ${athlete.lastname}`.toLowerCase().includes(query)
    const oneRoundMatch =
      filters.oneRoundMin == null && filters.oneRoundMax == null
        ? true
        : athlete.points.some((points) => bounded(points, filters.oneRoundMin, filters.oneRoundMax))
    return (
      nameMatch &&
      (!filters.gender || athlete.gender === filters.gender) &&
      (!filters.country || athlete.country === filters.country) &&
      (!filters.injuryOnly || !athlete.injury) &&
      bounded(athlete.value, filters.priceMin, filters.priceMax) &&
      bounded(athlete.totalpoints, filters.totalMin, filters.totalMax) &&
      bounded(
        athlete.progressionScore.weightedPointDelta,
        filters.pointDeltaMin,
        filters.pointDeltaMax,
      ) &&
      bounded(
        athlete.progressionScore.weightedPriceDelta,
        filters.priceDeltaMin,
        filters.priceDeltaMax,
      ) &&
      oneRoundMatch &&
      rounds.every(
        (round) =>
          roundFilters[round] == null || numeric(athlete[round]) >= Number(roundFilters[round]),
      )
    )
  })
  sortAthletes()
}

function resetFilters() {
  Object.assign(filters, {
    injuryOnly: true,
    name: '',
    gender: '',
    country: '',
    priceMin: undefined,
    priceMax: undefined,
    oneRoundMin: undefined,
    oneRoundMax: undefined,
    totalMin: undefined,
    totalMax: undefined,
    pointDeltaMin: undefined,
    pointDeltaMax: undefined,
    priceDeltaMin: undefined,
    priceDeltaMax: undefined,
  })
  rounds.forEach((round) => {
    roundFilters[round] = undefined
  })
  applyFilters()
}

function updateTeamState(b: boolean | undefined = false) {
  team.value = athletes.value.filter((athlete) => athlete.selected)
  athletes.value.forEach((athlete) => {
    athlete.overBudget = !athlete.selected && athlete.value > budget.value
  })
  if (b !== false) localStorage.setItem('team', JSON.stringify(team.value))
}

function toggleAthlete(athlete: Athlete) {
  athlete.selected = !athlete.selected
  updateTeamState()
}

function clearTeam() {
  athletes.value.forEach((athlete) => {
    athlete.selected = false
    athlete.overBudget = athlete.value > money
  })
  team.value = []
  localStorage.removeItem('team')
}

function nextHistoryNumber() {
  const numbers = Object.keys(localStorage)
    .filter((key) => key.startsWith('team/'))
    .map((key) => Number(key.slice(5)))
    .filter(Number.isFinite)
  return numbers.length ? Math.max(...numbers) + 1 : 1
}

function saveForLater() {
  if (!team.value.length) return
  localStorage.setItem(`team/${nextHistoryNumber()}`, JSON.stringify(team.value))
  loadHistory()
}

function loadHistory() {
  historyTeams.value = Object.keys(localStorage)
    .filter((key) => /^team\/\d+$/.test(key))
    .map((key) => {
      const ids = (JSON.parse(localStorage.getItem(key) || '[]') as Array<{ id: string }>).map(
        (item) => String(item.id),
      )
      const data = athletes.value.filter((athlete) => ids.includes(athlete.id))
      return {
        number: Number(key.slice(5)),
        data,
        sum: data.reduce((total, athlete) => total + athlete.value, 0),
        stats: calculateStats(data),
      }
    })
    .sort((a, b) => a.number - b.number)
}

function deleteHistory(number: number) {
  localStorage.removeItem(`team/${number}`)
  loadHistory()
}

function loadFromHistory(number: number) {
  const saved = historyTeams.value.find((item) => item.number === number)
  if (!saved) return
  if (team.value.length) saveForLater()
  const ids = new Set(saved.data.map((athlete) => athlete.id))
  athletes.value.forEach((athlete) => {
    athlete.selected = ids.has(athlete.id)
  })
  updateTeamState()
  // window.scrollTo({ top: 0, behavior: 'smooth' })
}

function clearHistory() {
  Object.keys(localStorage)
    .filter((key) => /^team\/\d+$/.test(key))
    .forEach((key) => localStorage.removeItem(key))
  historyTeams.value = []
}

function getRoundValue(athlete: Athlete, round: number) {
  return round <= 1
    ? numeric(athlete.oldValues.round0) || athlete.value
    : numeric(athlete.oldValues[`round${round - 2}`]) || athlete.value
}

type Combo = { team: Athlete[]; value: number; points: number }

function femalePairs(
  list: Athlete[],
  valueOf: (athlete: Athlete) => number,
  pointsOf: (athlete: Athlete) => number,
): Combo[] {
  const result: Combo[] = []
  for (let i = 0; i < list.length - 1; i++)
    for (let j = i + 1; j < list.length; j++) {
      const first = list[i]!
      const second = list[j]!
      const value = valueOf(first) + valueOf(second)
      if (value <= money)
        result.push({ team: [first, second], value, points: pointsOf(first) + pointsOf(second) })
    }
  result.sort((a, b) => a.value - b.value)
  let best: Combo | undefined
  return result.map((combo) => {
    if (!best || combo.points > best.points) best = combo
    return { ...best, team: [...best.team] }
  })
}

function bestPairWithin(pairs: Combo[], available: number) {
  let low = 0,
    high = pairs.length - 1,
    answer = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (pairs[mid]!.value <= available) {
      answer = mid
      low = mid + 1
    } else high = mid - 1
  }
  return answer >= 0 ? pairs[answer] : undefined
}

function optimizeTeam(
  list: Athlete[],
  valueOf: (athlete: Athlete) => number,
  pointsOf: (athlete: Athlete) => number,
): Combo | null {
  const men = list
    .filter((athlete) => athlete.gender === 'Male')
    .sort((a, b) => valueOf(a) - valueOf(b))
  const women = list.filter((athlete) => athlete.gender === 'Female')
  const pairs = femalePairs(women, valueOf, pointsOf)
  let best: Combo | null = null
  for (let a = 0; a < men.length - 3; a++)
    for (let b = a + 1; b < men.length - 2; b++)
      for (let c = b + 1; c < men.length - 1; c++)
        for (let d = c + 1; d < men.length; d++) {
          const maleTeam = [men[a]!, men[b]!, men[c]!, men[d]!]
          const maleValue = maleTeam.reduce((total, athlete) => total + valueOf(athlete), 0)
          if (maleValue > money) break
          const pair = bestPairWithin(pairs, money - maleValue)
          if (!pair) continue
          const points =
            maleTeam.reduce((total, athlete) => total + pointsOf(athlete), 0) + pair.points
          if (!best || points > best.points)
            best = { team: [...maleTeam, ...pair.team], value: maleValue + pair.value, points }
        }
  return best
}

async function calculateBestTeams() {
  const cacheKey = `bestTeams/vue-v1/${numberOfRounds}/${money}/${String(route.meta.dataFile)}`
  const cached = localStorage.getItem(cacheKey)
  if (cached) {
    bestTeams.value = JSON.parse(cached) as BestTeam[]
    return
  }
  calculatingBest.value = true
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 20))
  const results: BestTeam[] = []
  for (let round = 1; round <= numberOfRounds; round++) {
    const combo = optimizeTeam(
      athletes.value,
      (athlete) => getRoundValue(athlete, round),
      (athlete) => numeric(athlete[`round${round}`]),
    )
    if (combo)
      results.push({
        team: combo.team.map((athlete) => ({
          ...athlete,
          thenValue: getRoundValue(athlete, round),
          thenPoints: numeric(athlete[`round${round}`]),
        })),
        bestPoints: combo.points,
        totalValue: combo.value,
        roundname: roundAliases[round - 1],
      })
  }
  const appearances = new Map<string, number>()
  results.forEach((result) =>
    result.team.forEach((athlete) =>
      appearances.set(athlete.id, (appearances.get(athlete.id) || 0) + 1),
    ),
  )
  results.forEach((result) =>
    result.team.forEach((athlete) => {
      athlete.appearances = appearances.get(athlete.id)
    }),
  )
  bestTeams.value = results
  localStorage.setItem(cacheKey, JSON.stringify(results))
  calculatingBest.value = false
}

async function predictNextTeam() {
  if (calculatingPrediction.value) return
  calculatingPrediction.value = true
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 20))
  const eligible = athletes.value.filter((athlete) => !athlete.injury)
  const predictedPoints = (athlete: Athlete) =>
    athlete.totalpoints + athlete.progressionScore.weightedPointDelta
  const projectedValue = (athlete: Athlete) =>
    Math.max(0, athlete.value + athlete.progressionScore.weightedPriceDelta)
  const combo = optimizeTeam(eligible, projectedValue, predictedPoints)
  predictedTeam.value = combo
    ? { team: combo.team, predictedPoints: Math.round(combo.points), totalValue: combo.value }
    : null
  calculatingPrediction.value = false
}

function heatColor(value: number, type: 'red' | 'green') {
  const range = type === 'red' ? priceDeltaRange.value : pointDeltaRange.value
  const span = range.max - range.min || 1
  const normalized = (Math.max(range.min, Math.min(value, range.max)) - range.min) / span
  return type === 'red'
    ? `rgb(${Math.round(220 * (1 - normalized))},0,0)`
    : `rgb(0,${Math.round(255 * normalized)},0)`
}

async function loadData() {
  loading.value = true
  loadError.value = ''
  team.value = []
  bestTeams.value = []
  try {
    const file = String(route.meta.dataFile || 'PBathletes.json')
    const [dataResponse, instagramResponse] = await Promise.all([
      fetch(`/assets/${file}`),
      fetch('/assets/instagram.json'),
    ])
    if (!dataResponse.ok) throw new Error(`Could not load ${file}`)
    const raw = (await dataResponse.json()) as Record<string, Record<string, unknown>>
    const list = Object.values(raw).map(parseAthlete)
    if (instagramResponse.ok) {
      const instagram = (await instagramResponse.json()) as {
        downhill_athletes: Array<{ name: string; instagram_handle: string }>
      }
      const handles = new Map(
        instagram.downhill_athletes.map((item) => [item.name, item.instagram_handle]),
      )
      list.forEach((athlete) => {
        athlete.instagram = handles.get(`${athlete.firstname} ${athlete.lastname}`)
      })
    }
    athletes.value = list
    const saved = JSON.parse(localStorage.getItem('team') || '[]') as Array<{ id: string }>
    const ids = new Set(saved.map((item) => String(item.id)))
    list.forEach((athlete) => {
      athlete.selected = ids.has(athlete.id)
    })
    updateTeamState(false)
    loadHistory()
    applyFilters()
    loading.value = false
    void calculateBestTeams()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Unable to load athlete data.'
    loading.value = false
  }
}

watch(() => route.meta.dataFile, loadData, { immediate: true })
</script>

<template>
  <main class="fantasy-layout">
    <aside class="sidebar">
      <div class="sidebar-content">
        <h1>P.B. Fantasy DH</h1>

        <section class="card team-card">
          <h2 :class="{ danger: sum > money }">Your Team {{ currency.format(sum) }}</h2>
          <p>
            Budget: <strong>{{ currency.format(budget) }}</strong>
          </p>
          <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
          <div class="gender-counts">
            <span
              :class="
                womenCount === maxWomen
                  ? 'complete'
                  : womenCount > maxWomen
                    ? 'wrong'
                    : 'incomplete'
              "
              >women {{ womenCount }} / {{ maxWomen }}</span
            >
            <span
              :class="menCount === maxMen ? 'complete' : menCount > maxMen ? 'wrong' : 'incomplete'"
              >men {{ menCount }} / {{ maxMen }}</span
            >
          </div>
          <ul class="compact-list" :title="JSON.stringify(currentStats)">
            <li v-for="athlete in team" :key="athlete.id">
              <span>{{ athlete.firstname }} {{ athlete.lastname }}</span>
              <span class="row-data"
                ><b>{{ currency.format(athlete.value) }}</b
                ><b>{{ athlete.totalpoints }}</b
                ><button class="round-action" @click="toggleAthlete(athlete)">−</button></span
              >
            </li>
            <li
              v-for="slot in Math.max(0, maxMen - menCount)"
              :key="`m${slot}`"
              class="placeholder"
            >
              Pick Male WC Racer
            </li>
            <li
              v-for="slot in Math.max(0, maxWomen - womenCount)"
              :key="`w${slot}`"
              class="placeholder"
            >
              Pick Female WC Racer
            </li>
          </ul>
          <div v-if="team.length" class="button-row">
            <button @click="clearTeam">Clear team</button
            ><button @click="saveForLater">Save for later</button>
          </div>
        </section>

        <section class="card filters-card">
          <h2>Filters</h2>
          <label class="filter checkbox"
            ><span>not injured</span
            ><input v-model="filters.injuryOnly" type="checkbox" @change="applyFilters"
          /></label>
          <label class="filter"
            ><span>by name</span
            ><input v-model="filters.name" placeholder="Filter by name" @input="applyFilters"
          /></label>
          <label class="filter"
            ><span>by gender</span
            ><select v-model="filters.gender" @change="applyFilters">
              <option value="">All Genders</option>
              <option>Male</option>
              <option>Female</option>
            </select></label
          >
          <label class="filter minmax"
            ><span>by price</span
            ><input
              v-model.number="filters.priceMin"
              type="number"
              placeholder="min"
              @input="applyFilters" /><input
              v-model.number="filters.priceMax"
              type="number"
              placeholder="max"
              @input="applyFilters"
          /></label>
          <label class="filter minmax"
            ><span>points in one round</span
            ><input
              v-model.number="filters.oneRoundMin"
              type="number"
              step="5"
              placeholder="min"
              @input="applyFilters" /><input
              v-model.number="filters.oneRoundMax"
              step="5"
              type="number"
              placeholder="max"
              @input="applyFilters"
          /></label>
          <label class="filter minmax"
            ><span>by total points</span
            ><input
              v-model.number="filters.totalMin"
              type="number"
              placeholder="min"
              @input="applyFilters" /><input
              v-model.number="filters.totalMax"
              type="number"
              placeholder="max"
              @input="applyFilters"
          /></label>
          <label class="filter"
            ><span>by country</span
            ><select v-model="filters.country" @change="applyFilters">
              <option value="">All Countries</option>
              <option v-for="country in countryList" :key="country.code" :value="country.code">
                {{ country.name }} · {{ country.athletes }} athletes · {{ country.points }} pts
              </option>
            </select></label
          >
          <label class="filter minmax"
            ><span>point trend</span
            ><input
              v-model.number="filters.pointDeltaMin"
              type="number"
              :placeholder="String(pointDeltaRange.min.toFixed(1))"
              @input="applyFilters" /><input
              v-model.number="filters.pointDeltaMax"
              type="number"
              :placeholder="String(pointDeltaRange.max.toFixed(1))"
              @input="applyFilters"
          /></label>
          <label class="filter minmax"
            ><span>price trend</span
            ><input
              v-model.number="filters.priceDeltaMin"
              type="number"
              :placeholder="String(priceDeltaRange.min.toFixed(0))"
              @input="applyFilters" /><input
              v-model.number="filters.priceDeltaMax"
              type="number"
              :placeholder="String(priceDeltaRange.max.toFixed(0))"
              @input="applyFilters"
          /></label>
          <label v-for="(round, i) in rounds" :key="round" class="filter"
            ><span>points @ {{ roundAliases[i] }}</span
            ><input
              v-model.number="roundFilters[round]"
              type="number"
              placeholder="min"
              @input="applyFilters"
          /></label>
          <button @click="resetFilters">Reset</button>
        </section>

        <section v-if="historyTeams.length" class="card">
          <h2>History</h2>
          <article v-for="saved in historyTeams" :key="saved.number" class="saved-team">
            <p>
              <strong>#{{ saved.number }}</strong> · {{ currency.format(saved.sum) }} ·
              {{ saved.stats.sum }} pts
            </p>
            <ul class="compact-list">
              <li v-for="athlete in saved.data" :key="athlete.id">
                <span>{{ athlete.firstname }} {{ athlete.lastname }}</span
                ><b>{{ athlete.totalpoints }}</b>
              </li>
            </ul>
            <div class="button-row">
              <button @click="deleteHistory(saved.number)">Delete</button
              ><button @click="loadFromHistory(saved.number)">Load</button>
            </div>
          </article>
          <button @click="clearHistory">Clear history</button>
        </section>

        <section class="card">
          <h2>Predicted next best team</h2>
          <template v-if="predictedTeam">
            <p>
              <strong>{{ predictedTeam.predictedPoints }}</strong> predicted points ·
              {{ currency.format(predictedTeam.totalValue) }}
            </p>
            <ul class="compact-list">
              <li v-for="athlete in predictedTeam.team" :key="athlete.id">
                <span>{{ athlete.firstname }} {{ athlete.lastname }}</span
                ><b>{{ athlete.totalpoints }}</b>
              </li>
            </ul>
          </template>
          <button :disabled="calculatingPrediction || loading" @click="predictNextTeam">
            {{ calculatingPrediction ? 'Calculating…' : 'Predict next best team' }}
          </button>
        </section>
      </div>
    </aside>

    <section class="content-area">
      <p v-if="loading" class="state-message">Loading riders…</p>
      <p v-else-if="loadError" class="state-message error-message">{{ loadError }}</p>
      <template v-else>
        <section class="riders-panel">
          <div class="athlete-table header-row">
            <div>Name</div>
            <div class="graphs-label">Points / price history</div>
            <button @click="sortBy('value')">
              Price {{ sortKey.key === 'value' ? (sortKey.direction === 'desc' ? '↓' : '↑') : '' }}
            </button>
            <button @click="sortBy('totalpoints')">
              Points
              {{ sortKey.key === 'totalpoints' ? (sortKey.direction === 'desc' ? '↓' : '↑') : '' }}
            </button>
            <button @click="sortBy('pricePerPoint')">
              Price / point
              {{
                sortKey.key === 'pricePerPoint' ? (sortKey.direction === 'desc' ? '↓' : '↑') : ''
              }}
            </button>
            <span>+/−</span>
          </div>
          <ul class="rider-list">
            <li
              v-for="athlete in filteredAthletes"
              :key="athlete.id"
              class="athlete-table rider-row"
              :class="{ selected: athlete.selected, overbudget: athlete.overBudget }"
            >
              <div class="rider-name">
                <img class="flag" :src="`/assets/flags/${athlete.country}.gif`" alt="" /><span
                  >{{ athlete.firstname }} {{ athlete.lastname }}</span
                ><a
                  v-if="athlete.instagram"
                  class="instagram"
                  :href="`https://instagram.com/${athlete.instagram}`"
                  target="_blank"
                  rel="noopener"
                  aria-label="Instagram"
                ></a
                ><img
                  v-if="athlete.injury"
                  class="injury"
                  src="/assets/injury.png"
                  alt="Injured"
                  title="Injured"
                />
              </div>
              <div class="mini-graphs">
                <span v-for="(points, i) in athlete.points" :key="`p${i}`" class="bar"
                  ><i
                    class="points-fill"
                    :style="{ height: `${Math.min(100, points / 6)}%` }"
                    :title="`${points} points`"
                  ></i
                ></span>
                <span v-for="(price, i) in athlete.prices" :key="`v${i}`" class="bar"
                  ><i
                    class="price-fill"
                    :style="{ height: `${Math.min(100, price / 3000)}%` }"
                    :title="currency.format(price)"
                  ></i
                ></span>
              </div>
              <div
                class="metric price"
                :style="{
                  backgroundColor: heatColor(athlete.progressionScore.weightedPriceDelta, 'red'),
                }"
              >
                {{ currency.format(athlete.value) }}
              </div>
              <div
                class="metric points"
                :style="{
                  backgroundColor: heatColor(athlete.progressionScore.weightedPointDelta, 'green'),
                }"
              >
                {{ athlete.totalpoints }}
              </div>
              <div class="price-point">{{ currency.format(athlete.pricePerPoint) }}</div>
              <button class="round-action" @click="toggleAthlete(athlete)">
                {{ athlete.selected ? '−' : '+' }}
              </button>
            </li>
          </ul>
          <p class="result-count">{{ filteredAthletes.length }} athletes</p>
        </section>

        <aside class="best-panel">
          <h2>Best Teams</h2>
          <p v-if="calculatingBest">Calculating exact teams…</p>
          <p v-else>
            Maximum points: <strong>{{ maxPointsPossible }}</strong>
          </p>
          <article v-for="round in bestTeams" :key="round.roundname" class="best-round">
            <h3>{{ round.roundname }}</h3>
            <p>
              {{ round.bestPoints }} points · {{ currency.format(money - round.totalValue) }} left
            </p>
            <ul class="compact-list">
              <li v-for="athlete in round.team" :key="athlete.id">
                <span
                  >{{ athlete.firstname }} {{ athlete.lastname }}
                  <small>({{ athlete.appearances }})</small></span
                ><span
                  ><b>{{ currency.format(athlete.thenValue || 0) }}</b> ·
                  {{ athlete.thenPoints }}</span
                >
              </li>
            </ul>
          </article>
        </aside>
      </template>
    </section>
  </main>
</template>

<style scoped>
.fantasy-layout {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(390px, 25%) 1fr;
}
.sidebar {
  background: #050505 url('/assets/bg.jpg') top center / 100% auto no-repeat;
}
.sidebar-content {
  position: sticky;
  top: 0;
  display: grid;
  gap: 12px;
  max-height: 100vh;
  overflow: auto;
  padding: 24px 14px 40px;
}
h1 {
  margin: 0;
  text-align: center;
  color: white;
  font-size: 2rem;
  text-shadow: 0 2px 10px black;
}
h2,
h3,
p {
  margin-top: 0;
}
h2 {
  margin-bottom: 8px;
  font-size: 1.15rem;
}
.card {
  padding: 13px;
  border: 1px solid #ccc;
  border-radius: 12px;
  background: rgb(249 249 249 / 96%);
  color: #111;
}
.danger,
.error-message {
  padding: 4px;
  color: white;
  background: #c72525;
}
.gender-counts {
  display: flex;
  justify-content: space-around;
  margin: 10px 0 6px;
}
.gender-counts span {
  padding-bottom: 3px;
  border-bottom: 3px solid;
}
.incomplete {
  border-color: #e8c900 !important;
}
.complete {
  border-color: green !important;
}
.wrong {
  border-color: red !important;
}
.compact-list,
.rider-list {
  margin: 8px 0;
  padding: 0;
  list-style: none;
}
.compact-list li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px solid #ccc;
}
.compact-list .placeholder {
  color: #777;
  font-style: italic;
}
.row-data {
  display: flex;
  align-items: center;
  gap: 9px;
}
.button-row {
  display: flex;
  gap: 7px;
  margin-top: 9px;
}
button {
  padding: 5px 9px;
  border: 1px solid #aaa;
  border-radius: 6px;
  background: white;
}
button:hover:not(:disabled) {
  background: #d9fff1;
}
button:disabled {
  cursor: wait;
  opacity: 0.6;
}
.round-action {
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 50%;
  font-size: 18px;
  line-height: 20px;
}
.filters-card {
  display: grid;
  gap: 6px;
}
.filter {
  display: grid;
  grid-template-columns: minmax(130px, 1fr) minmax(100px, 175px);
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
}
.filter.minmax {
  grid-template-columns: minmax(130px, 1fr) minmax(65px, 83px) minmax(65px, 83px);
}
.filter.checkbox {
  grid-template-columns: 1fr auto;
  padding-bottom: 6px;
  border-bottom: 1px solid #bbb;
  font-weight: 700;
}
.filter input:not([type='checkbox']),
.filter select {
  min-width: 0;
  width: 100%;
  padding: 5px;
  border: 1px solid #bbb;
  border-radius: 5px;
  background: white;
}
.saved-team {
  margin: 12px 0;
  padding-top: 9px;
  border-top: 1px solid #bbb;
}
.content-area {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(630px, 1fr) 310px;
  gap: 12px;
  padding: 14px 12px;
  align-items: start;
}
.state-message {
  grid-column: 1 / -1;
  margin: 70px auto;
  font-size: 1.2rem;
}
.riders-panel {
  min-width: 0;
  overflow-x: auto;
}
.athlete-table {
  min-width: 720px;
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 216px 90px 62px 100px 30px;
  align-items: center;
}
.header-row {
  min-height: 38px;
  font-weight: 700;
  border-bottom: 2px solid #333;
}
.header-row button {
  border: 0;
  border-radius: 0;
  font-weight: 700;
  background: transparent;
}
.graphs-label {
  text-align: center;
  font-size: 0.75rem;
  color: #777;
}
.rider-row {
  height: 31px;
  border-bottom: 1px solid #ddd;
}
.rider-row:hover {
  background: #eee;
}
.rider-row.selected {
  color: white;
  background: #111;
}
.rider-row.overbudget {
  color: #111;
  background: burlywood;
}
.rider-name {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 5px;
  overflow: hidden;
  white-space: nowrap;
}
.rider-name > span {
  overflow: hidden;
  text-overflow: ellipsis;
}
.flag {
  width: 18px;
  max-height: 12px;
  object-fit: contain;
}
.injury {
  width: 13px;
  height: 13px;
}
.instagram {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  background: url('/assets/insta.svg') center / contain no-repeat;
}
.mini-graphs {
  align-self: stretch;
  display: flex;
  align-items: end;
  background: white;
  overflow: hidden;
}
.bar {
  position: relative;
  width: 18px;
  height: 100%;
  display: flex;
  align-items: end;
  border-right: 1px solid #eee;
}
.bar i {
  display: block;
  width: 100%;
  background: orange;
}
.bar .points-fill {
  background: #f59e0b;
}
.bar .price-fill {
  background: #60a5fa;
}
.metric {
  align-self: stretch;
  display: grid;
  place-items: center;
  color: white;
  font-size: 0.85rem;
}
.price-point {
  text-align: center;
}
.result-count {
  color: #555;
}
.best-panel {
  min-width: 0;
}
.best-round {
  margin-bottom: 14px;
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 9px;
}
.best-round h3 {
  margin-bottom: 3px;
  font-size: 0.95rem;
}
.best-round p {
  font-size: 0.85rem;
}
.best-round .compact-list {
  font-size: 0.78rem;
}
small {
  color: #777;
}
@media (max-width: 1100px) {
  .fantasy-layout {
    grid-template-columns: 380px 1fr;
  }
  .content-area {
    grid-template-columns: minmax(630px, 1fr);
  }
  .best-panel {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .best-panel > h2,
  .best-panel > p {
    grid-column: 1 / -1;
  }
}
@media (max-width: 760px) {
  .fantasy-layout {
    display: block;
  }
  .sidebar-content {
    position: static;
    max-height: none;
  }
  .content-area {
    display: block;
    padding: 10px 0;
  }
  .riders-panel {
    padding: 0 10px;
  }
  .best-panel {
    display: block;
    padding: 14px;
  }
  .season-nav {
    position: absolute;
  }
}
</style>
