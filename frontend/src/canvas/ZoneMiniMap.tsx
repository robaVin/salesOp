import {
  MiniMap,
  Panel,
  getNodesBounds,
  useReactFlow,
  useStore,
  type Node,
  type ReactFlowState,
} from '@xyflow/react'
import { TriangleAlert } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import type { NoteNodeData } from './NoteNode'
import type { NoteRecord, NoteType } from '../types'
import {
  ZONE_COLORS,
  ZONE_LABELS,
  ZONE_ORDER,
  isAtRiskAccount,
  minimapZoneColor,
  zoneOf,
  type ZoneKey,
} from './zones'

/** Fallback dot colors for node types outside the zone taxonomy (pre-existing palette). */
const FALLBACK_COLORS: Partial<Record<NoteType, string>> = {
  daily_briefing: '#f59e0b',
  command_center: '#0f172a',
  task: '#64748b',
  general_note: '#94a3b8',
  box: '#a8a29e',
  search: '#06b6d4',
  ai_assistant: '#8b5cf6',
  inbox: '#f97316',
  settings: '#64748b',
  voice_note: '#ec4899',
  screenshot: '#14b8a6',
  meeting: '#f43f5e',
  capture: '#d946ef',
  email: '#eab308',
}

function noteOf(n: Node): NoteRecord | undefined {
  return (n.data as NoteNodeData | undefined)?.note
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  }
}

// Must match the <MiniMap> defaults so the overlay viewBox lines up exactly.
const MINIMAP_WIDTH = 200
const MINIMAP_HEIGHT = 150
const MINIMAP_OFFSET_SCALE = 5

const selectWidth = (s: ReactFlowState) => s.width
const selectHeight = (s: ReactFlowState) => s.height
const selectTransform = (s: ReactFlowState) => s.transform
const selectNodes = (s: ReactFlowState) => s.nodes

/**
 * Draws a border + label around each zone's bounds, aligned 1:1 with the
 * minimap underneath. Replicates the MiniMap viewBox computation
 * (node bounds unioned with the viewport, centered, offset padding) so the
 * two SVGs share the same coordinate mapping.
 */
