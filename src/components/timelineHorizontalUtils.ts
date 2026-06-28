import { yearLength } from '../calendar'
import type { Calendar, TimelineEvent } from '../db'

export function fitView(
  events: TimelineEvent[],
  width: number,
  displayCal: Calendar | null,
): { scale: number; offsetAbs: number } {
  if (!events.length) return { scale: 0.001, offsetAbs: 0 }
  const minAbs = Math.min(...events.map((e) => e.startAbsolute))
  const maxAbs = Math.max(...events.map((e) => e.endAbsolute ?? e.startAbsolute))
  const range = Math.max(maxAbs - minAbs, displayCal ? yearLength(displayCal) * 10 : 3650)
  const w = Math.max(width - 80, 200)
  return { scale: w / range, offsetAbs: minAbs - range * 0.05 }
}
