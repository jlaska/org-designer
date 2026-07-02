import { useAppStore } from '@/store'
import type { CardDensity, LayoutDirection, SortLayerBy } from '@/store'

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between py-1.5 select-none">
      <span className="text-sm text-gray-700">{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition-colors ${checked ? 'bg-blue-500' : 'bg-gray-300'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`}
        />
      </button>
    </label>
  )
}

function SegmentControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex overflow-hidden rounded border border-gray-200">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 py-1.5 text-xs transition-colors ${
            value === opt.value
              ? 'bg-blue-500 font-medium text-white'
              : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="mt-4 mb-2 text-xs font-semibold tracking-wide text-gray-400 uppercase first:mt-0">
      {label}
    </div>
  )
}

export function ConfigPanel() {
  const config = useAppStore((s) => s.config)
  const setConfig = useAppStore((s) => s.setConfig)
  const setCardFields = useAppStore((s) => s.setCardFields)

  return (
    <div className="space-y-0.5 p-3">
      <SectionHeader label="Person" />
      <Toggle
        label="Job Title"
        checked={config.cardFields.title}
        onChange={(v) => setCardFields({ title: v })}
      />
      <Toggle
        label="Job Role"
        checked={config.cardFields.jobRole}
        onChange={(v) => setCardFields({ jobRole: v })}
      />
      <Toggle
        label="Location (Geo · Country)"
        checked={config.cardFields.location}
        onChange={(v) => setCardFields({ location: v })}
      />
      <Toggle
        label="City"
        checked={config.cardFields.city}
        onChange={(v) => setCardFields({ city: v })}
      />
      <Toggle
        label="Hire Date"
        checked={config.cardFields.hireDate}
        onChange={(v) => setCardFields({ hireDate: v })}
      />
      <Toggle
        label="Tenure"
        checked={config.cardFields.tenure}
        onChange={(v) => setCardFields({ tenure: v })}
      />
      <Toggle
        label="Report Counts"
        checked={config.cardFields.reportCounts}
        onChange={(v) => setCardFields({ reportCounts: v })}
      />

      <SectionHeader label="Team" />
      <Toggle
        label="Team Name"
        checked={config.cardFields.team}
        onChange={(v) => setCardFields({ team: v })}
      />

      <SectionHeader label="Card Density" />
      <SegmentControl<CardDensity>
        value={config.density}
        options={[
          { value: 'compact', label: 'Compact' },
          { value: 'default', label: 'Default' },
          { value: 'comfortable', label: 'Comfortable' },
        ]}
        onChange={(density) => setConfig({ density })}
      />

      <SectionHeader label="Layout" />
      <SegmentControl<LayoutDirection>
        value={config.direction}
        options={[
          { value: 'TB', label: 'Vertical' },
          { value: 'LR', label: 'Horizontal' },
        ]}
        onChange={(direction) => setConfig({ direction })}
      />
      <div className="mt-3 mb-1 text-xs font-semibold tracking-wide text-gray-400 uppercase">
        Sort
      </div>
      <select
        value={config.sortLayerBy}
        onChange={(e) => setConfig({ sortLayerBy: e.target.value as SortLayerBy })}
        className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-600"
      >
        <option value="none">Default</option>
        <option value="name">Name</option>
        <option value="jobRole">Job Role</option>
        <option value="jobTitle">Job Title</option>
        <option value="geo">Geo</option>
        <option value="country">Country</option>
        <option value="directReports">Direct Reports</option>
        <option value="totalReports">Total Reports</option>
      </select>

      <SectionHeader label="Max Per Row" />
      <SegmentControl<string>
        value={String(config.maxChildrenPerRow)}
        options={[
          { value: '0', label: 'Auto' },
          { value: '4', label: '4' },
          { value: '6', label: '6' },
          { value: '8', label: '8' },
        ]}
        onChange={(v) => setConfig({ maxChildrenPerRow: Number(v) })}
      />

      <SectionHeader label="Grid" />
      <Toggle
        label="Snap to Grid"
        checked={config.snapToGrid}
        onChange={(v) => setConfig({ snapToGrid: v })}
      />
    </div>
  )
}
