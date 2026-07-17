import { describe, it, expect } from 'vitest'
import {
  computeLayout,
  computeNodeHeight,
  getNodeDims,
  getVisiblePersonIds,
  NODE_WIDTH,
  NODE_HEIGHT_BASE,
} from '@/lib/layout-engine'
import { applyOverlay } from '@/lib/overlay-engine'
import { makeBaseline } from '@/test/fixtures'
import { emptyOverlay } from '@/types/overlay'
import type { EffectiveState } from '@/types/org'
import type { PersonRecord } from '@/types/person'
import type { ConfigState } from '@/store'

const FIELD_ROW_HEIGHT = 18 // text-xs (16px) + mt-0.5 (2px)
import type { CardFieldToggles } from '@/store'

const allOff: CardFieldToggles = {
  title: false,
  jobRole: false,
  location: false,
  city: false,
  hireDate: false,
  tenure: false,
  team: false,
  reportCounts: false,
}

const allOn: CardFieldToggles = {
  title: true,
  jobRole: true,
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

  it('returns max height when all 8 fields are on', () => {
    expect(computeNodeHeight(allOn)).toBe(NODE_HEIGHT_BASE + 8 * FIELD_ROW_HEIGHT)
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
        sortLayerBy: 'none' as const,
        maxChildrenPerRow: 0 as const,
      }).w,
    ).toBe(NODE_WIDTH)
  })

  it('height matches computeNodeHeight for same config', () => {
    const config = {
      cardFields: allOn,
      density: 'compact' as const,
      direction: 'TB' as const,
      snapToGrid: true,
      sortLayerBy: 'none' as const,
      maxChildrenPerRow: 0 as const,
    }
    expect(getNodeDims(config).h).toBe(computeNodeHeight(allOn))
  })
})

describe('getVisiblePersonIds', () => {
  it('returns only root when subtree is collapsed', () => {
    const baseline = makeBaseline()
    const state = applyOverlay(baseline, emptyOverlay())
    const visible = getVisiblePersonIds(state, new Set(), 'ceo')
    expect([...visible]).toEqual(['ceo'])
  })

  it('includes expanded descendants only', () => {
    const baseline = makeBaseline()
    const state = applyOverlay(baseline, emptyOverlay())
    const expanded = new Set(['ceo', 'vp1'])
    const visible = getVisiblePersonIds(state, expanded, 'ceo')
    expect([...visible].sort()).toEqual(['ceo', 'vp1', 'vp2', 'mgr1', 'ic1'].sort())
  })

  it('excludes collapsed branches below expanded root', () => {
    const baseline = makeBaseline()
    const state = applyOverlay(baseline, emptyOverlay())
    const visible = getVisiblePersonIds(state, new Set(['ceo']), 'ceo')
    expect([...visible].sort()).toEqual(['ceo', 'vp1', 'vp2'].sort())
    expect(visible.has('mgr1')).toBe(false)
  })
})

function makePerson(overrides: Partial<PersonRecord> & { uid: string; cn: string }): PersonRecord {
  return {
    displayName: overrides.cn,
    preferredLastName: '',
    jobTitle: '',
    jobRole: '',
    geo: '',
    co: '',
    l: '',
    location: '',
    hireDate: '',
    workerId: '',
    costCenter: '',
    costCenterDesc: '',
    managerUid: null,
    directReports: 0,
    totalReports: 0,
    teamId: null,
    yamlRoles: [],
    ...overrides,
  }
}

describe('computeLayout sortLayerBy', () => {
  const boss = makePerson({ uid: 'boss', cn: 'Boss', directReports: 3 })
  const childC = makePerson({ uid: 'c', cn: 'Charlie', managerUid: 'boss' })
  const childA = makePerson({ uid: 'a', cn: 'Alice', managerUid: 'boss' })
  const childB = makePerson({ uid: 'b', cn: 'Bob', managerUid: 'boss' })

  const state: EffectiveState = {
    people: { boss, c: childC, a: childA, b: childB },
    teams: {},
    hierarchy: { boss: null, c: 'boss', a: 'boss', b: 'boss' },
    scopeNodes: {},
    scopeAssignments: {},
  }

  const expanded = new Set(['boss'])

  const baseConfig: ConfigState = {
    cardFields: allOff,
    density: 'default',
    direction: 'TB',
    snapToGrid: false,
    sortLayerBy: 'none',
    maxChildrenPerRow: 0,
  }

  it('sorts siblings by name when sortLayerBy is "name"', () => {
    const config: ConfigState = { ...baseConfig, sortLayerBy: 'name' }
    const { nodes } = computeLayout(state, expanded, 'boss', config)

    const children = nodes
      .filter((n) => n.id !== 'boss')
      .sort((a, b) => a.position.x - b.position.x)

    expect(children.map((n) => n.id)).toEqual(['a', 'b', 'c'])
  })

  it('preserves dagre order when sortLayerBy is "none"', () => {
    const sortedResult = computeLayout(state, expanded, 'boss', {
      ...baseConfig,
      sortLayerBy: 'name',
    })
    const defaultResult = computeLayout(state, expanded, 'boss', baseConfig)

    const sortedOrder = sortedResult.nodes
      .filter((n) => n.id !== 'boss')
      .sort((a, b) => a.position.x - b.position.x)
      .map((n) => n.id)

    const defaultOrder = defaultResult.nodes
      .filter((n) => n.id !== 'boss')
      .sort((a, b) => a.position.x - b.position.x)
      .map((n) => n.id)

    expect(sortedOrder).toEqual(['a', 'b', 'c'])
    expect(defaultOrder).not.toEqual(sortedOrder)
  })
})

