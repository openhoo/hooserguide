import { layoutAnnotations } from './annotations.js';
import type { Capture } from './types.js';

export interface ImageSlice {
  top: number;
  height: number;
}

/** Balance continuation pages and move seams away from complete annotation groups where possible. */
export function planImageSlices(capture: Capture, maxHeight: number): ImageSlice[] {
  const limit = Math.max(1, Math.floor(maxHeight));
  const layouts = layoutAnnotations(capture.width, capture.height, capture.marks);
  const ranges = layouts.map((l) => {
    const ys = [l.box.y - 3, l.box.y + l.box.height + 3];
    if (l.badge) ys.push(l.badge.y - 3, l.badge.y + l.badge.height + 3);
    if (l.arrow)
      ys.push(l.arrow.from.y - 5, l.arrow.from.y + 5, l.arrow.to.y - 5, l.arrow.to.y + 5);
    return {
      start: Math.max(0, Math.floor(Math.min(...ys))),
      end: Math.min(capture.height, Math.ceil(Math.max(...ys))),
    };
  });
  const slices: ImageSlice[] = [];
  let top = 0;
  while (top < capture.height) {
    const remaining = capture.height - top;
    if (remaining <= limit) {
      slices.push({ top, height: remaining });
      break;
    }
    const ideal = top + Math.ceil(remaining / Math.ceil(remaining / limit));
    const candidates = [ideal, top + limit, ...ranges.flatMap((r) => [r.start, r.end])]
      .filter((y) => y >= top + Math.max(1, Math.floor(limit / 3)) && y <= top + limit)
      .sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal));
    const end = candidates.find((y) => ranges.every((r) => y <= r.start || y >= r.end)) ?? ideal;
    slices.push({ top, height: end - top });
    top = end;
  }
  return slices;
}
