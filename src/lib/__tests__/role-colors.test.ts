import { describe, it, expect } from 'vitest'
import { roleColor, uniqueJobRoles, roleLabelsFromPeople } from '@/lib/role-colors'
import { makePerson } from '@/test/fixtures'

describe('roleColor', () => {
  it('returns deterministic colors for arbitrary role names', () => {
    expect(roleColor('Hybrid Platforms')).toBe(roleColor('Hybrid Platforms'))
    expect(roleColor('Hybrid Platforms')).not.toBe(roleColor('RHEL Platforms'))
  })

  it('returns default color for empty or Unknown', () => {
    expect(roleColor('')).toBe('#868E96')
    expect(roleColor('Unknown')).toBe('#868E96')
  })

  it('keeps legacy LDAP role colors', () => {
    expect(roleColor('Engineering')).toBe('#0066CC')
  })
})

describe('uniqueJobRoles', () => {
  it('collects sorted unique roles from people', () => {
    const people = [
      makePerson({ jobRole: 'Beta' }),
      makePerson({ uid: 'b', jobRole: 'Alpha' }),
      makePerson({ uid: 'c', jobRole: 'Beta' }),
    ]
    expect(uniqueJobRoles(people)).toEqual(['Alpha', 'Beta'])
  })
})

describe('roleLabelsFromPeople', () => {
  it('pairs each role with its color', () => {
    const labels = roleLabelsFromPeople([makePerson({ jobRole: 'Hybrid Platforms' })])
    expect(labels).toEqual([{ role: 'Hybrid Platforms', color: roleColor('Hybrid Platforms') }])
  })
})
