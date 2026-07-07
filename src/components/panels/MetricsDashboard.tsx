import { useDeferredValue, useMemo } from 'react'
import { useAppStore } from '@/store'
import { roleColor } from '@/lib/role-colors'
import { teamColor } from '@/lib/team-colors'
import { buildChildrenMap, getSubtreePeople } from '@/lib/hierarchy-utils'
import { roleAbbreviation } from '@/lib/role-abbreviation'

interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  pending?: boolean
}

function StatCard({ label, value, sub, pending }: StatCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className={`text-2xl font-bold text-gray-900 ${pending ? 'opacity-40' : ''}`}>
        {value}
      </div>
      <div className="mt-0.5 text-xs text-gray-500">{label}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-400">{sub}</div>}
    </div>
  )
}

export function MetricsDashboard() {
  const effectiveState = useAppStore((s) => s.effectiveState)
  const selectedNodeId = useAppStore((s) => s.ui.selectedNodeId)

  // Resolve scope root immediately (drives header + label without delay)
  const scopeRootUid = useMemo(() => {
    if (!selectedNodeId || !effectiveState) return null
    const person = effectiveState.people[selectedNodeId]
    if (!person) return null
    return selectedNodeId
  }, [selectedNodeId, effectiveState])

  const scopeLabel = useMemo(() => {
    if (!scopeRootUid || !effectiveState) return 'Organization Metrics'
    const person = effectiveState.people[scopeRootUid]
    return person ? `Metrics: ${person.cn}` : 'Organization Metrics'
  }, [scopeRootUid, effectiveState])

  // Defer the scope for computation — card highlights first, metrics catch up after
  const deferredScopeRootUid = useDeferredValue(scopeRootUid)
  const isPending = deferredScopeRootUid !== scopeRootUid

  // Pre-build the children map once per effectiveState — O(n) scan reused across renders
  const childrenMap = useMemo(
    () => (effectiveState ? buildChildrenMap(effectiveState.people) : null),
    [effectiveState],
  )

  const metrics = useMemo(() => {
    if (!effectiveState || !childrenMap) return null
    const people = getSubtreePeople(deferredScopeRootUid, effectiveState.people, childrenMap)
    const total = people.length
    const managers = people.filter((p) => p.directReports > 0).length
    const ics = total - managers
    const ratio = managers > 0 ? (ics / managers).toFixed(1) : '—'
    const avgSpan = managers > 0 ? (ics / managers).toFixed(1) : '—'

    const byGeo = countBy(people, (p) => p.geo || 'Unknown')
    const byCountry = countBy(people, (p) => p.co || 'Unknown')
    const byRole = countBy(people, (p) => p.jobRole || 'Unknown')
    const byTitle = countBy(people, (p) => p.jobTitle || 'Unknown')
    const byTeam = countBy(people, (p) => p.teamId ?? '')

    // BFS to find the longest path (levels below) from the scope root
    let maxDepth = 0
    if (childrenMap) {
      const root =
        deferredScopeRootUid ??
        Object.values(effectiveState.people).find((p) => p.managerUid === null)?.uid
      if (root) {
        const queue: [string, number][] = [[root, 0]]
        while (queue.length > 0) {
          const [uid, depth] = queue.shift()!
          if (depth > maxDepth) maxDepth = depth
          for (const childUid of childrenMap.get(uid) ?? []) {
            queue.push([childUid, depth + 1])
          }
        }
      }
    }

    return {
      total,
      managers,
      ics,
      ratio,
      avgSpan,
      maxDepth,
      byGeo,
      byCountry,
      byRole,
      byTitle,
      byTeam,
    }
  }, [effectiveState, childrenMap, deferredScopeRootUid])

  if (!metrics) return <div className="p-4 text-sm text-gray-400">No data loaded</div>

  return (
    <div className="space-y-4 overflow-y-auto p-3">
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="truncate text-xs font-semibold tracking-wide text-gray-500 uppercase">
            {scopeLabel}
          </div>
          {isPending && (
            <svg
              className="h-3 w-3 flex-shrink-0 animate-spin text-gray-400"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
          )}
        </div>
      </div>

      <div
        className={`transition-opacity duration-150 ${isPending ? 'opacity-50' : 'opacity-100'}`}
      >
        <div className="mb-4 grid grid-cols-2 gap-2">
          <StatCard
            label="Total Associates"
            value={metrics.total.toLocaleString()}
            pending={isPending}
          />
          <StatCard
            label="Managers"
            value={metrics.managers.toLocaleString()}
            pending={isPending}
          />
          <StatCard label="ICs" value={metrics.ics.toLocaleString()} pending={isPending} />
          <StatCard
            label="IC:Mgr Ratio"
            value={metrics.ratio}
            sub="ICs per manager"
            pending={isPending}
          />
          <StatCard
            label="Avg Span"
            value={metrics.avgSpan}
            sub="ICs per manager"
            pending={isPending}
          />
          <StatCard
            label="Org Depth"
            value={metrics.maxDepth}
            sub="levels below"
            pending={isPending}
          />
        </div>

        <Section title="By Geo">
          {Object.entries(metrics.byGeo)
            .sort((a, b) => b[1] - a[1])
            .map(([geo, count]) => (
              <Bar key={geo} label={geo} count={count} total={metrics.total} />
            ))}
        </Section>

        <Section title="By Country">
          {capEntries(metrics.byCountry).map(([label, count]) => (
            <Bar key={label} label={label} count={count} total={metrics.total} />
          ))}
        </Section>

        <Section title="By Role">
          {capEntries(metrics.byRole).map(([role, count]) => (
            <Bar
              key={role}
              label={role}
              count={count}
              total={metrics.total}
              color={roleColor(role)}
            />
          ))}
        </Section>

        <Section title="By Title">
          {capEntries(metrics.byTitle).map(([title, count]) => (
            <Bar
              key={title}
              label={title === 'Other' ? 'Other' : roleAbbreviation(title)}
              fullLabel={title}
              count={count}
              total={metrics.total}
            />
          ))}
        </Section>

        {Object.keys(metrics.byTeam).some((k) => k !== '') && (
          <Section title="By Team">
            {Object.entries(metrics.byTeam)
              .filter(([id]) => id !== '')
              .sort((a, b) => b[1] - a[1])
              .map(([teamId, count]) => {
                const name = effectiveState?.teams[teamId]?.name ?? teamId
                return (
                  <Bar
                    key={teamId}
                    label={name}
                    count={count}
                    total={metrics.total}
                    color={teamColor(teamId)}
                  />
                )
              })}
          </Section>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function Bar({
  label,
  fullLabel,
  count,
  total,
  color,
}: {
  label: string
  fullLabel?: string
  count: number
  total: number
  color?: string
}) {
  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="min-w-0 flex-1 truncate text-gray-600" title={fullLabel ?? label}>
        {label}
      </div>
      <div className="h-1.5 w-20 flex-shrink-0 rounded-full bg-gray-100">
        <div
          className="h-1.5 rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color ?? '#64748b' }}
        />
      </div>
      <div className="w-8 flex-shrink-0 text-right text-gray-500">{count.toLocaleString()}</div>
    </div>
  )
}

function capEntries(data: Record<string, number>, max = 8): [string, number][] {
  const sorted = Object.entries(data).sort((a, b) => b[1] - a[1])
  if (sorted.length <= max) return sorted
  return [
    ...sorted.slice(0, max - 1),
    ['Other', sorted.slice(max - 1).reduce((sum, [, n]) => sum + n, 0)],
  ]
}

function countBy<T>(arr: T[], key: (item: T) => string): Record<string, number> {
  const result: Record<string, number> = {}
  for (const item of arr) {
    const k = key(item)
    result[k] = (result[k] ?? 0) + 1
  }
  return result
}
