import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useAppStore } from '@/store'
import { uniqueJobRoles } from '@/lib/role-colors'
import type { AddPersonAction, EditPersonAction, OverlayAction } from '@/types/overlay'
import type { PersonRecord } from '@/types/person'

interface Props {
  managerUid: string
  editPerson?: PersonRecord
  onClose: () => void
}

export function AddPersonDialog({ managerUid, editPerson, onClose }: Props) {
  const effectiveState = useAppStore((s) => s.effectiveState)
  const pushAction = useAppStore((s) => s.pushAction)
  const pushActions = useAppStore((s) => s.pushActions)
  const isEdit = !!editPerson

  const jobRoles = useMemo(() => {
    if (!effectiveState) return ['Unknown']
    return uniqueJobRoles(Object.values(effectiveState.people))
  }, [effectiveState])

  const defaultRole = editPerson?.jobRole ?? jobRoles[0] ?? 'Unknown'

  const [name, setName] = useState(editPerson?.cn ?? '')
  const [role, setRole] = useState(defaultRole)
  const [title, setTitle] = useState(editPerson?.jobTitle ?? defaultRole)
  const [geo, setGeo] = useState(editPerson?.geo ?? '')
  const [country, setCountry] = useState(editPerson?.co ?? '')
  const [teamId, setTeamId] = useState(editPerson?.teamId ?? null)
  const [yamlRoles, setYamlRoles] = useState<Set<string>>(new Set(editPerson?.yamlRoles ?? []))
  const [count, setCount] = useState(1)
  const [teamInput, setTeamInput] = useState('')
  const [teamDropdownOpen, setTeamDropdownOpen] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false)
  const teamInputRef = useRef<HTMLInputElement>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)

  const nameRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  const geos = Array.from(
    new Set(
      Object.values(effectiveState?.people ?? {})
        .map((p) => p.geo)
        .filter(Boolean),
    ),
  ).sort()
  const countries = Array.from(
    new Set(
      Object.values(effectiveState?.people ?? {})
        .map((p) => p.co)
        .filter(Boolean),
    ),
  ).sort()

  const teams = useMemo(() => {
    if (!effectiveState) return []
    const predefined = Object.values(effectiveState.teams).map((t) => ({ id: t.id, name: t.name }))

    // Collect custom teams from people's teamIds
    const customTeamIds = new Set<string>()
    Object.values(effectiveState.people).forEach((p) => {
      if (p.teamId && !effectiveState.teams[p.teamId]) {
        customTeamIds.add(p.teamId)
      }
    })

    const custom = Array.from(customTeamIds).map((id) => ({ id, name: id }))
    return [...predefined, ...custom].sort((a, b) => a.name.localeCompare(b.name))
  }, [effectiveState])

  const allTags = useMemo(() => {
    if (!effectiveState) return []
    const tagSet = new Set<string>()
    Object.values(effectiveState.people).forEach((p) => {
      p.yamlRoles.forEach((tag) => tagSet.add(tag))
    })
    return Array.from(tagSet).sort()
  }, [effectiveState])

  const prevRole = useRef(role)
  useEffect(() => {
    if (title === prevRole.current) setTitle(role)
    prevRole.current = role
  }, [role, title])

  const filteredTeams = useMemo(() => {
    const matching = teams.filter((t) => t.name.toLowerCase().includes(teamInput.toLowerCase()))
    const hasExactMatch = teams.some((t) => t.id === teamInput.trim())
    return { matching, canCreate: teamInput.trim().length > 0 && !hasExactMatch }
  }, [teams, teamInput])

  const filteredTags = useMemo(() => {
    return allTags.filter((t) => t.toLowerCase().includes(tagInput.toLowerCase()))
  }, [allTags, tagInput])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    const timestamp = new Date().toISOString()

    if (isEdit) {
      const updates: Partial<PersonRecord> = {}

      // Only include fields that differ from editPerson (preserve LDAP data)
      if (name.trim() !== editPerson.cn) updates.cn = name.trim()
      if (title.trim() !== editPerson.jobTitle) updates.jobTitle = title.trim() || role
      if (role !== editPerson.jobRole) updates.jobRole = role
      if (geo !== editPerson.geo) updates.geo = geo
      if (country !== editPerson.co) updates.co = country
      if (teamId !== editPerson.teamId) updates.teamId = teamId || null

      const newYamlRoles = Array.from(yamlRoles)
      if (JSON.stringify(newYamlRoles) !== JSON.stringify(editPerson.yamlRoles)) {
        updates.yamlRoles = newYamlRoles
      }

      const action: EditPersonAction = {
        type: 'edit_person',
        uid: editPerson.uid,
        updates,
        timestamp,
      }
      pushAction(action)
    } else {
      const baseName = name.trim()
      const baseTitle = title.trim() || role
      const makeAction = (index: number): AddPersonAction => {
        const label = index === 0 ? baseName : `${baseName} (${index + 1})`
        const person: PersonRecord = {
          uid: `placeholder-${Date.now()}-${index}`,
          cn: label,
          displayName: label,
          preferredLastName: label.split(' ').slice(-1)[0] ?? '',
          jobTitle: baseTitle,
          jobRole: role,
          geo,
          co: country,
          l: '',
          location: '',
          hireDate: '',
          workerId: '',
          costCenter: '',
          costCenterDesc: '',
          managerUid,
          directReports: 0,
          totalReports: 0,
          teamId: teamId || null,
          yamlRoles: Array.from(yamlRoles),
        }
        return { type: 'add_person', person, timestamp }
      }
      if (count === 1) {
        pushAction(makeAction(0))
      } else {
        const actions: OverlayAction[] = Array.from({ length: count }, (_, i) => makeAction(i))
        pushActions(actions)
      }
    }

    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      onKeyDown={handleKeyDown}
    >
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <form
        onSubmit={handleSubmit}
        className="relative mx-4 w-full max-w-sm rounded-xl border border-gray-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">
            {isEdit ? 'Edit card' : 'Add new report'}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <Field label="Name *">
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. TBD, Hiring Manager"
              className="input-base"
              required
            />
          </Field>

          <Field label="Role">
            <select value={role} onChange={(e) => setRole(e.target.value)} className="input-base">
              {jobRoles
                .filter((r) => r !== 'Unknown')
                .map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
            </select>
          </Field>

          <Field label="Title">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Job title"
              className="input-base"
            />
          </Field>

          {!isEdit && (
            <Field label="Count">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCount((c) => Math.max(1, c - 1))}
                  disabled={count <= 1}
                  className="flex h-7 w-7 items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={count}
                  onChange={(e) => setCount(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
                  className="input-base w-12 text-center"
                />
                <button
                  type="button"
                  onClick={() => setCount((c) => Math.min(10, c + 1))}
                  disabled={count >= 10}
                  className="flex h-7 w-7 items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  +
                </button>
              </div>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Field label="Geo">
              <select value={geo} onChange={(e) => setGeo(e.target.value)} className="input-base">
                <option value="">—</option>
                {geos.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Country">
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="input-base"
              >
                <option value="">—</option>
                {countries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Team">
            <div className="space-y-2">
              <div className="flex min-h-[32px] flex-wrap gap-1 rounded border border-gray-200 bg-white p-2">
                {teamId && (
                  <div className="inline-flex items-center gap-1 rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                    {teams.find((t) => t.id === teamId)?.name ?? teamId}
                    <button
                      type="button"
                      onClick={() => setTeamId(null)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
                {!teamId && <span className="text-xs text-gray-400">No team</span>}
              </div>
              <div className="relative">
                <input
                  ref={teamInputRef}
                  type="text"
                  value={teamInput}
                  onChange={(e) => {
                    setTeamInput(e.target.value)
                    setTeamDropdownOpen(true)
                  }}
                  onFocus={() => setTeamDropdownOpen(true)}
                  onBlur={() => {
                    setTimeout(() => setTeamDropdownOpen(false), 150)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && filteredTeams.canCreate) {
                      e.preventDefault()
                      setTeamId(teamInput.trim())
                      setTeamInput('')
                      setTeamDropdownOpen(false)
                    } else if (e.key === 'Escape') {
                      e.preventDefault()
                      e.stopPropagation()
                      setTeamDropdownOpen(false)
                    }
                  }}
                  placeholder="Search or create team..."
                  className="input-base w-full text-xs"
                />
                {teamDropdownOpen && (
                  <div className="absolute top-full right-0 left-0 z-50 mt-1 max-h-48 overflow-y-auto rounded border border-gray-200 bg-white shadow-md">
                    {filteredTeams.matching.length > 0 ? (
                      filteredTeams.matching.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setTeamId(t.id)
                            setTeamInput('')
                            setTeamDropdownOpen(false)
                          }}
                          className={`w-full px-3 py-2 text-left text-xs hover:bg-gray-50 ${
                            teamId === t.id ? 'text-gray-400 line-through' : 'text-gray-700'
                          }`}
                          disabled={teamId === t.id}
                        >
                          {t.name}
                        </button>
                      ))
                    ) : teamInput ? (
                      <div className="px-3 py-2 text-xs text-gray-400">No matching teams</div>
                    ) : (
                      <div className="px-3 py-2 text-xs text-gray-500">
                        {teams.length === 0
                          ? 'No teams available'
                          : `${teams.length} team${teams.length === 1 ? '' : 's'}`}
                      </div>
                    )}
                    {filteredTeams.canCreate && (
                      <button
                        type="button"
                        onClick={() => {
                          setTeamId(teamInput.trim())
                          setTeamInput('')
                          setTeamDropdownOpen(false)
                        }}
                        className="w-full px-3 py-2 text-left text-xs font-medium text-blue-600 hover:bg-blue-50"
                      >
                        Create "{teamInput.trim()}"
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Field>

          <Field label="Tags">
            <div className="space-y-2">
              <div className="flex min-h-[32px] flex-wrap gap-1 rounded border border-gray-200 bg-white p-2">
                {Array.from(yamlRoles).map((tag) => (
                  <div
                    key={tag}
                    className="inline-flex items-center gap-1 rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => {
                        const next = new Set(yamlRoles)
                        next.delete(tag)
                        setYamlRoles(next)
                      }}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {yamlRoles.size === 0 && <span className="text-xs text-gray-400">No tags</span>}
              </div>
              <div className="relative">
                <input
                  ref={tagInputRef}
                  type="text"
                  value={tagInput}
                  onChange={(e) => {
                    setTagInput(e.target.value)
                    setTagDropdownOpen(true)
                  }}
                  onFocus={() => setTagDropdownOpen(true)}
                  onBlur={() => {
                    setTimeout(() => setTagDropdownOpen(false), 150)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (tagInput.trim() && !yamlRoles.has(tagInput.trim())) {
                        setYamlRoles((prev) => new Set([...prev, tagInput.trim()]))
                        setTagInput('')
                      }
                    } else if (e.key === 'Escape') {
                      e.preventDefault()
                      e.stopPropagation()
                      setTagDropdownOpen(false)
                    }
                  }}
                  placeholder="Search or create tag..."
                  className="input-base w-full text-xs"
                />
                {tagDropdownOpen && (
                  <div className="absolute top-full right-0 left-0 z-50 mt-1 max-h-48 overflow-y-auto rounded border border-gray-200 bg-white shadow-md">
                    {filteredTags.length > 0 ? (
                      filteredTags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            if (!yamlRoles.has(tag)) {
                              setYamlRoles((prev) => new Set([...prev, tag]))
                            }
                            setTagInput('')
                            tagInputRef.current?.focus()
                          }}
                          className={`w-full px-3 py-2 text-left text-xs hover:bg-gray-50 ${
                            yamlRoles.has(tag) ? 'text-gray-400 line-through' : 'text-gray-700'
                          }`}
                          disabled={yamlRoles.has(tag)}
                        >
                          {tag}
                        </button>
                      ))
                    ) : tagInput ? (
                      <div className="px-3 py-2 text-xs text-gray-400">No matching tags</div>
                    ) : (
                      <div className="px-3 py-2 text-xs text-gray-500">
                        {allTags.length === 0
                          ? 'No tags available'
                          : `${allTags.length} tag${allTags.length === 1 ? '' : 's'}`}
                      </div>
                    )}
                    {tagInput.trim() &&
                      !allTags.includes(tagInput.trim()) &&
                      !yamlRoles.has(tagInput.trim()) && (
                        <button
                          type="button"
                          onClick={() => {
                            setYamlRoles((prev) => new Set([...prev, tagInput.trim()]))
                            setTagInput('')
                            tagInputRef.current?.focus()
                          }}
                          className="w-full px-3 py-2 text-left text-xs font-medium text-blue-600 hover:bg-blue-50"
                        >
                          Create "{tagInput.trim()}"
                        </button>
                      )}
                  </div>
                )}
              </div>
            </div>
          </Field>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isEdit ? 'Save changes' : 'Add report'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-gray-500">{label}</label>
      {children}
    </div>
  )
}
