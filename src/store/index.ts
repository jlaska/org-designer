import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { BaselineData } from '@/types/person'
import type { Overlay, OverlayAction } from '@/types/overlay'
import type { EffectiveState } from '@/types/org'
import { emptyOverlay } from '@/types/overlay'
import { applyOverlay } from '@/lib/overlay-engine'

function findOverlayLca(
  overlay: Overlay,
  people: Record<string, { managerUid: string | null }>,
): string | null {
  const touched = new Set<string>()
  for (const action of overlay.actions) {
    if (action.type === 'move') {
      touched.add(action.uid)
      if (action.fromManagerUid) touched.add(action.fromManagerUid)
      if (action.toManagerUid) touched.add(action.toManagerUid)
    } else if (action.type === 'edit_person' || action.type === 'delete_person') {
      touched.add(action.uid)
      if (action.type === 'delete_person' && action.reassignTo) touched.add(action.reassignTo)
    } else if (action.type === 'add_person') {
      if (action.person.managerUid) touched.add(action.person.managerUid)
    }
  }

  const baselineUids = [...touched].filter((uid) => uid in people)
  if (baselineUids.length === 0) return null

  const getChain = (uid: string): string[] => {
    const chain: string[] = []
    let cur: string | null = uid
    while (cur) {
      chain.unshift(cur)
      cur = people[cur]?.managerUid ?? null
    }
    return chain
  }

  const chains = baselineUids.map(getChain)
  const shortest = chains.reduce((a, b) => (a.length < b.length ? a : b))

  let lca: string | null = null
  for (let i = 0; i < shortest.length; i++) {
    const candidate = shortest[i]
    if (chains.every((c) => c[i] === candidate)) {
      lca = candidate
    } else {
      break
    }
  }
  return lca
}

export interface FilterState {
  geos: string[]
  countries: string[]
  jobRoles: string[]
  teams: string[]
  jobTitles: string[]
  peopleType: 'all' | 'managers' | 'ics'
  mode: 'highlight' | 'include' | 'exclude'
}

export interface CardFieldToggles {
  title: boolean
  location: boolean
  city: boolean
  hireDate: boolean
  tenure: boolean
  team: boolean
  reportCounts: boolean
}

export type CardDensity = 'compact' | 'default' | 'comfortable'
export type LayoutDirection = 'TB' | 'LR'
export type SortLayerBy =
  | 'none'
  | 'name'
  | 'jobRole'
  | 'jobTitle'
  | 'geo'
  | 'country'
  | 'managerStatus'

export interface ConfigState {
  cardFields: CardFieldToggles
  density: CardDensity
  direction: LayoutDirection
  snapToGrid: boolean
  sortLayerBy: SortLayerBy
}

export interface UIState {
  expandedNodes: Set<string>
  selectedNodeId: string | null
  selectedNodeIds: Set<string>
  pendingDeleteUids: string[] | null
  sidebarTab: 'metrics' | 'filters' | 'configure'
  viewRootUid: string | null // null = full org from baseline.rootUid
  hiddenPeersOf: Set<string> // uids whose siblings are hidden
  fitViewTarget: string | null // transient: OrgChart centers on this uid then clears it
  fitViewIntent: { ids: string[] } | { all: true } | null // transient: which nodes to fit after layout
  openMenuNodeId: string | null // which card's hamburger menu is open
}

export interface AppState {
  // Data
  baseline: BaselineData | null
  overlay: Overlay
  undoStack: OverlayAction[][]
  redoStack: OverlayAction[][]
  effectiveState: EffectiveState | null

  // UI
  ui: UIState
  filters: FilterState
  config: ConfigState

  // Scenarios
  currentScenarioName: string

  // Actions
  loadBaseline: () => Promise<void>
  loadScenario: (name: string) => Promise<void>
  loadScenarioFromJson: (scenario: { name?: string; overlay?: Overlay }) => void
  setScenarioName: (name: string) => void
  listScenarios: () => Promise<{ name: string; updatedAt: string }[]>

  pushAction: (action: OverlayAction) => void
  pushActions: (actions: OverlayAction[]) => void
  undo: () => void
  redo: () => void

  toggleExpanded: (nodeId: string) => void
  expandAll: () => void
  collapseAll: () => void
  setSelected: (nodeId: string | null, additive?: boolean) => void
  setSidebarTab: (tab: UIState['sidebarTab']) => void

