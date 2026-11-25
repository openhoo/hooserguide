import type { Point, Rectangle } from './annotations.js';
import type { ResolvedMark } from './types.js';

export const leaderDefaults = {
  side: 'auto',
  length: 72,
  width: 2,
  headSize: 9,
  head: 'filled',
} as const;

export interface LeaderArrow {
  from: Point;
  to: Point;
  base: Point;
  left: Point;
  right: Point;
  width: number;
  head: 'open' | 'filled';
}

interface LeaderLayout {
  badge: Rectangle;
  arrow: LeaderArrow;
}

const sides = ['right', 'left', 'top', 'bottom'] as const;
type Side = (typeof sides)[number];
type Axis = keyof Point;
const badgeRadius = 17;
const badgeGuard = 2;
const targetGap = 5;
const epsilon = 1e-6;
export const leaderOutlineRadius = 2;

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const offset = (p: Point, direction: Point, distance: number): Point => ({
  x: p.x + direction.x * distance,
  y: p.y + direction.y * distance,
});
const expand = (r: Rectangle, pad: number): Rectangle => ({
  x: r.x - pad,
  y: r.y - pad,
  width: r.width + 2 * pad,
  height: r.height + 2 * pad,
});
const overlaps = (a: Rectangle, b: Rectangle) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const rectSize = (r: Rectangle, axis: Axis) => (axis === 'x' ? r.width : r.height);
const orientation = (a: Point, b: Point, c: Point) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const fits = (r: Rectangle, width: number, height: number) =>
  r.x >= -epsilon &&
  r.y >= -epsilon &&
  r.x + r.width <= width + epsilon &&
  r.y + r.height <= height + epsilon;

/** A leader's optional outline cannot be clamped inward over the target. */
export function layoutLeaderOutline(
  width: number,
  height: number,
  mark: ResolvedMark,
  blocked: readonly Rectangle[],
  badges: readonly Rectangle[],
) {
  const guard = (mark.leader?.width ?? leaderDefaults.width) / 2 + 1;
  const obstacles = [...blocked, ...badges.map((badge) => expand(badge, badgeGuard))];
  // A little extra room keeps the inward curve of a 2px corner outside the target.
  const insideGuard = guard + 1;
  for (const gap of new Set([Math.max(5, insideGuard), insideGuard])) {
    const box = expand(mark.bounds, gap);
    const outer = expand(box, guard);
    if (!fits(outer, width, height)) continue;
    const { x, y, width: w, height: h } = outer;
    const edge = guard + insideGuard;
    const bands = [
      { x, y, width: w, height: edge },
      { x, y: y + h - edge, width: w, height: edge },
      { x, y, width: edge, height: h },
      { x: x + w - edge, y, width: edge, height: h },
    ];
    if (!bands.some((band) => obstacles.some((r) => overlaps(band, r)))) return { box, bands };
  }
  throw new Error(
    `Leader ${mark.label ?? ''} cannot fit an outline without covering a target or reference; use kind "arrow" or increase focus padding.`,
  );
}

function extent(points: Point[], pad: number): Rectangle {
  const x = Math.min(...points.map((point) => point.x));
  const y = Math.min(...points.map((point) => point.y));
  return expand(
    {
      x,
      y,
      width: Math.max(...points.map((point) => point.x)) - x,
      height: Math.max(...points.map((point) => point.y)) - y,
    },
    pad,
  );
}

/** Includes stroke and antialiasing room for fit checks and PDF slice boundaries. */
export function leaderExtent({ from, to, left, right, width }: LeaderArrow): Rectangle {
  return extent([from, to, left, right], width / 2 + 1);
}

/** Distance from the label center to its capsule rim along a unit vector. */
function badgeDistance({ x, y }: Point, halfWidth: number) {
  const dx = Math.abs(x);
  const dy = Math.abs(y);
  const straight = halfWidth - badgeRadius;
  if (dy && (badgeRadius * dx) / dy <= straight) return badgeRadius / dy;
  const along = straight * dx;
  return along + Math.sqrt(badgeRadius ** 2 - (straight * dy) ** 2);
}

type Segment = { from: Point; to: Point; pad: number };
type Triangle = [Point, Point, Point];

function paint(arrow: LeaderArrow) {
  const { from, to, base, left, right, width, head } = arrow;
  const filled = head === 'filled';
  const pad = width / 2 + 1;
  const triangle: Triangle | undefined = filled ? [left, right, to] : undefined;
  const segments: Segment[] = [
    { from, to: filled ? base : to, pad },
    { from: left, to, pad: filled ? 1 : pad },
    { from: right, to, pad: filled ? 1 : pad },
    ...(filled ? [{ from: left, to: right, pad: 1 }] : []),
  ];
  return { segments, triangle };
}

