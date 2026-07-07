import {
  RotateCcw,
  RotateCw,
  Maximize2,
  Minimize2,
  Download,
  FileImage,
  FileCode,
  FileText,
  FileSpreadsheet,
  FolderOpen,
  Save,
  HardDriveDownload,
  ChevronDown,
  Pencil,
  ChevronRight,
} from 'lucide-react'
import { useAppStore } from '@/store'
import { toPng } from 'html-to-image'
import { jsPDF } from 'jspdf'
import { useRef, useState, useEffect } from 'react'
import { SearchBar } from './SearchBar'

const EXPORT_FORMATS = [
  { fmt: 'png' as const, icon: <FileImage className="h-3.5 w-3.5" />, label: 'PNG' },
  { fmt: 'svg' as const, icon: <FileCode className="h-3.5 w-3.5" />, label: 'SVG' },
  { fmt: 'pdf' as const, icon: <FileText className="h-3.5 w-3.5" />, label: 'PDF' },
  { fmt: 'csv' as const, icon: <FileSpreadsheet className="h-3.5 w-3.5" />, label: 'CSV' },
]

export function Toolbar() {
  const undo = useAppStore((s) => s.undo)
  const redo = useAppStore((s) => s.redo)
  const expandAll = useAppStore((s) => s.expandAll)
  const collapseAll = useAppStore((s) => s.collapseAll)
  const undoStack = useAppStore((s) => s.undoStack)
  const redoStack = useAppStore((s) => s.redoStack)
  const currentScenarioName = useAppStore((s) => s.currentScenarioName)
  const overlay = useAppStore((s) => s.overlay)
  const baseline = useAppStore((s) => s.baseline)
  const effectiveState = useAppStore((s) => s.effectiveState)
  const setScenarioName = useAppStore((s) => s.setScenarioName)
  const loadScenario = useAppStore((s) => s.loadScenario)
  const loadScenarioFromJson = useAppStore((s) => s.loadScenarioFromJson)
  const listScenarios = useAppStore((s) => s.listScenarios)

  // File input for loading from file
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string)
        loadScenarioFromJson(json)
      } catch {
        alert('Invalid scenario file.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // Scenario name editing
  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)

  const startEditing = () => {
    setScenarioMenuOpen(false)
    setDraftName(currentScenarioName)
    setEditingName(true)
    setTimeout(() => nameInputRef.current?.select(), 0)
  }

  const commitName = () => {
    const trimmed = draftName.trim()
    if (trimmed && trimmed !== currentScenarioName) {
      setScenarioName(trimmed)
    }
    setEditingName(false)
  }

  const onNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitName()
    else if (e.key === 'Escape') setEditingName(false)
  }

  // Scenario dropdown menu
  const [scenarioMenuOpen, setScenarioMenuOpen] = useState(false)
  const [serverScenarios, setServerScenarios] = useState<{ name: string; updatedAt: string }[]>([])
  const [showingServerList, setShowingServerList] = useState(false)
  const scenarioMenuRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!scenarioMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (scenarioMenuRef.current && !scenarioMenuRef.current.contains(e.target as Node)) {
        setScenarioMenuOpen(false)
        setShowingServerList(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [scenarioMenuOpen])

  const handleSave = () => {
    const payload = {
      name: currentScenarioName,
      baselineImportedAt: baseline?.importedAt ?? '',
      overlay,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    download(URL.createObjectURL(blob), `org-${currentScenarioName}.json`)
    setScenarioMenuOpen(false)
  }

  const handleLoadFromFile = () => {
    setScenarioMenuOpen(false)
    fileInputRef.current?.click()
  }

  const handleShowServerList = async () => {
    const list = await listScenarios()
    setServerScenarios(list)
    setShowingServerList(true)
  }

  const handleLoadFromServer = (name: string) => {
    void loadScenario(name)
    setScenarioMenuOpen(false)
    setShowingServerList(false)
  }

  // Export
  const handleExport = async (format: 'png' | 'svg' | 'pdf' | 'csv') => {
    if (format === 'csv') {
      if (!overlay || !baseline || !effectiveState) return
      const movedUids = new Set(overlay.actions.filter((a) => a.type === 'move').map((a) => a.uid))
      const csvHeader = [
        'Effective date (YYYY-MM-DD)',
        'Worker ID',
        'Name',
        'Current Manager Worker ID',
        'Current Manager Name',
        'Proposed Manager Worker ID',
        'Proposed Manager Name',
        'Old Cost Center',
        'New Cost Center',
        'Approvers',
      ]
      const rows: string[][] = []
      for (const uid of movedUids) {
        const baselinePerson = baseline.people[uid]
        const effectivePerson = effectiveState.people[uid]
        if (!baselinePerson || !effectivePerson) continue
        if (baselinePerson.managerUid === effectivePerson.managerUid) continue
        const currentMgr = baselinePerson.managerUid
          ? baseline.people[baselinePerson.managerUid]
          : null
        const proposedMgr = effectivePerson.managerUid
          ? effectiveState.people[effectivePerson.managerUid]
          : null
        rows.push([
          '',
          baselinePerson.workerId,
          baselinePerson.cn,
          currentMgr?.workerId ?? '',
          currentMgr?.cn ?? '',
          proposedMgr?.workerId ?? '',
          proposedMgr?.cn ?? '',
          baselinePerson.costCenter,
          baselinePerson.costCenter,
          '',
        ])
      }
      const csv = [csvHeader, ...rows]
        .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
        .join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      download(URL.createObjectURL(blob), `org-changes-${currentScenarioName}.csv`)
      return
    }

    const el = document.querySelector('.react-flow') as HTMLElement
    if (!el) return

    if (format === 'png' || format === 'pdf') {
      const dataUrl = await toPng(el, {
        pixelRatio: 3,
        backgroundColor: undefined,
        filter: (node) => {
          if (!(node instanceof HTMLElement)) return true
          const cl = node.classList
          return !cl.contains('react-flow__minimap') && !cl.contains('react-flow__controls')
        },
      })
      if (format === 'png') {
        download(dataUrl, `org-${currentScenarioName}.png`)
      } else {
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: 'a4' })
        const img = new Image()
        img.src = dataUrl
        await new Promise((r) => {
          img.onload = r
        })
        const pw = pdf.internal.pageSize.getWidth()
        const ph = pdf.internal.pageSize.getHeight()
        const ratio = Math.min(pw / img.width, ph / img.height)
        pdf.addImage(dataUrl, 'PNG', 0, 0, img.width * ratio, img.height * ratio)
        pdf.save(`org-${currentScenarioName}.pdf`)
      }
    } else {
      const svgEl = el.querySelector('svg')
      if (!svgEl) return
      const blob = new Blob([svgEl.outerHTML], { type: 'image/svg+xml' })
      download(URL.createObjectURL(blob), `org-${currentScenarioName}.svg`)
    }
  }

  return (
    <div className="flex h-11 flex-shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4">
      {/* App title */}
      <div className="mr-2 text-sm font-semibold whitespace-nowrap text-gray-700">
        Organization Designer
      </div>

      {/* Scenario section */}
      <div className="border-l border-gray-200 pl-3" ref={scenarioMenuRef}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleFileLoad}
        />

        {editingName ? (
          <input
            ref={nameInputRef}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitName}
            onKeyDown={onNameKeyDown}
            className="w-36 rounded border border-blue-400 bg-gray-50 px-1.5 py-0.5 text-xs text-gray-600 outline-none"
            autoFocus
          />
        ) : (
          <button
            onClick={() => setScenarioMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded border border-gray-200 px-2.5 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-50"
          >
            <FolderOpen className="h-3.5 w-3.5 text-gray-400" />
            <span className="max-w-[140px] truncate font-medium">{currentScenarioName}</span>
            <ChevronDown className="h-3 w-3 text-gray-400" />
          </button>
        )}

        {scenarioMenuOpen && (
          <div className="absolute top-11 left-auto z-50 mt-0.5 min-w-[200px] rounded border border-gray-200 bg-white shadow-lg">
            <MenuItem
              icon={<Pencil className="h-3.5 w-3.5" />}
              label="Rename"
              onClick={startEditing}
            />
            <MenuItem icon={<Save className="h-3.5 w-3.5" />} label="Save" onClick={handleSave} />
            <div className="my-1 border-t border-gray-100" />
            <MenuItem
              icon={<FolderOpen className="h-3.5 w-3.5" />}
              label="Load from file…"
              onClick={handleLoadFromFile}
            />
            {!showingServerList ? (
              <MenuItem
                icon={<HardDriveDownload className="h-3.5 w-3.5" />}
                label="Load from server…"
                suffix={<ChevronRight className="h-3 w-3 text-gray-400" />}
                onClick={handleShowServerList}
              />
            ) : serverScenarios.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-400 italic">No saved scenarios</div>
            ) : (
              <>
                <div className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-wide text-gray-400 uppercase">
                  Saved scenarios
                </div>
                {serverScenarios.map((s) => (
                  <button
                    key={s.name}
                    onClick={() => handleLoadFromServer(s.name)}
                    className="flex w-full items-center gap-2 px-4 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                  >
                    <span className="flex-1 truncate">{s.name}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="flex flex-1 justify-center px-4">
        <SearchBar />
      </div>

      {/* Expand/collapse */}
      <div className="mr-1 flex items-center gap-1 border-r border-gray-200 pr-3">
        <ToolBtn onClick={expandAll} title="Expand all" icon={<Maximize2 className="h-4 w-4" />} />
        <ToolBtn
          onClick={collapseAll}
          title="Collapse all"
          icon={<Minimize2 className="h-4 w-4" />}
        />
      </div>

      {/* Undo/redo */}
      <div className="mr-1 flex items-center gap-1 border-r border-gray-200 pr-3">
        <ToolBtn
          onClick={undo}
          disabled={undoStack.length === 0}
          title="Undo"
          icon={<RotateCcw className="h-4 w-4" />}
        />
        <ToolBtn
          onClick={redo}
          disabled={redoStack.length === 0}
          title="Redo"
          icon={<RotateCw className="h-4 w-4" />}
        />
      </div>

      {/* Export */}
      <div className="group relative">
        <button className="flex items-center gap-1.5 rounded border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
          <Download className="h-3.5 w-3.5" /> Export
        </button>
        <div className="absolute top-full right-0 z-50 hidden pt-1 group-hover:block">
          <div className="min-w-[100px] rounded border border-gray-200 bg-white shadow-lg">
            {EXPORT_FORMATS.map(({ fmt, icon, label }) => (
              <button
                key={fmt}
                onClick={() => void handleExport(fmt)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
              >
                <span className="text-gray-400">{icon}</span>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function MenuItem({
  icon,
  label,
  onClick,
  suffix,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  suffix?: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
    >
      <span className="text-gray-400">{icon}</span>
      <span className="flex-1">{label}</span>
      {suffix}
    </button>
  )
}

function ToolBtn({
  onClick,
  icon,
  title,
  disabled,
}: {
  onClick: () => void
  icon: React.ReactNode
  title: string
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {icon}
    </button>
  )
}

function download(url: string, filename: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
}
