import { useMemo } from 'react'
import { BarChart2, Filter, Settings } from 'lucide-react'
import { useAppStore } from '@/store'
import { MetricsDashboard } from '@/components/panels/MetricsDashboard'
import { FilterPanel } from '@/components/panels/FilterPanel'
import { ConfigPanel } from '@/components/panels/ConfigPanel'
import { roleLabelsFromPeople } from '@/lib/role-colors'
import { computeFilterVisibleIds } from '@/lib/filter-utils'
import { getVisiblePersonIds } from '@/lib/layout-engine'

export function Sidebar() {
  const sidebarTab = useAppStore((s) => s.ui.sidebarTab)
  const setSidebarTab = useAppStore((s) => s.setSidebarTab)
  const effectiveState = useAppStore((s) => s.effectiveState)
  const baseline = useAppStore((s) => s.baseline)
  const viewRootUid = useAppStore((s) => s.ui.viewRootUid)
  const expandedNodes = useAppStore((s) => s.ui.expandedNodes)
  const hiddenPeersOf = useAppStore((s) => s.ui.hiddenPeersOf)
  const filters = useAppStore((s) => s.filters)

  const roleLabels = useMemo(() => {
    if (!effectiveState || !baseline) return []
    const root = viewRootUid ?? baseline.rootUid
    const filterVisibleIds = computeFilterVisibleIds(effectiveState.people, filters)
    const visibleIds = getVisiblePersonIds(
      effectiveState,
      expandedNodes,
      root,
      hiddenPeersOf,
      filterVisibleIds,
    )
    const visiblePeople = [...visibleIds].map((uid) => effectiveState.people[uid]).filter(Boolean)
    return roleLabelsFromPeople(visiblePeople).filter((r) => r.role !== 'Unknown')
  }, [effectiveState, baseline, viewRootUid, expandedNodes, hiddenPeersOf, filters])

  const tabs = [
    { id: 'metrics' as const, icon: <BarChart2 className="h-4 w-4" />, label: 'Metrics' },
    { id: 'filters' as const, icon: <Filter className="h-4 w-4" />, label: 'Filters' },
    { id: 'configure' as const, icon: <Settings className="h-4 w-4" />, label: 'Configure' },
  ]

  return (
    <div className="flex w-64 flex-shrink-0 flex-col border-r border-gray-200 bg-gray-50">
      {/* Tab bar */}
      <div className="flex border-b border-gray-200 bg-white">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSidebarTab(tab.id)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
              sidebarTab === tab.id
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-y-auto">
        {sidebarTab === 'metrics' && <MetricsDashboard />}
        {sidebarTab === 'filters' && <FilterPanel />}
        {sidebarTab === 'configure' && <ConfigPanel />}
      </div>

      {/* Color legend — roles on currently displayed chart nodes only */}
      <div className="border-t border-gray-200 p-3">
        <div className="mb-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">
          Role Legend
        </div>
        <div className="max-h-48 space-y-1 overflow-y-auto">
          {roleLabels.length === 0 ? (
            <div className="text-xs text-gray-400">No roles in current view</div>
          ) : (
            roleLabels.map(({ role, color }) => (
              <div key={role} className="flex items-center gap-2 text-xs text-gray-600">
                <div
                  className="h-2.5 w-2.5 flex-shrink-0 rounded-sm"
                  style={{ backgroundColor: color }}
                />
                <span className="truncate" title={role}>
                  {role}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