function contains([a, b, c]: Triangle, p: Point) {
  const s = [orientation(a, b, p), orientation(b, c, p), orientation(c, a, p)];
  return s.every((n) => n >= 0) || s.every((n) => n <= 0);
}

function segmentHitsRectangle({ from, to, pad }: Segment, r: Rectangle) {
  let enter = 0;
  let exit = 1;
  for (const axis of ['x', 'y'] as const) {
    const lo = r[axis] - pad;
    const hi = r[axis] + rectSize(r, axis) + pad;
    const delta = to[axis] - from[axis];
    if (!delta) {
      if (from[axis] < lo || from[axis] > hi) return false;
      continue;
    }
    const t1 = (lo - from[axis]) / delta;
    const t2 = (hi - from[axis]) / delta;
    enter = Math.max(enter, Math.min(t1, t2));
    exit = Math.min(exit, Math.max(t1, t2));
    if (enter > exit) return false;
  }
  return true;
}

function paintHitsRectangle({ segments, triangle }: ReturnType<typeof paint>, r: Rectangle) {
  return (
    segments.some((segment) => segmentHitsRectangle(segment, r)) ||
    Boolean(triangle && contains(triangle, { x: r.x, y: r.y }))
  );
}

function distanceSquared(p: Point, { from, to }: Segment) {
  const x = to.x - from.x;
  const y = to.y - from.y;
  const t = clamp(((p.x - from.x) * x + (p.y - from.y) * y) / (x * x + y * y), 0, 1);
  return (p.x - from.x - t * x) ** 2 + (p.y - from.y - t * y) ** 2;
}

function segmentsTouch(a: Segment, b: Segment) {
  if (
    orientation(a.from, a.to, b.from) * orientation(a.from, a.to, b.to) < 0 &&
    orientation(b.from, b.to, a.from) * orientation(b.from, b.to, a.to) < 0
  )
    return true;
  return (
    Math.min(
      distanceSquared(a.from, b),
      distanceSquared(a.to, b),
      distanceSquared(b.from, a),
      distanceSquared(b.to, a),
    ) <=
    (a.pad + b.pad) ** 2
  );
}

function paintsTouch(a: ReturnType<typeof paint>, b: ReturnType<typeof paint>) {
  return (
    a.segments.some((sa) => b.segments.some((sb) => segmentsTouch(sa, sb))) ||
    Boolean(a.triangle && b.segments.some((s) => contains(a.triangle!, s.from))) ||
    Boolean(b.triangle && a.segments.some((s) => contains(b.triangle!, s.from)))
  );
}

