import type { ResolvedMark } from './types.js';

export const maxMarkDistance = 2000;

type Bounds = ResolvedMark['bounds'];

/** Keep DOM evidence intact: only the annotation and its consumers use this rectangle. */
export function markedBounds({ bounds, offset, padding }: ResolvedMark): Bounds {
  if (offset === undefined && padding === undefined) return bounds;
  const x = offset?.x ?? 0,
    y = offset?.y ?? 0;
  const top = typeof padding === 'number' ? padding : (padding?.top ?? 0);
  const right = typeof padding === 'number' ? padding : (padding?.right ?? 0);
  const bottom = typeof padding === 'number' ? padding : (padding?.bottom ?? 0);
  const left = typeof padding === 'number' ? padding : (padding?.left ?? 0);
  if (
    [x, y, top, right, bottom, left].some(
      (d) => !Number.isFinite(d) || Math.abs(d) > maxMarkDistance,
    )
  )
    throw new Error(
      `Mark offset and padding must be finite screenshot distances within ±${maxMarkDistance} pixels.`,
    );
  const dx = x - left,
    dy = y - top,
    dw = left + right,
    dh = top + bottom;
  if (dx === 0 && dy === 0 && dw === 0 && dh === 0) return bounds;
  return {
    x: bounds.x + dx,
    y: bounds.y + dy,
    width: bounds.width + dw,
    height: bounds.height + dh,
  };
}

function intersects(a: Bounds, b: Bounds) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** Check explicit adjustments before drawing or accepting recorded evidence. */
export function resolveMarkedBounds(
  width: number,
  height: number,
  marks: ResolvedMark[],
): Bounds[] {
  const targets = marks.map(markedBounds);
  for (const [i, area] of targets.entries()) {
    const original = marks[i]!.bounds;
    if (area === original) continue;
    const name = 'Mark ' + (i + 1);
    if (area.width <= 0 || area.height <= 0)
      throw new Error(name + ' collapses after mark padding; use a smaller inset.');
    if (area.x < 0 || area.y < 0 || area.x + area.width > width || area.y + area.height > height)
      throw new Error(
        name +
          ' extends outside the screenshot after offset or padding; reduce the adjustment or give the capture more room.',
      );
    for (const [j, neighbor] of marks.entries()) {
      if (i === j || intersects(original, neighbor.bounds)) continue;
      if (intersects(area, neighbor.bounds) || intersects(area, targets[j]!))
        throw new Error(
          name +
            ' overlaps neighboring mark ' +
            (j + 1) +
            ' after offset or padding; reduce the adjustment or use separate captures.',
        );
    }
  }
  return targets;
}

export function markIntersectsSlice(mark: ResolvedMark, top: number, height: number) {
  const b = markedBounds(mark);
  return b.y < top + height && b.y + b.height > top;
}
