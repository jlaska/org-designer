import type { PersonRecord } from '@/types/person'

const PALETTE = [
  '#6366f1',
  '#0891b2',
  '#059669',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#0284c7',
  '#65a30d',
  '#db2777',
  '#ea580c',
  '#0066CC',
  '#5C940D',
  '#E67700',
  '#862E9C',
  '#D63384',
  '#E03131',
  '#1098AD',
]

/** Legacy LDAP role names — kept for demo data and backwards compatibility */
const LEGACY_ROLE_COLORS: Record<string, string> = {
  Engineering: '#0066CC',
  'Quality Engineering': '#5C940D',
  'Program/Project Management': '#E67700',
  'Senior Leadership': '#862E9C',
  'Site Reliability Engineering': '#D63384',
  'Product Security': '#E03131',
  'Product Management': '#1098AD',
}

export const DEFAULT_ROLE_COLOR = '#868E96'

function hashRole(role: string): number {
  let h = 0
  for (let i = 0; i < role.length; i++) {
    h = (h * 31 + role.charCodeAt(i)) >>> 0
  }
  return h
}

export function roleColor(jobRole: string): string {
  const role = jobRole.trim()
  if (!role || role === 'Unknown') return DEFAULT_ROLE_COLOR
  if (LEGACY_ROLE_COLORS[role]) return LEGACY_ROLE_COLORS[role]
  return PALETTE[hashRole(role) % PALETTE.length]
}

export function uniqueJobRoles(people: Iterable<PersonRecord>): string[] {
  const roles = new Set<string>()
  for (const p of people) {
    roles.add(p.jobRole?.trim() || 'Unknown')
  }
  return [...roles].sort((a, b) => {
    if (a === 'Unknown') return 1
    if (b === 'Unknown') return -1
    return a.localeCompare(b)
  })
}

export function roleLabelsFromPeople(
  people: Iterable<PersonRecord>,
): Array<{ role: string; color: string }> {
  return uniqueJobRoles(people).map((role) => ({ role, color: roleColor(role) }))
}
