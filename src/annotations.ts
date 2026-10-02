import type { ResolvedMark } from './types.js';

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Point {
  x: number;
  y: number;
}
export interface AnnotationLayout {
  box: Rectangle;
  badge?: Rectangle;
  arrow?: { from: Point; to: Point };
}
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const overlap = (a: Rectangle, b: Rectangle) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

/** Keep reference text readable even with a pale custom mark color. */
export function badgeTextColor(color: string): '#142636' | '#ffffff' {
  const channels = [1, 3, 5]
    .map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const luminance = channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  return 1.05 / (luminance + 0.05) >= 4.5 ? '#ffffff' : '#142636';
}

/** Shared geometry for raster overlays and PDF page boundaries. */
export function layoutAnnotations(
  width: number,
  height: number,
  marks: ResolvedMark[],
): AnnotationLayout[] {
  const placed: Rectangle[] = [];
  return marks.map((mark) => {
    const b = mark.bounds;
    let left = 5,
      right = 5,
      above = 5,
      below = 5;
    const clearance = (gap: number) => Math.max(0, (gap - 3) / 2);
    for (const other of marks) {
      if (other === mark) continue;
      const t = other.bounds;
      if (t.x < b.x + b.width && t.x + t.width > b.x) {
        if (t.y >= b.y + b.height) below = Math.min(below, clearance(t.y - b.y - b.height));
        if (t.y + t.height <= b.y) above = Math.min(above, clearance(b.y - t.y - t.height));
      }
      if (t.y < b.y + b.height && t.y + t.height > b.y) {
        if (t.x >= b.x + b.width) right = Math.min(right, clearance(t.x - b.x - b.width));
        if (t.x + t.width <= b.x) left = Math.min(left, clearance(b.x - t.x - t.width));
      }
    }
    const x = clamp(b.x - left, 1.5, width - 1.5),
      y = clamp(b.y - above, 1.5, height - 1.5);
    const box = {
      x,
      y,
      width: Math.max(0, Math.min(width - 1.5, b.x + b.width + right) - x),
      height: Math.max(0, Math.min(height - 1.5, b.y + b.height + below) - y),
    };
    const badgeWidth = Math.max(34, (mark.label?.length ?? 1) * 11 + 14),
      badgeHeight = 34;
    if (mark.label && (width < badgeWidth + 4 || height < badgeHeight + 4))
      throw new Error('Screenshot is too small for a reference label; increase focus padding');
    const cx = b.x + b.width / 2,
      cy = b.y + b.height / 2;
    const gapX = badgeWidth / 2 + 10,
      gapY = badgeHeight / 2 + 10;
    const sides =
      cx > width / 2 ? [b.x - gapX, b.x + b.width + gapX] : [b.x + b.width + gapX, b.x - gapX];
    const candidates: Point[] =
      (mark.kind ?? 'box') === 'box'
        ? [
            { x: b.x - gapX, y: b.y + badgeHeight / 2 },
            { x: b.x + b.width + gapX, y: b.y + badgeHeight / 2 },
          ]
        : sides.flatMap((x) => [
            { x, y: b.y - 60 },
            { x, y: cy },
            { x, y: b.y + b.height + 60 },
          ]);
    candidates.push(
      { x: cx, y: b.y - gapY },
      { x: cx, y: b.y + b.height + gapY },
      ...sides.flatMap((x) => [
        { x, y: b.y - gapY },
        { x, y: b.y + b.height + gapY },
      ]),
    );
    if (mark.from && mark.kind !== 'box') candidates.unshift(mark.from);
    let best: Rectangle | undefined,
      bestScore = Infinity;
    for (const p of candidates) {
      const rect = {
        x: clamp(p.x - badgeWidth / 2, 2, Math.max(2, width - badgeWidth - 2)),
        y: clamp(p.y - badgeHeight / 2, 2, Math.max(2, height - badgeHeight - 2)),
        width: badgeWidth,
        height: badgeHeight,
      };
      const padded = {
        x: rect.x - 3,
        y: rect.y - 3,
        width: rect.width + 6,
        height: rect.height + 6,
      };
      const score =
        marks.reduce((n, m) => n + overlap(padded, m.bounds), 0) +
        placed.reduce((n, r) => n + 4 * overlap(padded, r), 0);
      if (score < bestScore) {
        best = rect;
        bestScore = score;
      }
      if (!score) break;
    }
    const badge = best!;
    if (mark.label) placed.push(badge);
    let arrow: AnnotationLayout['arrow'];
    if (mark.kind === 'arrow' || mark.kind === 'both') {
      const from = mark.from ?? { x: badge.x + badge.width / 2, y: badge.y + badge.height / 2 };
      const dx = from.x - cx,
        dy = from.y - cy;
      const factor = Math.max(
        Math.abs(dx) / (b.width / 2 + 5),
        Math.abs(dy) / (b.height / 2 + 5),
        1,
      );
      arrow = {
        from,
        to: { x: clamp(cx + dx / factor, 2, width - 2), y: clamp(cy + dy / factor, 2, height - 2) },
      };
    }
    return { box, badge: mark.label ? badge : undefined, arrow };
  });
}
