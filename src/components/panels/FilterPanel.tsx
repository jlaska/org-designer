import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { useAppStore } from '@/store'
import { roleColor, uniqueJobRoles } from '@/lib/role-colors'
import { teamColor } from '@/lib/team-colors'

export function FilterPanel() {
  const filters = useAppStore((s) => s.filters)
  const setFilters = useAppStore((s) => s.setFilters)
  const clearFilters = useAppStore((s) => s.clearFilters)
  const effectiveState = useAppStore((s) => s.effectiveState)

  const [titleSearch, setTitleSearch] = useState('')

  const { geos, countries, teams, allJobTitles, jobRoles } = useMemo(() => {
    if (!effectiveState)
      return { geos: [], countries: [], teams: [], allJobTitles: [], jobRoles: [] }
    const people = Object.values(effectiveState.people)
    const teamIds = [...new Set(people.map((p) => p.teamId).filter(Boolean) as string[])]
    return {
      geos: [...new Set(people.map((p) => p.geo).filter(Boolean))].sort(),
      countries: [...new Set(people.map((p) => p.co).filter(Boolean))].sort(),
      teams: teamIds
        .map((id) => ({ id, name: effectiveState.teams[id]?.name ?? id }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      allJobTitles: [...new Set(people.map((p) => p.jobTitle).filter(Boolean))].sort(),
      jobRoles: uniqueJobRoles(people).filter((r) => r !== 'Unknown'),
    }
  }, [effectiveState])

  const visibleJobTitles = useMemo(() => {
    if (!titleSearch.trim()) return []
    const q = titleSearch.toLowerCase()
    return allJobTitles
      .filter((t) => !filters.jobTitles.includes(t) && t.toLowerCase().includes(q))
      .slice(0, 6)
  }, [allJobTitles, titleSearch, filters.jobTitles])

  const hasFilters =
    filters.geos.length > 0 ||
    filters.countries.length > 0 ||
    filters.jobRoles.length > 0 ||
    filters.teams.length > 0 ||
    filters.jobTitles.length > 0 ||
    filters.peopleType !== 'all'

  function toggleMulti(field: 'geos' | 'countries' | 'jobRoles' | 'teams', value: string) {
    const current = filters[field]
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
    setFilters({ [field]: next })
  }

  return (
    <div className="space-y-4 overflow-y-auto p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wide text-gray-400 uppercase">Filters</span>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600"
          >
            <X className="h-3 w-3" /> Clear all
          </button>
        )}
      </div>

      {/* Mode toggle */}
      <div>
        <div className="mb-1.5 text-xs text-gray-500">Filter mode</div>
        <div className="flex overflow-hidden rounded-lg border border-gray-200 text-xs">
          {(['highlight', 'include', 'exclude'] as const).map((mode) => (
            <button
              key={mode}
              className={`flex-1 py-1.5 capitalize transition-colors ${
                filters.mode === mode
                  ? 'bg-blue-500 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
              onClick={() => setFilters({ mode })}
            >
              {mode}
            </button>
          ))}
        </div>
        <div className="mt-1 text-xs text-gray-400">
          {filters.mode === 'highlight' && 'Dim non-matching nodes'}
          {filters.mode === 'include' && 'Show only matching nodes'}
          {filters.mode === 'exclude' && 'Remove matching nodes'}
        </div>
      </div>

      {/* People type */}
      <div>
        <div className="mb-1.5 text-xs text-gray-500">People type</div>
        <div className="flex overflow-hidden rounded-lg border border-gray-200 text-xs">
          {(['all', 'managers', 'ics'] as const).map((type) => (
            <button
              key={type}
              className={`flex-1 py-1.5 capitalize transition-colors ${
                filters.peopleType === type
                  ? 'bg-blue-500 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
              onClick={() => setFilters({ peopleType: type })}
            >
              {type === 'ics' ? 'ICs' : type === 'managers' ? 'Managers' : 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Job title */}
      <div>
        <div className="mb-1.5 text-xs text-gray-500">Job title</div>
        <input
          type="text"
          value={titleSearch}
          onChange={(e) => setTitleSearch(e.target.value)}
          placeholder="Search job titles..."
          className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
        />
        {visibleJobTitles.length > 0 && (
          <div className="mt-1 rounded border border-gray-200">
            {visibleJobTitles.map((title) => (
              <button
                key={title}
                onClick={() => {
                  setFilters({ jobTitles: [...filters.jobTitles, title] })
                  setTitleSearch('')
                }}
                className="w-full px-2 py-1 text-left text-xs text-gray-600 transition-colors hover:bg-gray-50"
              >
                {title}
              </button>
            ))}
          </div>
        )}
        {titleSearch.trim() && visibleJobTitles.length === 0 && (
          <p className="mt-1 text-xs text-gray-400">No matching job titles</p>
        )}
        {filters.jobTitles.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {filters.jobTitles.map((title) => (
              <button
                key={title}
                onClick={() =>
                  setFilters({ jobTitles: filters.jobTitles.filter((t) => t !== title) })
                }
                className="rounded-full border border-blue-500 bg-blue-500 px-2 py-0.5 text-xs text-white transition-colors hover:bg-blue-600"
              >
                {title}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Job Role */}
      <div>
        <div className="mb-1.5 text-xs text-gray-500">Job Role</div>
        <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
          {jobRoles.map((role) => {
            const active = filters.jobRoles.includes(role)
            const color = roleColor(role)
            return (
              <button
                key={role}
                onClick={() => toggleMulti('jobRoles', role)}
                className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                  active ? 'text-white' : 'border-gray-200 bg-white text-gray-600'
                }`}
                style={active ? { backgroundColor: color, borderColor: color } : undefined}
              >
                {role}
              </button>
            )
          })}
        </div>
      </div>

      {/* Geo */}
      <ChipGroup
        title="Geo"
        options={geos}
        selected={filters.geos}
        onToggle={(v) => toggleMulti('geos', v)}
      />

      {/* Country */}
      <ChipGroup
        title="Country"
        options={countries}
        selected={filters.countries}
        onToggle={(v) => toggleMulti('countries', v)}
      />

      {/* Team */}
      {teams.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs text-gray-500">Team</div>
          <div className="flex flex-wrap gap-1">
            {teams.map(({ id, name }) => {
              const active = filters.teams.includes(id)
              const color = teamColor(id)
              return (
                <button
                  key={id}
                  onClick={() => toggleMulti('teams', id)}
                  className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
                    active ? 'text-white' : 'border-gray-200 bg-white text-gray-600'
                  }`}
                  style={active ? { backgroundColor: color, borderColor: color } : undefined}
                >
                  <span
                    className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: active ? 'rgba(255,255,255,0.7)' : color }}
                  />
                  {name}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function ChipGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string
  options: string[]
  selected: string[]
  onToggle: (v: string) => void
}) {
  return (
    <div>
      <div className="mb-1.5 text-xs text-gray-500">{title}</div>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onToggle(opt)}
            className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
              selected.includes(opt)
                ? 'border-blue-500 bg-blue-500 text-white'
                : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}