export function layoutLeader({
  width,
  height,
  mark,
  blocked,
  badges,
  badgeObstacles = [],
  otherLeaders = [],
}: {
  width: number;
  height: number;
  mark: ResolvedMark;
  blocked: readonly Rectangle[];
  badges: readonly Rectangle[];
  badgeObstacles?: readonly Rectangle[];
  otherLeaders?: readonly LeaderArrow[];
}): LeaderLayout {
  const label = mark.label;
  if (!label)
    throw new Error('A leader needs a reference label. Add label, autoLabels, or a caption.');
  const side = mark.leader?.side ?? leaderDefaults.side;
  const length = mark.leader?.length ?? leaderDefaults.length;
  const headSize = mark.leader?.headSize ?? leaderDefaults.headSize;
  const stroke = mark.leader?.width ?? leaderDefaults.width;
  const head = mark.leader?.head ?? leaderDefaults.head;
  const b = mark.bounds;
  const halfWidth = Math.max(34, label.length * 16 + 16) / 2;
  const blockedBadges = badges.map((badge) => expand(badge, badgeGuard));
  const obstacles = [b, ...blocked, ...blockedBadges];
  const previousPaint = otherLeaders.map(paint);
  function candidate(nearest: Point, outward: Point, distance: number, center?: Point) {
    if (distance < headSize + 2 - epsilon) return undefined;
    const to = offset(nearest, outward, targetGap);
    const from = offset(to, outward, distance);
    const base = offset(to, outward, headSize);
    const cross = { x: -outward.y, y: outward.x };
    const arrow: LeaderArrow = {
      from,
      to,
      base,
      left: offset(base, cross, headSize / 2),
      right: offset(base, cross, -headSize / 2),
      width: stroke,
      head,
    };
    const at = center ?? offset(from, outward, badgeDistance(outward, halfWidth));
    const badge: Rectangle = {
      x: at.x - halfWidth,
      y: at.y - badgeRadius,
      width: 2 * halfWidth,
      height: 2 * badgeRadius,
    };
    const badgePaint = expand(badge, badgeGuard);
    if (!fits(badgePaint, width, height) || !fits(leaderExtent(arrow), width, height))
      return undefined;
    const newPaint = paint(arrow);
    if (
      obstacles.some((r) => overlaps(badgePaint, r) || paintHitsRectangle(newPaint, r)) ||
      badgeObstacles.some((r) => overlaps(badgePaint, r)) ||
      previousPaint.some((p) => paintHitsRectangle(p, badgePaint) || paintsTouch(newPaint, p))
    )
      return undefined;
    return { badge, arrow };
  }

  if (mark.from) {
    if (mark.leader?.side !== undefined || mark.leader?.length !== undefined)
      throw new Error('Use either from or leader.side/length to place a leader.');
    const nearest = {
      x: clamp(mark.from.x, b.x, b.x + b.width),
      y: clamp(mark.from.y, b.y, b.y + b.height),
    };
    const dx = mark.from.x - nearest.x;
    const dy = mark.from.y - nearest.y;
    const distance = Math.hypot(dx, dy);
    if (distance) {
      const unit = { x: dx / distance, y: dy / distance };
      const result = candidate(
        nearest,
        unit,
        distance - targetGap - badgeDistance(unit, halfWidth),
        mark.from,
      );
      if (result) return result;
    }
    throw new Error(
      `Leader ${label} cannot fit at from; move the badge to a clear position or increase focus padding.`,
    );
  }

  function edge(position: Side) {
    const horizontal = position === 'left' || position === 'right';
    const positive = position === 'right' || position === 'bottom';
    const tangent: Axis = horizontal ? 'y' : 'x';
    const normal: Axis = horizontal ? 'x' : 'y';
    const line = b[normal] + (positive ? rectSize(b, normal) : 0);
    const outward = horizontal ? { x: positive ? 1 : -1, y: 0 } : { x: 0, y: positive ? 1 : -1 };
    const room = positive ? (horizontal ? width : height) - line : line;
    const point = (t: number) => (horizontal ? { x: line, y: t } : { x: t, y: line });
    return { tangent, point, outward, room };
  }

  const choices = (side === 'auto' ? [...sides] : [side]).map(edge).sort((a, b) => b.room - a.room);
  const candidates = choices.map(({ tangent, ...e }) => {
    const first = b[tangent];
    const last = first + rectSize(b, tangent);
    const middle = (first + last) / 2;
    const half = tangent === 'x' ? halfWidth : badgeRadius;
    const lo = Math.max(first, half + badgeGuard);
    const hi = Math.min(last, (tangent === 'x' ? width : height) - half - badgeGuard);
    const available = lo <= hi;
    const positions = new Set<number>();
    const add = (n: number) => positions.add(clamp(n, lo, hi));
    if (available) {
      for (const n of [middle, lo, hi, (3 * lo + hi) / 4, (lo + 3 * hi) / 4]) add(n);
      // When an adjacent mark blocks the midpoint, try just beyond its edges.
      for (const r of [...obstacles, ...badgeObstacles, ...otherLeaders.map(leaderExtent)]) {
        for (const pad of [half + badgeGuard, headSize / 2 + stroke / 2 + 1, stroke / 2 + 1]) {
          add(r[tangent] - pad - epsilon);
          add(r[tangent] + rectSize(r, tangent) + pad + epsilon);
        }
      }
    }
    return {
      ...e,
      tangent,
      first,
      last,
      positions: [...positions].sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle)),
    };
  });

  // Prefer a centered straight leader, then try offsets on the same target edge.
  for (const middleOnly of [true, false]) {
    for (const { point, positions, outward } of candidates) {
      for (const t of middleOnly ? positions.slice(0, 1) : positions.slice(1)) {
        const result = candidate(point(t), outward, length);
        if (result) return result;
      }
    }
  }
  // Near a corner, a slanted leader keeps the badge outside the requested side.
  for (const { tangent, point, first, last, outward } of candidates) {
    for (const angle of [Math.PI / 12, Math.PI / 8, Math.PI / 5, Math.PI / 4]) {
      for (const sign of [-1, 1]) {
        const direction = offset(
          { x: outward.x * Math.cos(angle), y: outward.y * Math.cos(angle) },
          tangent === 'x' ? { x: sign, y: 0 } : { x: 0, y: sign },
          Math.sin(angle),
        );
        const result = candidate(point(sign < 0 ? first : last), direction, length);
        if (result) return result;
      }
    }
  }

  const area = side === 'auto' ? 'around the target' : `on the ${side} side`;
  throw new Error(
    `Leader ${label} cannot fit ${area} at length ${length}; try a shorter length, another side, or more focus padding.`,
  );
}
