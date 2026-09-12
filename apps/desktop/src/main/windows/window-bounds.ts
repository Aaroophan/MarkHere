import type { Display, Rectangle } from 'electron'

export interface WindowBoundsInput {
  readonly x?: number
  readonly y?: number
  readonly width?: number
  readonly height?: number
}

const DEFAULT_WIDTH = 1200
const DEFAULT_HEIGHT = 800
const MIN_WIDTH = 760
const MIN_HEIGHT = 520

function intersects(a: Rectangle, b: Rectangle): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

export function clampWindowBounds(input: WindowBoundsInput | undefined, displays: readonly Display[]): Rectangle {
  const primary = displays[0]?.workArea ?? { x: 0, y: 0, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }
  const width = Math.min(Math.max(input?.width ?? DEFAULT_WIDTH, MIN_WIDTH), primary.width)
  const height = Math.min(Math.max(input?.height ?? DEFAULT_HEIGHT, MIN_HEIGHT), primary.height)
  const proposed: Rectangle = {
    x: input?.x ?? primary.x + Math.max(0, Math.floor((primary.width - width) / 2)),
    y: input?.y ?? primary.y + Math.max(0, Math.floor((primary.height - height) / 2)),
    width,
    height
  }

  const visibleDisplay = displays.find((display) => intersects(proposed, display.workArea))
  const workArea = visibleDisplay?.workArea ?? primary
  return {
    width: Math.min(width, workArea.width),
    height: Math.min(height, workArea.height),
    x: Math.min(Math.max(proposed.x, workArea.x), workArea.x + workArea.width - Math.min(width, workArea.width)),
    y: Math.min(Math.max(proposed.y, workArea.y), workArea.y + workArea.height - Math.min(height, workArea.height))
  }
}