describe('computeLayout maxChildrenPerRow', () => {
  const boss = makePerson({ uid: 'boss', cn: 'Boss', directReports: 5 })
  const c1 = makePerson({ uid: 'c1', cn: 'Alice', managerUid: 'boss' })
  const c2 = makePerson({ uid: 'c2', cn: 'Bob', managerUid: 'boss' })
  const c3 = makePerson({ uid: 'c3', cn: 'Charlie', managerUid: 'boss' })
  const c4 = makePerson({ uid: 'c4', cn: 'Diana', managerUid: 'boss' })
  const c5 = makePerson({ uid: 'c5', cn: 'Eve', managerUid: 'boss' })

  const state: EffectiveState = {
    people: { boss, c1, c2, c3, c4, c5 },
    teams: {},
    hierarchy: { boss: null, c1: 'boss', c2: 'boss', c3: 'boss', c4: 'boss', c5: 'boss' },
    scopeNodes: {},
    scopeAssignments: {},
  }

  const expanded = new Set(['boss'])

  const baseConfig: ConfigState = {
    cardFields: allOff,
    density: 'default',
    direction: 'TB',
    snapToGrid: false,
    sortLayerBy: 'none',
    maxChildrenPerRow: 0,
  }

  it('wraps children into rows: 5 children with maxPerRow=4 gives 4+1', () => {
    const config: ConfigState = { ...baseConfig, maxChildrenPerRow: 4 }
    const { nodes } = computeLayout(state, expanded, 'boss', config)

    const children = nodes.filter((n) => n.id !== 'boss')
    const yValues = [...new Set(children.map((n) => n.position.y))].sort((a, b) => a - b)

    expect(yValues).toHaveLength(2)

    const row0 = children.filter((n) => n.position.y === yValues[0])
    const row1 = children.filter((n) => n.position.y === yValues[1])
    expect(row0).toHaveLength(4)
    expect(row1).toHaveLength(1)
  })

  it('spaces rows by rankStep in TB direction', () => {
    const config: ConfigState = { ...baseConfig, maxChildrenPerRow: 4 }
    const { nodes } = computeLayout(state, expanded, 'boss', config)

    const children = nodes.filter((n) => n.id !== 'boss')
    const yValues = [...new Set(children.map((n) => n.position.y))].sort((a, b) => a - b)
    const nodeHeight = computeNodeHeight(allOff)
    const rankGap = 36 // DENSITY_RANKSEP['default']
    const rankStep = nodeHeight + rankGap

    expect(yValues[1] - yValues[0]).toBe(rankStep)
  })

  it('pushes subtrees below the last grid row to prevent overlap', () => {
    const grandchild = makePerson({ uid: 'gc', cn: 'Frank', managerUid: 'c1' })
    const stateWithGc: EffectiveState = {
      ...state,
      people: { ...state.people, c1: { ...c1, directReports: 1 }, gc: grandchild },
      hierarchy: { ...state.hierarchy, gc: 'c1' },
    }
    const expandedWithC1 = new Set(['boss', 'c1'])
    const config: ConfigState = { ...baseConfig, maxChildrenPerRow: 4 }
    const { nodes } = computeLayout(stateWithGc, expandedWithC1, 'boss', config)

    const children = nodes.filter((n) => ['c1', 'c2', 'c3', 'c4', 'c5'].includes(n.id))
    const lastRowY = Math.max(...children.map((n) => n.position.y))
    const gcNode = nodes.find((n) => n.id === 'gc')!

    expect(gcNode.position.y).toBeGreaterThan(lastRowY)
  })

  it('works in LR direction', () => {
    const config: ConfigState = { ...baseConfig, direction: 'LR', maxChildrenPerRow: 4 }
    const { nodes } = computeLayout(state, expanded, 'boss', config)

    const children = nodes.filter((n) => n.id !== 'boss')
    const xValues = [...new Set(children.map((n) => n.position.x))].sort((a, b) => a - b)

    expect(xValues).toHaveLength(2)

    const col0 = children.filter((n) => n.position.x === xValues[0])
    const col1 = children.filter((n) => n.position.x === xValues[1])
    expect(col0).toHaveLength(4)
    expect(col1).toHaveLength(1)
  })
})
