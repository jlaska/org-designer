import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  ControlButton,
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  type NodeTypes,
  type EdgeTypes,
  type Node,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { PersonNode } from './PersonNode'
import { ScopeNode } from './ScopeNode'
import { OrgChartEdge } from './OrgChartEdge'
import { DeleteConfirmDialog } from '@/components/dialogs/DeleteConfirmDialog'
import { useAppStore } from '@/store'
import { computeLayout, getNodeDims } from '@/lib/layout-engine'
import { computeFilterVisibleIds, computeFilteredIds, hasActiveFilters } from '@/lib/filter-utils'
import { getSubtreeIds } from '@/lib/hierarchy-utils'
import type { MoveAction } from '@/types/overlay'
import { ScanSearch } from 'lucide-react'

const NAV_KEYS: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  ArrowUp: 'up',
  k: 'up',
  ArrowDown: 'down',
  j: 'down',
  ArrowLeft: 'left',
  h: 'left',
  ArrowRight: 'right',
  l: 'right',
}

const nodeTypes: NodeTypes = {
  person: PersonNode as never,
  manager: PersonNode as never,
  scope: ScopeNode as never,
}

const edgeTypes: EdgeTypes = {
  orgchart: OrgChartEdge as never,
}

function OrgChartInner() {
  const { fitView, getNodes } = useReactFlow()
  const effectiveState = useAppStore((s) => s.effectiveState)
  const baseline = useAppStore((s) => s.baseline)
  const ui = useAppStore((s) => s.ui)
  const filters = useAppStore((s) => s.filters)
  const config = useAppStore((s) => s.config)
  const setSelected = useAppStore((s) => s.setSelected)
  const pushAction = useAppStore((s) => s.pushAction)
  const pushActions = useAppStore((s) => s.pushActions)
  const selectedNodeId = useAppStore((s) => s.ui.selectedNodeId)
  const selectedNodeIds = useAppStore((s) => s.ui.selectedNodeIds)
  const pendingDeleteUids = useAppStore((s) => s.ui.pendingDeleteUids)
  const requestDelete = useAppStore((s) => s.requestDelete)
  const confirmDelete = useAppStore((s) => s.confirmDelete)
  const cancelDelete = useAppStore((s) => s.cancelDelete)
  const fitViewTarget = useAppStore((s) => s.ui.fitViewTarget)
  const clearFitViewTarget = useAppStore((s) => s.clearFitViewTarget)
  const fitViewIntent = useAppStore((s) => s.ui.fitViewIntent)
  const clearFitViewIntent = useAppStore((s) => s.clearFitViewIntent)
  const setOpenMenu = useAppStore((s) => s.setOpenMenu)

  const shiftRef = useRef(false)
  const draggingRef = useRef<{ id: string; originalManagerUid: string | null } | null>(null)

  const selectedNodeIdsRef = useRef(selectedNodeIds)
  useEffect(() => {
    selectedNodeIdsRef.current = selectedNodeIds
  }, [selectedNodeIds])

  const selectedNodeIdRef = useRef(selectedNodeId)
  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId
  }, [selectedNodeId])

  const pendingDeleteRef = useRef(pendingDeleteUids)
  useEffect(() => {
    pendingDeleteRef.current = pendingDeleteUids
  }, [pendingDeleteUids])

  const navigateByKey = useCallback(
    (direction: 'up' | 'down' | 'left' | 'right') => {
      const currentId = selectedNodeIdRef.current
      if (!currentId) return
      const all = getNodes().filter((n) => !n.id.startsWith('scope:'))
      const current = all.find((n) => n.id === currentId)
      if (!current) return
      const hasAnyTeam = Object.values(effectiveState?.people ?? {}).some((p) => !!p.teamId)
      const { w, h } = getNodeDims(config, hasAnyTeam)
      const cx = current.position.x + w / 2
      const cy = current.position.y + h / 2

      // Left/right stays within the same sibling group (same managerUid)
      const selectedManagerUid = effectiveState?.people[currentId]?.managerUid ?? null
      const candidates =
        direction === 'left' || direction === 'right'
          ? all.filter(
              (n) =>
                n.id !== currentId &&
                (effectiveState?.people[n.id]?.managerUid ?? null) === selectedManagerUid,
            )
          : all.filter((n) => n.id !== currentId)

      let best: { id: string; score: number } | null = null
      for (const node of candidates) {
        const nx = node.position.x + w / 2
        const ny = node.position.y + h / 2
        let primaryDelta: number
        let crossDelta: number
        if (direction === 'up') {
          if (ny >= cy) continue
          primaryDelta = cy - ny
          crossDelta = Math.abs(cx - nx)
        } else if (direction === 'down') {
          if (ny <= cy) continue
          primaryDelta = ny - cy
          crossDelta = Math.abs(cx - nx)
        } else if (direction === 'left') {
          if (nx >= cx) continue
          primaryDelta = cx - nx
          crossDelta = Math.abs(cy - ny)
        } else {
          if (nx <= cx) continue
          primaryDelta = nx - cx
          crossDelta = Math.abs(cy - ny)
        }
        const score = primaryDelta + crossDelta * 0.5
        if (!best || score < best.score) best = { id: node.id, score }
      }
      if (best) {
        setSelected(best.id)
        fitView({ nodes: [{ id: best.id }], padding: 0.3, duration: 300 })
      }
    },
    [getNodes, effectiveState, config, setSelected, fitView],
  )

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        shiftRef.current = true
        return
      }
      const dir = NAV_KEYS[e.key]
      if (dir) {
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        e.preventDefault()
        navigateByKey(dir)
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        if (pendingDeleteRef.current !== null) return
        const ids = selectedNodeIdsRef.current
        if (ids.size > 0) {
          e.preventDefault()
          requestDelete(Array.from(ids))
        }
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftRef.current = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [requestDelete, navigateByKey])

  const filterVisibleIds = useMemo(
    () => (effectiveState ? computeFilterVisibleIds(effectiveState.people, filters) : undefined),
    [effectiveState, filters],
  )

  const layoutResult = useMemo(() => {
    if (!effectiveState || !baseline) return { nodes: [], edges: [] }
    const viewRoot = ui.viewRootUid ?? baseline.rootUid
    return computeLayout(
      effectiveState,
      ui.expandedNodes,
      viewRoot,
      config,
      ui.hiddenPeersOf,
      filterVisibleIds,
    )
  }, [
    effectiveState,
    ui.expandedNodes,
    ui.viewRootUid,
    ui.hiddenPeersOf,
    baseline,
    config,
    filterVisibleIds,
  ])

  // Keep a ref to the latest layout so snap-back can access it without stale closures
  const layoutResultRef = useRef(layoutResult)
  useEffect(() => {
    layoutResultRef.current = layoutResult
  }, [layoutResult])

  // Local node state so drag position updates are applied without losing dagre layout
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState(layoutResult.edges)

  // Apply filters + stamp viewRootUid onto node data
  useEffect(() => {
    const viewRootUid = ui.viewRootUid

    const stampViewRoot = (nodes: Node[]) =>
      nodes.map((n) => (n.id.startsWith('scope:') ? n : { ...n, data: { ...n.data, viewRootUid } }))

    const active = hasActiveFilters(filters)

    // Include/exclude mode: layout already handles node removal via filterVisibleIds; just stamp and set
    if (!active || !effectiveState || filters.mode !== 'highlight') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNodes(stampViewRoot(layoutResult.nodes))
      setEdges(layoutResult.edges)
      return
    }

    // Highlight mode: dim non-matching nodes, keep all nodes in place
    const { matchIds } = computeFilteredIds(effectiveState.people, filters)
    setNodes(
      stampViewRoot(
        layoutResult.nodes.map((n) => {
          if (n.id.startsWith('scope:')) return n
          const dimmed = !matchIds.has(n.id)
          return { ...n, data: { ...n.data, dimmed } }
        }),
      ),
    )
    setEdges(layoutResult.edges)
  }, [layoutResult, filters, effectiveState, ui.viewRootUid])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds))
  }, [])

  // Initial load: fit entire graph once nodes first appear
  const didInitialFitRef = useRef(false)
  useEffect(() => {
    if (didInitialFitRef.current || nodes.length === 0) return
    didInitialFitRef.current = true
    setTimeout(() => fitView({ padding: 0.1 }), 50)
  }, [nodes.length, fitView])

  // Consume fitViewIntent: fit view on specific nodes or the full graph
  useEffect(() => {
    if (!fitViewIntent) return
    clearFitViewIntent()
    requestAnimationFrame(() => {
      if ('all' in fitViewIntent) {
        fitView({ padding: 0.1, duration: 400 })
        return
      }
      const renderedIds = new Set(getNodes().map((n) => n.id))
      const targetNodes = fitViewIntent.ids
        .filter((id) => renderedIds.has(id))
        .map((id) => ({ id }))
      if (targetNodes.length > 0) {
        fitView({ nodes: targetNodes, padding: 0.25, duration: 500 })
      } else {
        fitView({ padding: 0.1, duration: 400 })
      }
    })
  }, [fitViewIntent, clearFitViewIntent, fitView, getNodes])

  // Center viewport on a search-selected node after layout settles
  useEffect(() => {
    if (!fitViewTarget) return
    requestAnimationFrame(() => {
      fitView({ nodes: [{ id: fitViewTarget }], padding: 0.3, duration: 400 })
      clearFitViewTarget()
    })
  }, [fitViewTarget, fitView, clearFitViewTarget])

  const focusViewRoot = useCallback(() => {
    if (!effectiveState) return
    // Prefer the selected card, then the view root, then the org root
    const rootUid = ui.selectedNodeId ?? ui.viewRootUid ?? baseline?.rootUid
    if (!rootUid) return
    const person = effectiveState.people[rootUid]
    if (!person) return

    const focusIds = new Set<string>([rootUid])
    if (person.managerUid) focusIds.add(person.managerUid)
    for (const [uid, p] of Object.entries(effectiveState.people)) {
      if (p.managerUid === rootUid) focusIds.add(uid)
    }

    const renderedIds = new Set(getNodes().map((n) => n.id))
    const targetNodes = [...focusIds].filter((id) => renderedIds.has(id)).map((id) => ({ id }))

    if (targetNodes.length > 0) {
      fitView({ nodes: targetNodes, padding: 0.25, duration: 600 })
    }
  }, [effectiveState, ui.selectedNodeId, ui.viewRootUid, baseline, getNodes, fitView])

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      setSelected(node.id, event.metaKey || event.ctrlKey)
      setOpenMenu(null)
    },
    [setSelected, setOpenMenu],
  )

  const onPaneClick = useCallback(() => {
    setSelected(null)
    setOpenMenu(null)
  }, [setSelected, setOpenMenu])

  const dropTargetRef = useRef<string | null>(null)

  const findClosestDropTarget = useCallback(
    (draggedId: string, draggedPos: { x: number; y: number }, allNodes: Node[]): string | null => {
      if (!effectiveState) return null
      const hasAnyTeam = Object.values(effectiveState.people).some((p) => !!p.teamId)
      const { w: nw, h: nh } = getNodeDims(config, hasAnyTeam)
      // Require actual bounding-box overlap; pick the candidate with the largest overlap area
      let bestId: string | null = null
      let bestOverlap = 0
      for (const n of allNodes) {
        if (n.id === draggedId || n.id.startsWith('scope:')) continue
        if (!effectiveState.people[n.id]) continue
        const overlapX =
          Math.min(draggedPos.x + nw, n.position.x + nw) - Math.max(draggedPos.x, n.position.x)
        const overlapY =
          Math.min(draggedPos.y + nh, n.position.y + nh) - Math.max(draggedPos.y, n.position.y)
        if (overlapX <= 0 || overlapY <= 0) continue
        const area = overlapX * overlapY
        if (area > bestOverlap) {
          bestOverlap = area
          bestId = n.id
        }
      }
      return bestId
    },
    [effectiveState, config],
  )

  const snapToGridRef = useRef(config.snapToGrid)
  useEffect(() => {
    snapToGridRef.current = config.snapToGrid
  }, [config.snapToGrid])

  const onNodeDrag = useCallback(
    (_: React.MouseEvent, draggedNode: Node) => {
      const allNodes = getNodes()
      const newTarget = findClosestDropTarget(draggedNode.id, draggedNode.position, allNodes)
      if (newTarget === dropTargetRef.current) return
      if (dropTargetRef.current) {
        document
          .querySelector(`.react-flow__node[data-id="${dropTargetRef.current}"]`)
          ?.classList.remove('drop-target')
      }
      dropTargetRef.current = newTarget
      if (newTarget) {
        document
          .querySelector(`.react-flow__node[data-id="${newTarget}"]`)
          ?.classList.add('drop-target')
      }
    },
    [findClosestDropTarget, getNodes],
  )

  const onNodeDragStart = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (!effectiveState) return
      if (node.id.startsWith('scope:')) return
      const person = effectiveState.people[node.id]
      if (!person) return
      draggingRef.current = { id: node.id, originalManagerUid: person.managerUid }
      // Suppress transition while dragging so the node tracks the cursor without lag
      setNodes((nds) =>
        nds.map((n) =>
          n.id === node.id ? { ...n, style: { ...n.style, transition: 'none' } } : n,
        ),
      )
    },
    [effectiveState],
  )

  const snapBack = useCallback((draggedId: string) => {
    // Restore node to its dagre-computed position with animation
    const layout = layoutResultRef.current
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== draggedId) return n
        const layoutNode = layout.nodes.find((ln) => ln.id === draggedId)
        if (!layoutNode) return n
        return {
          ...layoutNode,
          style: {
            ...layoutNode.style,
            transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          },
        }
      }),
    )
  }, [])

  const restoreTransition = useCallback((draggedId: string) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === draggedId
          ? {
              ...n,
              style: { ...n.style, transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)' },
            }
          : n,
      ),
    )
  }, [])

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, draggedNode: Node) => {
      const allNodes = getNodes()
      // Clear drop-target highlight
      if (dropTargetRef.current) {
        document
          .querySelector(`.react-flow__node[data-id="${dropTargetRef.current}"]`)
          ?.classList.remove('drop-target')
        dropTargetRef.current = null
      }

      if (!draggingRef.current || !effectiveState) return
      const { id } = draggingRef.current
      draggingRef.current = null

      const closestId = findClosestDropTarget(id, draggedNode.position, allNodes)
      if (!closestId) {
        if (snapToGridRef.current) snapBack(id)
        else restoreTransition(id)
        return
      }

      // Determine which nodes to move: all selected if dragging from within selection
      const nodesToMove = selectedNodeIds.has(id) ? Array.from(selectedNodeIds) : [id]

      // Prevent dropping onto a selected node or any ancestor of the drop target
      if (selectedNodeIds.has(closestId)) {
        if (snapToGridRef.current) snapBack(id)
        else restoreTransition(id)
        return
      }
      for (const uid of nodesToMove) {
        const subtree = getSubtreeIds(uid, effectiveState.people)
        if (subtree.has(closestId)) {
          if (snapToGridRef.current) snapBack(id)
          else restoreTransition(id)
          return
        }
      }

      const timestamp = new Date().toISOString()
      const actions: MoveAction[] = nodesToMove
        .filter((uid) => {
          const person = effectiveState.people[uid]
          return person && person.managerUid !== closestId
        })
        .map((uid) => ({
          type: 'move' as const,
          uid,
          fromManagerUid: effectiveState.people[uid].managerUid,
          toManagerUid: closestId,
          moveSubtree: !shiftRef.current,
          timestamp,
        }))

      if (actions.length === 0) {
        if (snapToGridRef.current) snapBack(id)
        else restoreTransition(id)
      } else if (actions.length === 1) {
        pushAction(actions[0])
      } else {
        pushActions(actions)
      }
    },
    [
      effectiveState,
      pushAction,
      pushActions,
      selectedNodeIds,
      findClosestDropTarget,
      getNodes,
      snapBack,
      restoreTransition,
    ],
  )

  const pendingPeople = pendingDeleteUids
    ? pendingDeleteUids.flatMap((uid) => {
        const p = effectiveState?.people[uid]
        return p ? [p] : []
      })
    : []

  if (!baseline) {
    return (
      <div className="flex flex-1 items-center justify-center text-gray-500">
        <div className="text-center">
          <p className="text-lg font-medium">No data loaded</p>
          <p className="mt-1 text-sm">
            Run <code className="rounded bg-gray-100 px-1">npm run import</code> then refresh
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      {pendingDeleteUids && pendingPeople.length > 0 && (
        <DeleteConfirmDialog
          people={pendingPeople}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        fitView
        fitViewOptions={{ padding: 0.1 }}
        minZoom={0.1}
        maxZoom={2}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={false}
        selectionKeyCode={null}
        disableKeyboardA11y
      >
        <Background color="#e2e8f0" gap={20} />
        <Controls>
          <ControlButton onClick={focusViewRoot} title="Focus on current root">
            <ScanSearch className="h-3.5 w-3.5" />
          </ControlButton>
        </Controls>
        <MiniMap
          nodeColor={(node) => {
            if (node.type === 'scope') return '#cbd5e1'
            const data = node.data as { jobRole?: string; isManager?: boolean }
            return data.isManager ? '#1e40af' : '#64748b'
          }}
          style={{ background: '#f8fafc' }}
          pannable
        />
      </ReactFlow>
    </>
  )
}

export function OrgChart() {
  return (
    <ReactFlowProvider>
      <OrgChartInner />
    </ReactFlowProvider>
  )
}
