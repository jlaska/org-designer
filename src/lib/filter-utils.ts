import type { PersonRecord } from '@/types/person'
import type { FilterState } from '@/store'
import { buildChildrenMap, getSubtreeIds } from '@/lib/hierarchy-utils'

export function matchesFilter(person: PersonRecord, filters: FilterState): boolean {
  if (filters.geos.length > 0 && !filters.geos.includes(person.geo)) return false
  if (filters.countries.length > 0 && !filters.countries.includes(person.co)) return false
  if (filters.jobRoles.length > 0 && !filters.jobRoles.includes(person.jobRole)) return false
  if (filters.teams.length > 0 && !filters.teams.includes(person.teamId ?? '')) return false
  if (filters.jobTitles.length > 0 && !filters.jobTitles.includes(person.jobTitle)) return false
  if (filters.peopleType === 'managers' && person.directReports === 0) return false
  if (filters.peopleType === 'ics' && person.directReports > 0) return false
  return true
}

export function hasActiveFilters(filters: FilterState): boolean {
  return (
    filters.geos.length > 0 ||
    filters.countries.length > 0 ||
    filters.jobRoles.length > 0 ||
    filters.teams.length > 0 ||
    filters.jobTitles.length > 0 ||
    filters.peopleType !== 'all'
  )
}

export function computeFilteredIds(
  people: Record<string, PersonRecord>,
  filters: FilterState,
): { matchIds: Set<string>; ancestorIds: Set<string> } {
  const matchIds = new Set<string>()
  for (const [uid, person] of Object.entries(people)) {
    if (matchesFilter(person, filters)) matchIds.add(uid)
  }

  // For hide mode: preserve ancestors of matches so the tree stays connected
  const ancestorIds = new Set<string>()
  for (const uid of matchIds) {
    let cur = people[uid]?.managerUid
    while (cur && !ancestorIds.has(cur) && !matchIds.has(cur)) {
      ancestorIds.add(cur)
      cur = people[cur]?.managerUid ?? null
    }
  }

  return { matchIds, ancestorIds }
}

export function computeExcludedIds(
  people: Record<string, PersonRecord>,
  filters: FilterState,
): Set<string> {
  if (!hasActiveFilters(filters)) return new Set(Object.keys(people))
  const childrenMap = buildChildrenMap(people)
  const excludedIds = new Set<string>()
  for (const [uid, person] of Object.entries(people)) {
    if (matchesFilter(person, filters)) {
      for (const id of getSubtreeIds(uid, people, childrenMap)) {
        excludedIds.add(id)
      }
    }
  }
  const visibleIds = new Set<string>()
  for (const uid of Object.keys(people)) {
    if (!excludedIds.has(uid)) visibleIds.add(uid)
  }
  return visibleIds
}

/** Visible person IDs for include/exclude filter modes (undefined = highlight/all visible). */
export function computeFilterVisibleIds(
  people: Record<string, PersonRecord>,
  filters: FilterState,
): Set<string> | undefined {
  if (!hasActiveFilters(filters) || filters.mode === 'highlight') return undefined
  if (filters.mode === 'include') {
    const { matchIds, ancestorIds } = computeFilteredIds(people, filters)
    return new Set([...matchIds, ...ancestorIds])
  }
  return computeExcludedIds(people, filters)
}