function ZoneBordersOverlay() {
  const rf = useReactFlow()
  const flowWidth = useStore(selectWidth)
  const flowHeight = useStore(selectHeight)
  const transform = useStore(selectTransform)
  // Subscribed only to re-render when nodes move/resize; data is read via rf.
  useStore(selectNodes)

  const rfNodes = rf.getNodes()
  if (rfNodes.length === 0 || flowWidth === 0 || flowHeight === 0) return null

  const viewBB: Rect = {
    x: -transform[0] / transform[2],
    y: -transform[1] / transform[2],
    width: flowWidth / transform[2],
    height: flowHeight / transform[2],
  }
  const boundingRect = unionRect(getNodesBounds(rfNodes), viewBB)

  const viewScale = Math.max(
    boundingRect.width / MINIMAP_WIDTH,
    boundingRect.height / MINIMAP_HEIGHT
  )
  const offset = MINIMAP_OFFSET_SCALE * viewScale
  const vbX = boundingRect.x - (viewScale * MINIMAP_WIDTH - boundingRect.width) / 2 - offset
  const vbY = boundingRect.y - (viewScale * MINIMAP_HEIGHT - boundingRect.height) / 2 - offset
  const vbW = viewScale * MINIMAP_WIDTH + offset * 2
  const vbH = viewScale * MINIMAP_HEIGHT + offset * 2

  const byZone = new Map<ZoneKey, Node[]>()
  for (const n of rfNodes) {
    const note = noteOf(n)
    const zone = note ? zoneOf(note) : null
    if (!zone) continue
    const list = byZone.get(zone)
    if (list) list.push(n)
    else byZone.set(zone, [n])
  }
  if (byZone.size === 0) return null

  const pad = 10 * viewScale
  const fontSize = 9 * viewScale

  return (
    <svg
      width={MINIMAP_WIDTH}
      height={MINIMAP_HEIGHT}
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      style={{ display: 'block', pointerEvents: 'none' }}
    >
      {ZONE_ORDER.filter((z) => byZone.has(z)).map((zone) => {
        const b = getNodesBounds(byZone.get(zone)!)
        const color = ZONE_COLORS[zone]
        return (
          <g key={zone}>
            <rect
              x={b.x - pad}
              y={b.y - pad}
              width={b.width + pad * 2}
              height={b.height + pad * 2}
              rx={8 * viewScale}
              fill={color}
              fillOpacity={0.07}
              stroke={color}
              strokeOpacity={0.75}
              strokeWidth={1.25 * viewScale}
              strokeDasharray={`${5 * viewScale} ${3 * viewScale}`}
            />
            {/* Label sits inside the padded border band so it never clips
                at the edge of the minimap viewBox. */}
            <text
              x={b.x - pad + 4 * viewScale}
              y={b.y - pad + fontSize + 2 * viewScale}
              fontSize={fontSize}
              fontWeight={700}
              fill={color}
              style={{ textTransform: 'uppercase', letterSpacing: 0.5 * viewScale }}
            >
              {ZONE_LABELS[zone]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

interface ZoneMiniMapProps {
  notes: NoteRecord[]
}

/**
 * The top-right minimap, upgraded into a zone navigator:
 * dots are colored by zone, clicking a zone region flies the viewport
 * to that zone's bounds, and a legend below shows live per-zone counts.
 */
export function ZoneMiniMap({ notes }: ZoneMiniMapProps) {
  const rf = useReactFlow()

  const zoneCounts = useMemo(() => {
    const counts = new Map<ZoneKey, number>()
    let atRisk = 0
    for (const note of notes) {
      const zone = zoneOf(note)
      if (!zone) continue
      counts.set(zone, (counts.get(zone) ?? 0) + 1)
      if (isAtRiskAccount(note)) atRisk += 1
    }
    return { counts, atRisk }
  }, [notes])

  const nodeColor = useCallback((n: Node) => {
    const note = noteOf(n)
    if (!note) return '#94a3b8'
    return minimapZoneColor(note) ?? FALLBACK_COLORS[note.node_type] ?? '#94a3b8'
  }, [])

  const flyToZone = useCallback(
    (zone: ZoneKey) => {
      const members = rf.getNodes().filter((n) => {
        const note = noteOf(n)
        return note ? zoneOf(note) === zone : false
      })
      if (members.length === 0) return
      void rf.fitView({
        nodes: members.map((n) => ({ id: n.id })),
        duration: 500,
        padding: 0.2,
      })
    },
    [rf]
  )

  const onMiniMapClick = useCallback(
    (_event: React.MouseEvent, position: { x: number; y: number }) => {
      const byZone = new Map<ZoneKey, Node[]>()
      for (const n of rf.getNodes()) {
        const note = noteOf(n)
        const zone = note ? zoneOf(note) : null
        if (!zone) continue
        const list = byZone.get(zone)
        if (list) list.push(n)
        else byZone.set(zone, [n])
      }
      if (byZone.size === 0) return

      // Prefer the zone whose bounds contain the click; among those (or if
      // the click lands in empty space), pick the nearest zone centroid.
      const CONTAINS_BONUS = 1e9
      let best: ZoneKey | null = null
      let bestScore = Infinity
      for (const [zone, members] of byZone) {
        const b = getNodesBounds(members)
        const inside =
          position.x >= b.x &&
          position.x <= b.x + b.width &&
          position.y >= b.y &&
          position.y <= b.y + b.height
        const cx = b.x + b.width / 2
        const cy = b.y + b.height / 2
        const score =
          Math.hypot(position.x - cx, position.y - cy) - (inside ? CONTAINS_BONUS : 0)
        if (score < bestScore) {
          bestScore = score
          best = zone
        }
      }
      if (best) flyToZone(best)
    },
    [rf, flyToZone]
  )

  return (
    <>
      <MiniMap
        position="top-right"
        pannable
        zoomable
        nodeColor={nodeColor}
        onClick={onMiniMapClick}
      />
      {/* Zone borders drawn over the minimap. Same corner + same default
          panel margin as the MiniMap panel, so the two SVGs overlap 1:1.
          pointer-events none keeps minimap pan/zoom/click intact. */}
      <Panel position="top-right" style={{ pointerEvents: 'none' }}>
        <ZoneBordersOverlay />
      </Panel>
      {/* Default minimap is 150px tall with a 15px panel margin; offset the
          legend so it sits just below it in the same corner. */}
      <Panel position="top-right" style={{ marginTop: 172 }}>
        <div className="w-[200px] rounded-xl border border-slate-200 bg-white/95 p-1.5 shadow-sm backdrop-blur">
          {ZONE_ORDER.map((zone) => {
            const count = zoneCounts.counts.get(zone) ?? 0
            return (
              <button
                key={zone}
                type="button"
                onClick={() => flyToZone(zone)}
                disabled={count === 0}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-[11px] text-slate-700 hover:bg-slate-50 disabled:cursor-default disabled:opacity-40"
                title={count === 0 ? 'No notes in this zone' : `Fly to ${ZONE_LABELS[zone]}`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: ZONE_COLORS[zone] }}
                />
                <span className="flex-1 truncate font-medium">{ZONE_LABELS[zone]}</span>
                {zone === 'accounts' && zoneCounts.atRisk > 0 ? (
                  <span className="flex items-center gap-0.5 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                    <TriangleAlert size={9} />
                    {zoneCounts.atRisk}
                  </span>
                ) : null}
                <span className="tabular-nums font-semibold text-slate-500">{count}</span>
              </button>
            )
          })}
        </div>
      </Panel>
    </>
  )
}
