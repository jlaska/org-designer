import { describe, it, expect } from 'vitest'
import { computeNodeHeight, getNodeDims, NODE_WIDTH, NODE_HEIGHT_BASE } from '@/lib/layout-engine'

const FIELD_ROW_HEIGHT = 18 // text-xs (16px) + mt-0.5 (2px)
import type { CardFieldToggles } from '@/store'

const allOff: CardFieldToggles = {
  title: false,
  location: false,
  city: false,
  hireDate: false,
  tenure: false,
  team: false,
  reportCounts: false,
}

const allOn: CardFieldToggles = {
  title: true,
  location: true,
  city: true,
  hireDate: true,
  tenure: true,
  team: true,
  reportCounts: true,
}

describe('computeNodeHeight', () => {
  it('returns NODE_HEIGHT_BASE when no fields enabled', () => {
    expect(computeNodeHeight(allOff)).toBe(NODE_HEIGHT_BASE)
  })

  it('adds FIELD_ROW_HEIGHT per enabled field', () => {
    const oneField: CardFieldToggles = { ...allOff, title: true }
    expect(computeNodeHeight(oneField)).toBe(NODE_HEIGHT_BASE + FIELD_ROW_HEIGHT)
  })

  it('is additive across multiple enabled fields', () => {
    const threeFields: CardFieldToggles = {
      ...allOff,
      title: true,
      location: true,
      reportCounts: true,
    }
    expect(computeNodeHeight(threeFields)).toBe(NODE_HEIGHT_BASE + 3 * FIELD_ROW_HEIGHT)
  })

  it('returns max height when all 7 fields are on', () => {
    expect(computeNodeHeight(allOn)).toBe(NODE_HEIGHT_BASE + 7 * FIELD_ROW_HEIGHT)
  })

  it('returns default height when cardFields is undefined', () => {
    // Default export NODE_HEIGHT = NODE_HEIGHT_BASE + default visible fields
    const height = computeNodeHeight(undefined)
    expect(typeof height).toBe('number')
    expect(height).toBeGreaterThanOrEqual(NODE_HEIGHT_BASE)
  })
})

describe('getNodeDims', () => {
  it('always returns NODE_WIDTH', () => {
    expect(getNodeDims().w).toBe(NODE_WIDTH)
    expect(
      getNodeDims({
        cardFields: allOn,
        density: 'compact',
        direction: 'TB',
        snapToGrid: true,
        groupManagersFirst: false,
      }).w,
    ).toBe(NODE_WIDTH)
  })

  it('height matches computeNodeHeight for same config', () => {
    const config = {
      cardFields: allOn,
      density: 'compact' as const,
      direction: 'TB' as const,
      snapToGrid: true,
      groupManagersFirst: false,
    }
    expect(getNodeDims(config).h).toBe(computeNodeHeight(allOn))
  })
})
