import dagre from '@dagrejs/dagre'
import type { Node, Edge } from '@xyflow/react'
import type { EffectiveState } from '@/types/org'
import type { ConfigState, CardDensity } from '@/store'

export const NODE_WIDTH = 220
export const NODE_HEIGHT_BASE = 36 // pt-2(8) + text-sm leading-tight(18) + pb-2(8) + border(2)
export const NODE_HEIGHT = 90 // default height (title + location + reportCounts on)
export const SCOPE_WIDTH = 200
export const SCOPE_HEIGHT = 60

// Density controls spacing between cards — same gap applied in both directions
// Minimum safe gap is 12px: the expand button sits 12px below the card bottom (z-10, doesn't block)
const DENSITY_GAP: Record<CardDensity, number> = {
  compact: 12,
  default: 36,
  comfortable: 60,
}

// ranksep (spacing between hierarchy levels) can be larger than nodesep (peer spacing)
const DENSITY_RANKSEP: Record<CardDensity, number> = {
  compact: 36,
  default: 36,
  comfortable: 60,
}

// Each optional field row is text-xs (16px line-height) + mt-0.5 (2px) = 18px
const FIELD_ROW_HEIGHT = 18

export function computeNodeHeight(
  cardFields?: ConfigState['cardFields'],
  hasAnyTeam = true,
): number {
  if (!cardFields) return NODE_HEIGHT
  const fieldCount = [
    cardFields.title,
    cardFields.location,
    cardFields.city,
    cardFields.hireDate,
    cardFields.tenure,
    cardFields.team && hasAnyTeam,
    cardFields.reportCounts,
  ].filter(Boolean).length
  return NODE_HEIGHT_BASE + fieldCount * FIELD_ROW_HEIGHT
}

export function getNodeDims(config?: ConfigState, hasAnyTeam = true) {
  return { w: NODE_WIDTH, h: computeNodeHeight(config?.cardFields, hasAnyTeam) }
}

export interface OrgTreeNode {
  id: string
  type: 'person' | 'scope'
  parentId: string | null
  data: Record<string, unknown>
}

export function computeLayout(
  state: EffectiveState,
  expandedNodes: Set<string>,
  rootUid: string,
  config?: ConfigState,
  hiddenPeersOf: Set<string> = new Set(),
  filterVisibleIds?: Set<string>,
): { nodes: Node[]; edges: Edge[] } {
  const density = config?.density ?? 'default'
  const direction = config?.direction ?? 'TB'
  const cardFields = config?.cardFields
  const hasAnyTeam = Object.values(state.people).some((p) => !!p.teamId)
  const nodeHeight = computeNodeHeight(cardFields, hasAnyTeam)

  const gap = DENSITY_GAP[density]
  const rankGap = DENSITY_RANKSEP[density]

  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: direction, nodesep: gap, ranksep: rankGap, marginx: 20, marginy: 20 })
  g.setDefaultEdgeLabel(() => ({}))

  const visiblePersonIds = new Set<string>()
  const visibleScopeIds = new Set<string>()

  // BFS: only include children of expanded nodes
  const queue: string[] = [rootUid]
  visiblePersonIds.add(rootUid)

  while (queue.length > 0) {
    const uid = queue.shift()!
    if (!expandedNodes.has(uid)) continue

    // Collect children; if any child has "hide peers" active, show only that child
    const children = Object.entries(state.people).filter(([, p]) => p.managerUid === uid)
    if (config?.groupManagersFirst) {
      children.sort(([, a], [, b]) => (b.directReports > 0 ? 1 : 0) - (a.directReports > 0 ? 1 : 0))
    }
    const focusedChild = children.find(([childUid]) => hiddenPeersOf.has(childUid))
    const visibleChildren = focusedChild ? [focusedChild] : children
    for (const [childUid] of visibleChildren) {
      if (filterVisibleIds && !filterVisibleIds.has(childUid)) continue
      if (!visiblePersonIds.has(childUid)) {
        visiblePersonIds.add(childUid)
        queue.push(childUid)
      }
    }

    for (const [scopeId, scope] of Object.entries(state.scopeNodes)) {
      if (scope.managerUid === uid) {
        visibleScopeIds.add(scopeId)
      }
    }
  }

  // Pre-compute member counts per team (people whose teamId matches)
  const teamMemberCounts: Record<string, number> = {}
  for (const person of Object.values(state.people)) {
    if (person.teamId) teamMemberCounts[person.teamId] = (teamMemberCounts[person.teamId] ?? 0) + 1
  }

  // Add nodes to dagre graph — width fixed, height reflects active fields
  for (const uid of visiblePersonIds) {
    const person = state.people[uid]
    if (!person) continue
    const isManager = person.directReports > 0
    const teamName = person.teamId ? (state.teams[person.teamId]?.name ?? person.teamId) : null
    g.setNode(uid, {
      width: NODE_WIDTH,
      height: nodeHeight,
      data: { ...person, isManager, teamName },
    })
  }

  for (const scopeId of visibleScopeIds) {
    const scope = state.scopeNodes[scopeId]
    if (!scope) continue
    g.setNode(`scope:${scopeId}`, {
      width: SCOPE_WIDTH,
      height: SCOPE_HEIGHT,
      data: { ...scope, memberCount: teamMemberCounts[scopeId] ?? 0 },
    })
  }

  // Add edges
  for (const uid of visiblePersonIds) {
    const person = state.people[uid]
    if (person.managerUid && visiblePersonIds.has(person.managerUid)) {
      g.setEdge(person.managerUid, uid)
    }
  }

  for (const scopeId of visibleScopeIds) {
    const scope = state.scopeNodes[scopeId]
    if (scope.managerUid && visiblePersonIds.has(scope.managerUid)) {
      g.setEdge(scope.managerUid, `scope:${scopeId}`)
    }
  }

  dagre.layout(g)

  const nodes: Node[] = []
  const edges: Edge[] = []

  for (const uid of visiblePersonIds) {
    const n = g.node(uid)
    if (!n) continue
    const person = state.people[uid]
    const hasChildren =
      Object.values(state.people).some((p) => p.managerUid === uid) ||
      Object.values(state.scopeNodes).some((s) => s.managerUid === uid)
    const teamName = person.teamId ? (state.teams[person.teamId]?.name ?? person.teamId) : null

    nodes.push({
      id: uid,
      type: person.directReports > 0 ? 'manager' : 'person',
      position: { x: n.x - NODE_WIDTH / 2, y: n.y - nodeHeight / 2 },
      style: { transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)' },
      data: {
        ...person,
        teamName,
        isManager: person.directReports > 0,
        hasChildren,
        isExpanded: expandedNodes.has(uid),
        cardFields,
        direction,
        hiddenPeersOf,
      },
    })
  }

  for (const scopeId of visibleScopeIds) {
    const n = g.node(`scope:${scopeId}`)
    if (!n) continue
    const scope = state.scopeNodes[scopeId]
    nodes.push({
      id: `scope:${scopeId}`,
      type: 'scope',
      position: { x: n.x - SCOPE_WIDTH / 2, y: n.y - SCOPE_HEIGHT / 2 },
      data: { ...scope },
    })
  }

  for (const e of g.edges()) {
    edges.push({
      id: `${e.v}->${e.w}`,
      source: e.v,
      target: e.w,
      type: 'orgchart',
      data: { direction },
      style: { stroke: '#94a3b8', strokeWidth: 1.5 },
    })
  }

  return { nodes, edges }
}