  setFilters: (filters: Partial<FilterState>) => void
  clearFilters: () => void

  setConfig: (config: Partial<ConfigState>) => void
  setCardFields: (fields: Partial<CardFieldToggles>) => void

  setViewRoot: (uid: string | null) => void
  togglePeerVisibility: (uid: string) => void
  navigateToNode: (uid: string) => void
  clearFitViewTarget: () => void
  clearFitViewIntent: () => void
  setOpenMenu: (nodeId: string | null) => void

  requestDelete: (uids: string[]) => void
  confirmDelete: () => void
  cancelDelete: () => void
}

const defaultFilters: FilterState = {
  geos: [],
  countries: [],
  jobRoles: [],
  teams: [],
  jobTitles: [],
  peopleType: 'all',
  mode: 'highlight',
}

const defaultUI: UIState = {
  expandedNodes: new Set(),
  selectedNodeId: null,
  selectedNodeIds: new Set(),
  pendingDeleteUids: null,
  sidebarTab: 'metrics',
  viewRootUid: null,
  hiddenPeersOf: new Set(),
  fitViewTarget: null,
  fitViewIntent: null,
  openMenuNodeId: null,
}

const defaultConfig: ConfigState = {
  cardFields: {
    title: true,
    location: true,
    city: false,
    hireDate: false,
    tenure: false,
    team: false,
    reportCounts: true,
  },
  density: 'default',
  direction: 'TB',
  snapToGrid: true,
  sortLayerBy: 'none',
}

function computeEffective(baseline: BaselineData, overlay: Overlay): EffectiveState {
  return applyOverlay(baseline, overlay)
}

