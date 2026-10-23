import { describe, it, expect } from 'vitest'
import { sanitizeName } from '../sanitize'

describe('sanitizeName', () => {
  it('preserves spaces in scenario names', () => {
    expect(sanitizeName('2026-10-30 - Fleet Engineering')).toBe('2026-10-30 - Fleet Engineering')
  })

  it('preserves hyphens, underscores, and alphanumeric', () => {
    expect(sanitizeName('my_scenario-v2')).toBe('my_scenario-v2')
  })

  it('strips path traversal characters', () => {
    expect(sanitizeName('../../../etc/passwd')).toBe('---------etc-passwd')
  })

  it('truncates to 100 characters', () => {
    const long = 'a'.repeat(150)
    expect(sanitizeName(long)).toHaveLength(100)
  })
})
