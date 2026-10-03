import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useAppStore } from '@/store'
import { uniqueJobRoles } from '@/lib/role-colors'
import { TagComboBox } from '@/components/shared/TagComboBox'
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
  const [tags, setTags] = useState<Set<string>>(new Set(editPerson?.tags ?? []))
  const [count, setCount] = useState(1)
  const [teamInput, setTeamInput] = useState('')
  const [tagInput, setTagInput] = useState('')

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
      p.tags.forEach((tag) => tagSet.add(tag))
    })
    return Array.from(tagSet).sort()
  }, [effectiveState])

  const prevRole = useRef(role)
  useEffect(() => {
    if (title === prevRole.current) setTitle(role)
    prevRole.current = role
  }, [role, title])

  const filteredTeams = useMemo(() => {
    const trimmed = teamInput.trim()
    const matching = teams.filter(
      (t) => t.id !== teamId && t.name.toLowerCase().includes(trimmed.toLowerCase()),
    )
    const exactNameMatch = teams.find((t) => t.name.toLowerCase() === trimmed.toLowerCase())
    return { matching, exactNameMatch, canCreate: trimmed.length > 0 && !exactNameMatch }
  }, [teams, teamInput, teamId])

  const filteredTags = useMemo(() => {
    const trimmed = tagInput.trim()
    const matching = allTags.filter(
      (t) => !tags.has(t) && t.toLowerCase().includes(trimmed.toLowerCase()),
    )
    return {
      matching,
      canCreate: trimmed.length > 0 && !allTags.includes(trimmed) && !tags.has(trimmed),
    }
  }, [allTags, tagInput, tags])

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

      const newTags = Array.from(tags)
      if (JSON.stringify(newTags) !== JSON.stringify(editPerson.tags)) {
        updates.tags = newTags
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
          yamlRoles: [],
          tags: Array.from(tags),
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
            <TagComboBox
              items={
                teamId
                  ? [{ id: teamId, label: teams.find((t) => t.id === teamId)?.name ?? teamId }]
                  : []
              }
              suggestions={filteredTeams.matching.map((t) => ({ id: t.id, label: t.name }))}
              inputValue={teamInput}
              onInputChange={setTeamInput}
              onSelect={(opt) => setTeamId(opt.id)}
              onCreate={(label) => setTeamId(filteredTeams.exactNameMatch?.id ?? label)}
              onRemove={() => setTeamId(null)}
              canCreate={filteredTeams.canCreate}
              placeholder="Search or create team..."
              totalCount={teams.length}
              noun="team"
            />
          </Field>

          <Field label="Tags">
            <TagComboBox
              items={Array.from(tags).map((t) => ({ id: t, label: t }))}
              suggestions={filteredTags.matching.map((t) => ({ id: t, label: t }))}
              inputValue={tagInput}
              onInputChange={setTagInput}
              onSelect={(opt) => setTags((prev) => new Set([...prev, opt.id]))}
              onCreate={(label) => setTags((prev) => new Set([...prev, label]))}
              onRemove={(id) =>
                setTags((prev) => {
                  const next = new Set(prev)
                  next.delete(id)
                  return next
                })
              }
              canCreate={filteredTags.canCreate}
              placeholder="Search or create tag..."
              totalCount={allTags.length}
              noun="tag"
            />
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