export const useAppStore = create<AppState>()(
  subscribeWithSelector((set, get) => ({
    baseline: null,
    overlay: emptyOverlay(),
    undoStack: [],
    redoStack: [],
    effectiveState: null,
    ui: defaultUI,
    filters: defaultFilters,
    config: defaultConfig,
    currentScenarioName: 'default',

    loadBaseline: async () => {
      const res = await fetch('/api/baseline')
      if (!res.ok) throw new Error('Failed to load baseline. Run: npm run import')
      const baseline: BaselineData = await res.json()
      const { overlay } = get()
      const effectiveState = computeEffective(baseline, overlay)
      const rootUid = baseline.rootUid
      set({
        baseline,
        effectiveState,
        ui: {
          ...defaultUI,
          expandedNodes: new Set([rootUid]),
        },
      })
    },

    loadScenario: async (name: string) => {
      const res = await fetch(`/api/scenarios/${encodeURIComponent(name)}`)
      if (!res.ok) throw new Error(`Scenario "${name}" not found`)
      const scenario = await res.json()
      const overlay: Overlay = scenario.overlay ?? emptyOverlay()
      const { baseline } = get()
      const effectiveState = baseline ? computeEffective(baseline, overlay) : null
      set({ overlay, effectiveState, currentScenarioName: name, undoStack: [], redoStack: [] })
    },

    loadScenarioFromJson: (scenario: { name?: string; overlay?: Overlay }) => {
      const overlay: Overlay = scenario.overlay ?? emptyOverlay()
      const { baseline } = get()
      const effectiveState = baseline ? computeEffective(baseline, overlay) : null
      const lcaUid = baseline ? findOverlayLca(overlay, baseline.people) : null
      set({
        overlay,
        effectiveState,
        currentScenarioName: scenario.name ?? 'imported',
        undoStack: [],
        redoStack: [],
      })
      if (lcaUid) get().navigateToNode(lcaUid)
    },

    setScenarioName: (name: string) => {
      set({ currentScenarioName: name })
    },

    listScenarios: async () => {
      try {
        const res = await fetch('/api/scenarios')
        if (!res.ok) return []
        return (await res.json()) as { name: string; updatedAt: string }[]
      } catch {
        return []
      }
    },

    pushAction: (action: OverlayAction) => {
      const { overlay, baseline, undoStack } = get()
      const newActions = [...overlay.actions, action]
      const newOverlay: Overlay = { actions: newActions }
      const effectiveState = baseline ? computeEffective(baseline, newOverlay) : null
      set({
        overlay: newOverlay,
        effectiveState,
        undoStack: [...undoStack, [action]],
        redoStack: [],
      })
    },

    pushActions: (actions: OverlayAction[]) => {
      if (actions.length === 0) return
      const { overlay, baseline, undoStack } = get()
      const newActions = [...overlay.actions, ...actions]
      const newOverlay: Overlay = { actions: newActions }
      const effectiveState = baseline ? computeEffective(baseline, newOverlay) : null
      set({
        overlay: newOverlay,
        effectiveState,
        undoStack: [...undoStack, actions],
        redoStack: [],
      })
    },

    undo: () => {
      const { overlay, baseline, undoStack, redoStack } = get()
      if (undoStack.length === 0) return
      const lastGroup = undoStack[undoStack.length - 1]
      const newActions = overlay.actions.slice(0, overlay.actions.length - lastGroup.length)
      const newOverlay: Overlay = { actions: newActions }
      const effectiveState = baseline ? computeEffective(baseline, newOverlay) : null
      set({
        overlay: newOverlay,
        effectiveState,
        undoStack: undoStack.slice(0, -1),
        redoStack: [lastGroup, ...redoStack],
      })
    },

    redo: () => {
      const { overlay, baseline, undoStack, redoStack } = get()
      if (redoStack.length === 0) return
      const nextGroup = redoStack[0]
      const newActions = [...overlay.actions, ...nextGroup]
      const newOverlay: Overlay = { actions: newActions }
      const effectiveState = baseline ? computeEffective(baseline, newOverlay) : null
      set({
        overlay: newOverlay,
        effectiveState,
        undoStack: [...undoStack, nextGroup],
        redoStack: redoStack.slice(1),
      })
    },

    toggleExpanded: (nodeId: string) => {
      const { ui, effectiveState } = get()
      const next = new Set(ui.expandedNodes)
      const isExpanding = !next.has(nodeId)
      if (isExpanding) {
        next.add(nodeId)
      } else {
        next.delete(nodeId)
      }
      // On expand: fit parent + children; on collapse: fit the parent alone
      let intent: { ids: string[] }
      if (isExpanding) {
        const children = Object.values(effectiveState?.people ?? {})
          .filter((p) => p.managerUid === nodeId)
          .map((p) => p.uid)
        intent = { ids: [nodeId, ...children] }
      } else {
        // Collapse: zoom out to show the node, all its peers, and their shared parent
        const managerUid = effectiveState?.people[nodeId]?.managerUid ?? null
        const siblings = managerUid
          ? Object.values(effectiveState?.people ?? {})
              .filter((p) => p.managerUid === managerUid)
              .map((p) => p.uid)
          : [nodeId]
        intent = { ids: managerUid ? [...siblings, managerUid] : siblings }
      }
      set({ ui: { ...ui, expandedNodes: next, fitViewIntent: intent } })
    },

    expandAll: () => {
      const { ui, effectiveState } = get()
      if (!effectiveState) return
      set({
        ui: {
          ...ui,
          expandedNodes: new Set(Object.keys(effectiveState.people)),
          fitViewIntent: { all: true },
        },
      })
    },

    collapseAll: () => {
      const { ui, baseline } = get()
      const root = ui.viewRootUid ?? baseline?.rootUid ?? ''
      set({
        ui: {
          ...ui,
          expandedNodes: new Set(root ? [root] : []),
          fitViewIntent: root ? { ids: [root] } : { all: true },
        },
      })
    },

    setSelected: (nodeId: string | null, additive?: boolean) => {
      const { ui } = get()
      if (nodeId === null) {
        set({ ui: { ...ui, selectedNodeId: null, selectedNodeIds: new Set() } })
        return
      }
      if (additive) {
        const next = new Set(ui.selectedNodeIds)
        if (next.has(nodeId)) {
          next.delete(nodeId)
        } else {
          next.add(nodeId)
        }
        set({ ui: { ...ui, selectedNodeId: nodeId, selectedNodeIds: next } })
      } else {
        set({ ui: { ...ui, selectedNodeId: nodeId, selectedNodeIds: new Set([nodeId]) } })
      }
    },

    setSidebarTab: (tab: UIState['sidebarTab']) => {
      const { ui } = get()
      set({ ui: { ...ui, sidebarTab: tab } })
    },

    setFilters: (filters: Partial<FilterState>) => {
      set((state) => ({ filters: { ...state.filters, ...filters } }))
    },

    clearFilters: () => set({ filters: defaultFilters }),

    setConfig: (config: Partial<ConfigState>) => {
      set((state) => ({ config: { ...state.config, ...config } }))
    },

    setCardFields: (fields: Partial<CardFieldToggles>) => {
      set((state) => ({
        config: {
          ...state.config,
          cardFields: { ...state.config.cardFields, ...fields },
        },
      }))
    },

    setViewRoot: (uid: string | null) => {
      const { ui } = get()
      if (uid === null) {
        set({ ui: { ...ui, viewRootUid: null, hiddenPeersOf: new Set() } })
        return
      }
      set({ ui: { ...ui, viewRootUid: uid } })
    },

    togglePeerVisibility: (uid: string) => {
      const { ui, effectiveState } = get()
      const next = new Set(ui.hiddenPeersOf)
      const isHiding = !next.has(uid)
      if (isHiding) next.add(uid)
      else next.delete(uid)
      const managerUid = effectiveState?.people[uid]?.managerUid ?? null
      const allSiblings = managerUid
        ? Object.values(effectiveState?.people ?? {})
            .filter((p) => p.managerUid === managerUid)
            .map((p) => p.uid)
        : [uid]
      // Hide peers: fit focal node + parent (peers gone, show parent-child context)
      // Show peers: fit focal node + all siblings
      const intentIds = isHiding ? (managerUid ? [uid, managerUid] : [uid]) : allSiblings
      set({ ui: { ...ui, hiddenPeersOf: next, fitViewIntent: { ids: intentIds } } })
    },

    navigateToNode: (uid: string) => {
      const { ui, effectiveState, baseline } = get()
      if (!effectiveState || !baseline) return

      const people = effectiveState.people
      if (!people[uid]) return

      // Build ancestor chain bottom-up: [direct-parent, grandparent, ..., root]
      const ancestors: string[] = []
      let cur: string | null = people[uid]?.managerUid ?? null
      while (cur) {
        ancestors.push(cur)
        cur = people[cur]?.managerUid ?? null
      }

      // Expand all ancestors so the path is traversable, plus target for its direct reports
      const expanded = new Set(ui.expandedNodes)
      for (const a of ancestors) expanded.add(a)
      expanded.add(uid)

      // For each ancestor, hide its siblings so only the branch toward target is shown.
      // This prevents CEO/CEO-1/CEO-2/etc. from fanning out all their reports.
      // The target itself is NOT added here, so its peers remain visible.
      const hiddenPeersOf = new Set(ancestors)

      set({
        ui: {
          ...ui,
          viewRootUid: null,
          hiddenPeersOf,
          expandedNodes: expanded,
          selectedNodeId: uid,
          selectedNodeIds: new Set([uid]),
          fitViewTarget: uid,
        },
      })
    },

    clearFitViewTarget: () => {
      const { ui } = get()
      set({ ui: { ...ui, fitViewTarget: null } })
    },

    clearFitViewIntent: () => {
      const { ui } = get()
      set({ ui: { ...ui, fitViewIntent: null } })
    },

    setOpenMenu: (nodeId: string | null) => {
      const { ui } = get()
      set({ ui: { ...ui, openMenuNodeId: nodeId } })
    },

    requestDelete: (uids: string[]) => {
      const { ui, effectiveState } = get()
      // Filter out root (managerUid === null) — root cannot be deleted
      const deletable = uids.filter((uid) => {
        const p = effectiveState?.people[uid]
        return p && p.managerUid !== null
      })
      if (deletable.length === 0) return
      set({ ui: { ...ui, pendingDeleteUids: deletable } })
    },

    confirmDelete: () => {
      const { ui, effectiveState } = get()
      const uids = ui.pendingDeleteUids
      if (!uids || !effectiveState) return
      const timestamp = new Date().toISOString()
      const actions: OverlayAction[] = uids.map((uid) => ({
        type: 'delete_person' as const,
        uid,
        reassignTo: effectiveState.people[uid]?.managerUid ?? null,
        timestamp,
      }))
      set({
        ui: { ...ui, pendingDeleteUids: null, selectedNodeId: null, selectedNodeIds: new Set() },
      })
      get().pushActions(actions)
    },

    cancelDelete: () => {
      const { ui } = get()
      set({ ui: { ...ui, pendingDeleteUids: null } })
    },
  })),
)
