import type { EdgeProps } from '@xyflow/react'

export function OrgChartEdge({ sourceX, sourceY, targetX, targetY, style, data }: EdgeProps) {
  const edgeData = data as {
    direction?: string
    gridBusPos?: number
    highlighted?: boolean
  }
  const isLR = edgeData?.direction === 'LR'

  let d: string
  if (edgeData?.gridBusPos != null && isLR) {
    const busX = edgeData.gridBusPos
    d = `M${sourceX},${sourceY} H${busX} V${targetY} H${targetX}`
  } else if (edgeData?.gridBusPos != null && !isLR) {
    const busY = edgeData.gridBusPos
    d = `M${sourceX},${sourceY} V${busY} H${targetX} V${targetY}`
  } else if (isLR) {
    const midX = (sourceX + targetX) / 2
    d = `M${sourceX},${sourceY} H${midX} V${targetY} H${targetX}`
  } else {
    const midY = (sourceY + targetY) / 2
    d = `M${sourceX},${sourceY} V${midY} H${targetX} V${targetY}`
  }

  const highlighted = edgeData?.highlighted === true
  const stroke = highlighted ? '#2563eb' : ((style?.stroke as string) ?? '#94a3b8')
  const strokeWidth = highlighted ? 2.5 : ((style?.strokeWidth as number) ?? 1.5)

  return <path d={d} fill="none" stroke={stroke} strokeWidth={strokeWidth} />
}
