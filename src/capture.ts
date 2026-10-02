import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import sharp from 'sharp';
import { z } from 'zod';
import { targetSchema } from './config.js';
import { target } from './steps.js';
import type { CaptureSpec, Capture, ResolvedMark, Target } from './types.js';

export const escapeXml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export const captureSchema = z
  .object({
    title: z.string().trim().min(1),
    description: z.string().optional(),
    fullPage: z.boolean().optional(),
    masks: z.array(targetSchema).optional(),
    marks: z
      .array(
        z
          .object({
            target: targetSchema,
            kind: z.enum(['box', 'arrow', 'both']).optional(),
            label: z
              .string()
              .regex(/^[A-Za-z0-9]{1,4}$/)
              .optional(),
            caption: z.string().optional(),
            color: z
              .string()
              .regex(/^#[0-9a-f]{6}$/i)
              .optional(),
            from: z
              .object({ x: z.number().nonnegative(), y: z.number().nonnegative() })
              .strict()
              .optional(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

export function validateCapture(spec: CaptureSpec): void {
  captureSchema.parse(spec);
}

/** Paint onto an image, leaving the application DOM untouched. */
export function overlay(width: number, height: number, marks: ResolvedMark[]): string {
  const shapes = marks
    .map((m, i) => {
      const color = m.color ?? '#e11d48';
      const kind = m.kind ?? 'box';
      const b = m.bounds;
      const x = clamp(b.x - 5, 2, width - 2),
        y = clamp(b.y - 5, 2, height - 2);
      const w = clamp(b.width + 10, 0, width - x - 2),
        h = clamp(b.height + 10, 0, height - y - 2);
      const parts: string[] = [];
      if (kind !== 'arrow')
        parts.push(
          `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="none" stroke="${color}" stroke-width="3"/>`,
        );
      let badgeX = clamp(x - 22, 20, width - 20),
        badgeY = clamp(y + 18, 20, height - 20);
      if (kind !== 'box') {
        const cx = b.x + b.width / 2,
          cy = b.y + b.height / 2;
        const right = b.x + b.width + 80,
          left = b.x - 80;
        const candidates = (cx > width / 2 ? [left, right] : [right, left]).flatMap((px) => [
          { x: px, y: b.y - 60 },
          { x: px, y: cy },
          { x: px, y: b.y + b.height + 60 },
        ]);
        const origin =
          candidates.find(
            (p) =>
              p.x >= 24 &&
              p.x < width - 24 &&
              p.y >= 24 &&
              p.y < height - 24 &&
              marks.every((other) => {
                const t = other.bounds;
                return (
                  p.x < t.x - 24 ||
                  p.x > t.x + t.width + 24 ||
                  p.y < t.y - 24 ||
                  p.y > t.y + t.height + 24
                );
              }),
          ) ?? candidates[0]!;
        const fx = m.from?.x ?? origin.x;
        const fy = m.from?.y ?? origin.y;
        const sx = clamp(fx, 24, width - 24),
          sy = clamp(fy, 24, height - 24);
        const dx = sx - cx,
          dy = sy - cy;
        const distance = Math.max(
          Math.abs(dx) / (b.width / 2 + 6),
          Math.abs(dy) / (b.height / 2 + 6),
          1,
        );
        const ex = clamp(cx + dx / distance, 2, width - 2),
          ey = clamp(cy + dy / distance, 2, height - 2);
        parts.push(
          `<defs><marker id="arrow-${i}" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L10,5 L0,10 Z" fill="${color}"/></marker></defs><path d="M${sx},${sy} L${ex},${ey}" stroke="${color}" stroke-width="3" fill="none" marker-end="url(#arrow-${i})"/>`,
        );
        badgeX = sx;
        badgeY = sy;
      }
      if (m.label) {
        const radius = m.label.length > 2 ? 23 : 17;
        badgeX = clamp(badgeX, radius + 2, width - radius - 2);
        badgeY = clamp(badgeY, radius + 2, height - radius - 2);
        parts.push(
          `<circle cx="${badgeX}" cy="${badgeY}" r="${radius}" fill="${color}" stroke="white" stroke-width="2"/><text x="${badgeX}" y="${badgeY + 5}" text-anchor="middle" font-family="DejaVu Sans,Arial,sans-serif" font-size="15" font-weight="bold" fill="white">${escapeXml(m.label)}</text>`,
        );
      }
      return parts.join('');
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${shapes}</svg>`;
}

export async function captureScreenshot(
  page: Page,
  spec: CaptureSpec,
  directory: string,
  id: string,
  globalMasks: Target[] = [],
  timeoutMs = 10000,
): Promise<Capture> {
  validateCapture(spec);
  const locators = (spec.marks ?? []).map((m) => target(page, m.target));
  for (const locator of locators) {
    await expect(locator).toHaveCount(1, { timeout: timeoutMs });
    await expect(locator).toBeVisible({ timeout: timeoutMs });
  }
  const masks = [...globalMasks, ...(spec.masks ?? [])].map((m) => target(page, m));
  // Fail closed for misspelled privacy masks; multiple matches are intentional.
  for (const mask of masks) await expect(mask).not.toHaveCount(0, { timeout: timeoutMs });
  if (spec.fullPage) await page.evaluate(() => window.scrollTo(0, 0));
  else if (locators[0]) await locators[0].scrollIntoViewIfNeeded();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  // Coordinate discovery and screenshot both use animations disabled.
  const freeze = await page.addStyleTag({
    content:
      '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}',
  });
  try {
    const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    const marks: ResolvedMark[] = [];
    for (const [i, locator] of locators.entries()) {
      const bounds = await locator.boundingBox();
      if (!bounds || bounds.width <= 0 || bounds.height <= 0)
        throw new Error('Annotation target has no visible bounds');
      marks.push({
        ...spec.marks![i]!,
        bounds: {
          ...bounds,
          x: bounds.x + (spec.fullPage ? scroll.x : 0),
          y: bounds.y + (spec.fullPage ? scroll.y : 0),
        },
      });
    }
    const raw = await page.screenshot({
      type: 'png',
      fullPage: spec.fullPage ?? false,
      scale: 'css',
      animations: 'disabled',
      caret: 'hide',
      mask: masks,
      maskColor: '#111827',
    });
    const { width, height } = await sharp(raw).metadata();
    if (!width || !height) throw new Error('Screenshot dimensions unavailable');
    for (const m of marks) {
      const b = m.bounds;
      if (b.x < 0 || b.y < 0 || b.x + b.width > width + 1 || b.y + b.height > height + 1)
        throw new Error('Annotation target lies outside screenshot; scroll or use fullPage');
      if (m.from && (m.from.x < 0 || m.from.y < 0 || m.from.x >= width || m.from.y >= height))
        throw new Error('Arrow origin lies outside screenshot');
    }
    const svg = overlay(width, height, marks);
    const annotated = await sharp(raw)
      .composite([{ input: Buffer.from(svg) }])
      .png()
      .toBuffer();
    const image = `screenshots/${id}.png`,
      rawPath = `screenshots/${id}.raw.png`;
    await mkdir(join(directory, 'screenshots'), { recursive: true });
    await writeFile(join(directory, rawPath), raw);
    await writeFile(join(directory, image), annotated);
    await writeFile(join(directory, `screenshots/${id}.overlay.svg`), svg);
    return {
      id,
      title: spec.title,
      description: spec.description,
      image,
      raw: rawPath,
      width,
      height,
      marks,
      sha256: createHash('sha256').update(annotated).digest('hex'),
    };
  } finally {
    await freeze.evaluate((element) => element.parentNode?.removeChild(element));
  }
}
