import { memo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Handle, Position } from '@xyflow/react'
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Users,
  MoreVertical,
  ChevronsLeftRight,
  ChevronsRightLeft,
  ChevronsUpDown,
  Plus,
  Pencil,
  Trash2,
} from 'lucide-react'
import { roleColor } from '@/lib/role-colors'
import { roleAbbreviation } from '@/lib/role-abbreviation'
import { teamColor } from '@/lib/team-colors'
import { useAppStore } from '@/store'
import { NODE_WIDTH } from '@/lib/layout-engine'
import { AddPersonDialog } from '@/components/dialogs/AddPersonDialog'
import type { PersonRecord } from '@/types/person'
import type { CardFieldToggles, LayoutDirection } from '@/store'

interface PersonNodeData extends PersonRecord {
  isManager: boolean
  hasChildren: boolean
  isExpanded: boolean
  dimmed?: boolean
  cardFields?: CardFieldToggles
  direction?: LayoutDirection
  viewRootUid?: string | null
  hiddenPeersOf?: Set<string>
  teamName?: string | null
}

interface PersonNodeProps {
  id: string
  data: PersonNodeData
  selected: boolean
}

function formatHireDate(raw: string): string {
  if (raw.length < 8) return raw
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
}

function formatTenure(raw: string): string {
  if (raw.length < 8) return ''
  const hired = new Date(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`)
  if (isNaN(hired.getTime())) return ''
  const years = Math.floor((Date.now() - hired.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
  if (years < 1) return '<1 year'
  return `${years} ${years === 1 ? 'year' : 'years'}`
}

export const PersonNode = memo(({ id, data }: PersonNodeProps) => {
  const toggleExpanded = useAppStore((s) => s.toggleExpanded)
  const setViewRoot = useAppStore((s) => s.setViewRoot)
  const togglePeerVisibility = useAppStore((s) => s.togglePeerVisibility)
  const requestDelete = useAppStore((s) => s.requestDelete)
  const isSelected = useAppStore((s) => s.ui.selectedNodeIds.has(id))
  const openMenuNodeId = useAppStore((s) => s.ui.openMenuNodeId)
  const setOpenMenu = useAppStore((s) => s.setOpenMenu)

  const menuOpen = openMenuNodeId === id
  const color = roleColor(data.jobRole)
  const abbr = roleAbbreviation(data.jobTitle)

  const [dialogMode, setDialogMode] = useState<'add' | 'edit' | null>(null)
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLButtonElement | null>(null)
  const isPlaceholder = id.startsWith('placeholder-')

  const fields = data.cardFields ?? {
    title: true,
    jobRole: false,
    location: true,
    city: false,
    hireDate: false,
    tenure: false,
    team: false,
    tags: true,
    reportCounts: true,
  }
  const direction = data.direction ?? 'TB'
  const isLR = direction === 'LR'
  const targetPos = isLR ? Position.Left : Position.Top
  const sourcePos = isLR ? Position.Right : Position.Bottom

  const isViewRoot = data.viewRootUid === id
  const isPeerHidden = data.hiddenPeersOf?.has(id) ?? false

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    setOpenMenu(null)
    requestDelete([id])
  }

  return (
    <>
      <div
        className={`relative cursor-pointer rounded-lg border-2 bg-white shadow-sm transition-shadow select-none hover:shadow-md ${isSelected ? 'border-blue-500 shadow-blue-200' : 'border-gray-200'} ${data.isManager ? 'border-l-4' : ''} `}
        onDoubleClick={(e) => {
          e.stopPropagation()
          if (data.hasChildren) toggleExpanded(id)
        }}
        style={{
          width: NODE_WIDTH,
          borderLeftColor: data.isManager ? color : undefined,
          borderLeftWidth: data.isManager ? 4 : undefined,
          opacity: data.dimmed ? 0.25 : undefined,
          transition: 'opacity 0.2s ease',
        }}
      >
        <Handle
          type="target"
          position={targetPos}
          className="!h-2 !w-2 !border-gray-400 !bg-gray-300"
        />

        {/* Role color accent bar for ICs */}
        {!data.isManager && (
          <div
            className="absolute top-0 right-0 left-0 h-1 rounded-t-lg"
            style={{ backgroundColor: color }}
          />
        )}

        {/* Context menu button */}
        <div className="absolute top-1 right-1 z-10">
          <button
            className="flex h-5 w-5 items-center justify-center rounded text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-500"
            onClick={(e) => {
              e.stopPropagation()
              setMenuAnchorEl(menuOpen ? null : e.currentTarget)
              setOpenMenu(menuOpen ? null : id)
            }}
            title="Options"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Menu dropdown — portaled to body so it floats above all ReactFlow nodes */}
        {menuOpen &&
          menuAnchorEl &&
          createPortal(
            <ContextMenuDropdown
              btnEl={menuAnchorEl}
              id={id}
              data={data}
              isViewRoot={isViewRoot}
              isPeerHidden={isPeerHidden}
              setViewRoot={setViewRoot}
              togglePeerVisibility={togglePeerVisibility}
              toggleExpanded={toggleExpanded}
              setOpenMenu={setOpenMenu}
              isPlaceholder={isPlaceholder}
              onAddReport={() => {
                setOpenMenu(null)
                setDialogMode('add')
              }}
              onEditReport={() => {
                setOpenMenu(null)
                setDialogMode('edit')
              }}
              onDelete={handleDelete}
            />,
            document.body,
          )}

        <div className="px-3 pt-2 pb-2">
          {/* Name + badge row */}
          <div className="flex items-start justify-between gap-1 pr-4">
            <div className="flex-1 truncate text-sm leading-tight font-semibold text-gray-900">
              {data.cn}
            </div>
            <span
              className="flex-shrink-0 rounded px-1.5 py-0.5 font-mono text-xs text-white"
              style={{ backgroundColor: color }}
              title={data.jobTitle}
            >
              {abbr}
            </span>
          </div>

          {/* Job title */}
          {fields.title && (
            <div className="mt-0.5 truncate text-xs text-gray-500" title={data.jobTitle}>
              {data.jobTitle || '—'}
            </div>
          )}

          {/* Job role */}
          {fields.jobRole && (
            <div className="mt-0.5 truncate text-xs text-gray-400" title={data.jobRole}>
              {data.jobRole || '—'}
            </div>
          )}

          {/* Location (geo · country) */}
          {fields.location && (
            <div className="mt-0.5 truncate text-xs text-gray-400">
              {data.geo} · {data.co}
            </div>
          )}

          {/* City */}
          {fields.city && data.l && <div className="truncate text-xs text-gray-400">{data.l}</div>}

          {/* Hire date */}
          {fields.hireDate && data.hireDate && (
            <div className="truncate text-xs text-gray-400">
              Hired {formatHireDate(data.hireDate)}
            </div>
          )}

          {/* Tenure */}
          {fields.tenure && data.hireDate && (
            <div className="truncate text-xs text-gray-400">{formatTenure(data.hireDate)}</div>
          )}

          {/* Team */}
          {fields.team && data.teamId && (
            <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-400">
              <span
                className="h-2 w-2 flex-shrink-0 rounded-full"
                style={{ backgroundColor: teamColor(data.teamId) }}
              />
              <span className="truncate">{data.teamName ?? data.teamId}</span>
            </div>
          )}

          {/* Tags (up to 2 visible) */}
          {fields.tags &&
            data.yamlRoles &&
            data.yamlRoles.length > 0 &&
            (() => {
              const uniqueTags = [...new Set(data.yamlRoles)]
              return (
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {uniqueTags.slice(0, 2).map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700"
                      title={tag}
                    >
                      {tag}
                    </span>
                  ))}
                  {uniqueTags.length > 2 && (
                    <span
                      className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700"
                      title={uniqueTags.slice(2).join(', ')}
                    >
                      +{uniqueTags.length - 2}
                    </span>
                  )}
                </div>
              )
            })()}

          {/* Report counts — managers only */}
          {fields.reportCounts && data.isManager && (
            <div className="mt-1 flex items-center justify-end gap-1 text-xs text-gray-500">
              <Users className="h-3 w-3" />
              <span>{data.directReports.toLocaleString()}</span>
              <span className="text-gray-300">/</span>
              <span>{data.totalReports.toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* Expand/collapse toggle — bottom-center in TB, right-center in LR */}
        {data.hasChildren && (
          <button
            className={`absolute z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 bg-white shadow-sm hover:bg-gray-50 ${
              isLR ? 'top-1/2 -right-3 -translate-y-1/2' : '-bottom-3 left-1/2 -translate-x-1/2'
            }`}
            onClick={(e) => {
              e.stopPropagation()
              toggleExpanded(id)
            }}
          >
            {isLR ? (
              data.isExpanded ? (
                <ChevronRight className="h-3 w-3 text-gray-500" />
              ) : (
                <ChevronLeft className="h-3 w-3 text-gray-500" />
              )
            ) : data.isExpanded ? (
              <ChevronDown className="h-3 w-3 text-gray-500" />
            ) : (
              <ChevronRight className="h-3 w-3 text-gray-500" />
            )}
          </button>
        )}

        {/* Peer visibility toggle — right-center in TB, bottom-center in LR */}
        {data.managerUid !== null && (
          <button
            className={`absolute z-10 flex h-6 w-6 items-center justify-center rounded-full border bg-white shadow-sm hover:bg-gray-50 ${
              isPeerHidden ? 'border-blue-400' : 'border-gray-300'
            } ${
              isLR ? '-bottom-3 left-1/2 -translate-x-1/2' : 'top-1/2 -right-3 -translate-y-1/2'
            }`}
            title={isPeerHidden ? 'Show peers' : 'Hide peers'}
            onClick={(e) => {
              e.stopPropagation()
              togglePeerVisibility(id)
            }}
          >
            {isLR ? (
              isPeerHidden ? (
                <ChevronsUpDown className="h-3 w-3 text-blue-500" />
              ) : (
                <ChevronsUpDown className="h-3 w-3 text-gray-400" />
              )
            ) : isPeerHidden ? (
              <ChevronsLeftRight className="h-3 w-3 text-blue-500" />
            ) : (
              <ChevronsRightLeft className="h-3 w-3 text-gray-400" />
            )}
          </button>
        )}

        <Handle
          type="source"
          position={sourcePos}
          className="!h-2 !w-2 !border-gray-400 !bg-gray-300"
        />
      </div>

      {/* Add/Edit person dialog — portaled to body so it floats above all ReactFlow nodes */}
      {dialogMode &&
        createPortal(
          <AddPersonDialog
            managerUid={id}
            editPerson={dialogMode === 'edit' ? (data as PersonRecord) : undefined}
            onClose={() => setDialogMode(null)}
          />,
          document.body,
        )}
    </>
  )
})

PersonNode.displayName = 'PersonNode'

interface ContextMenuDropdownProps {
  btnEl: HTMLButtonElement
  id: string
  data: PersonNodeData
  isViewRoot: boolean
  isPeerHidden: boolean
  isPlaceholder: boolean
  setViewRoot: (uid: string | null) => void
  togglePeerVisibility: (uid: string) => void
  toggleExpanded: (nodeId: string) => void
  setOpenMenu: (nodeId: string | null) => void
  onAddReport: () => void
  onEditReport: () => void
  onDelete: (e: React.MouseEvent) => void
}

function ContextMenuDropdown({
  btnEl,
  id,
  data,
  isViewRoot,
  isPeerHidden,
  isPlaceholder,
  setViewRoot,
  togglePeerVisibility,
  toggleExpanded,
  setOpenMenu,
  onAddReport,
  onEditReport,
  onDelete,
}: ContextMenuDropdownProps) {
  const rect = btnEl.getBoundingClientRect()

  return (
    <div
      className="fixed min-w-[160px] rounded border border-gray-200 bg-white py-1 shadow-lg"
      style={{ top: rect.bottom + 2, left: rect.right - 160, zIndex: 9999 }}
    >
      {data.managerUid !== null && (
        <button
          className="w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
          onClick={(e) => {
            e.stopPropagation()
            if (isViewRoot) {
              setViewRoot(data.managerUid ?? null)
              if (!isPeerHidden) togglePeerVisibility(id)
            } else {
              setViewRoot(id)
            }
            setOpenMenu(null)
          }}
        >
          {isViewRoot ? 'Show manager' : 'Hide manager'}
        </button>
      )}
      <button
        className="w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
        onClick={(e) => {
          e.stopPropagation()
          togglePeerVisibility(id)
          setOpenMenu(null)
        }}
      >
        {isPeerHidden ? 'Show peers' : 'Hide peers'}
      </button>
      {data.hasChildren && (
        <button
          className="w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
          onClick={(e) => {
            e.stopPropagation()
            toggleExpanded(id)
            setOpenMenu(null)
          }}
        >
          {data.isExpanded ? 'Hide reports' : 'Show reports'}
        </button>
      )}

      <div className="my-1 border-t border-gray-100" />

      <button
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
        onClick={onAddReport}
      >
        <Plus className="h-3 w-3 text-gray-400" />
        Add new report
      </button>

      <button
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
        onClick={onEditReport}
      >
        <Pencil className="h-3 w-3 text-gray-400" />
        {isPlaceholder ? 'Edit card' : 'Edit'}
      </button>

      {data.managerUid !== null && (
        <button
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
          onClick={onDelete}
        >
          <Trash2 className="h-3 w-3" />
          Delete
        </button>
      )}
    </div>
  )
}
