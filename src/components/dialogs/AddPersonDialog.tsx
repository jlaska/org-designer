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
  const [newTagInput, setNewTagInput] = useState('')
  const [newTeamInput, setNewTeamInput] = useState('')

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
          teamId: null,
          yamlRoles: [],
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

          {isEdit && (
            <>
              <Field label="Team">
                <div className="space-y-2">
                  <select
                    value={teamId ?? ''}
                    onChange={(e) => setTeamId(e.target.value || null)}
                    className="input-base w-full"
                  >
                    <option value="">—</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={newTeamInput}
                      onChange={(e) => setNewTeamInput(e.target.value)}
                      placeholder="Add custom team"
                      className="input-base flex-1 text-xs"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          if (newTeamInput.trim()) {
                            setTeamId(newTeamInput.trim())
                            setNewTeamInput('')
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      disabled={
                        !newTeamInput.trim() || teams.some((t) => t.id === newTeamInput.trim())
                      }
                      onClick={() => {
                        if (newTeamInput.trim()) {
                          setTeamId(newTeamInput.trim())
                          setNewTeamInput('')
                        }
                      }}
                      className="rounded border border-gray-200 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      Add
                    </button>
                  </div>
                  {teamId && !teams.some((t) => t.id === teamId) && (
                    <div className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-600">
                      Custom: {teamId}
                    </div>
                  )}
                </div>
              </Field>

              <Field label="Tags">
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1 rounded border border-gray-200 bg-white p-2">
                    {allTags.length === 0 && yamlRoles.size === 0 ? (
                      <span className="text-xs text-gray-400">No tags available</span>
                    ) : (
                      [
                        ...allTags,
                        ...Array.from(yamlRoles).filter((t) => !allTags.includes(t)),
                      ].map((tag) => {
                        const isCustom = !allTags.includes(tag)
                        return (
                          <label
                            key={tag}
                            className={`flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs ${
                              isCustom
                                ? 'bg-amber-100 hover:bg-amber-200'
                                : 'bg-gray-100 hover:bg-gray-200'
                            }`}
                            title={isCustom ? 'Custom tag' : ''}
                          >
                            <input
                              type="checkbox"
                              checked={yamlRoles.has(tag)}
                              onChange={(e) => {
                                const next = new Set(yamlRoles)
                                if (e.target.checked) {
                                  next.add(tag)
                                } else {
                                  next.delete(tag)
                                }
                                setYamlRoles(next)
                              }}
                              className="h-3 w-3"
                            />
                            {tag}
                          </label>
                        )
                      })
                    )}
                  </div>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      placeholder="Add custom tag"
                      className="input-base flex-1 text-xs"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          if (newTagInput.trim() && !yamlRoles.has(newTagInput.trim())) {
                            setYamlRoles((prev) => new Set([...prev, newTagInput.trim()]))
                            setNewTagInput('')
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      disabled={!newTagInput.trim() || yamlRoles.has(newTagInput.trim())}
                      onClick={() => {
                        if (newTagInput.trim() && !yamlRoles.has(newTagInput.trim())) {
                          setYamlRoles((prev) => new Set([...prev, newTagInput.trim()]))
                          setNewTagInput('')
                        }
                      }}
                      className="rounded border border-gray-200 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </Field>
            </>
          )}
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
