import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import sharp from 'sharp';
import { z } from 'zod';
import { targetSchema } from './config.js';
import { target } from './steps.js';
import { layoutAnnotations, badgeTextColor } from './annotations.js';
import type { CaptureSpec, Capture, ResolvedMark, Target } from './types.js';

export const escapeXml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

export const captureSchema = z
  .object({
    title: z.string().trim().min(1),
    description: z.string().optional(),
    fullPage: z.boolean().optional(),
    focus: targetSchema.optional(),
    padding: z.number().int().min(0).max(500).optional(),
    autoLabels: z.enum(['numbers', 'letters']).optional(),
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
  if (spec.focus && spec.fullPage) throw new Error('focus and fullPage cannot be used together');
  if (spec.padding !== undefined && !spec.focus) throw new Error('padding requires a focus target');
  const labels = (spec.marks ?? []).flatMap((m) => (m.label ? [m.label] : []));
  if (new Set(labels).size !== labels.length)
    throw new Error('Reference labels must be unique within a capture');
}

export function assignLabels(spec: CaptureSpec): NonNullable<CaptureSpec['marks']> {
  const used = new Set((spec.marks ?? []).flatMap((m) => (m.label ? [m.label] : [])));
  let next = 1;
  const letters = (index: number) => {
    let label = '';
    while (index > 0) {
      index--;
      label = String.fromCharCode(65 + (index % 26)) + label;
      index = Math.floor(index / 26);
    }
    return label;
  };
  return (spec.marks ?? []).map((mark) => {
    const mode = spec.autoLabels ?? (mark.caption ? 'numbers' : undefined);
    if (!mode || mark.label) return { ...mark };
    let label: string;
    do {
      label = mode === 'numbers' ? String(next++) : letters(next++);
    } while (used.has(label));
    if (label.length > 4) throw new Error('Too many automatic reference labels');
    used.add(label);
    return { ...mark, label };
  });
}

/** Paint onto an image, leaving the application DOM untouched. */
export function overlay(width: number, height: number, marks: ResolvedMark[]): string {
  const layouts = layoutAnnotations(width, height, marks);
  const shapes = marks
    .map((m, i) => {
      const color = m.color ?? '#e11d48';
      const { box, badge, arrow } = layouts[i]!;
      const parts: string[] = [];
      if ((m.kind ?? 'box') !== 'arrow')
        parts.push(
          `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="6" fill="none" stroke="${color}" stroke-width="3"/>`,
        );
      if (arrow)
        parts.push(
          `<defs><marker id="arrow-${i}" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L10,5 L0,10 Z" fill="${color}"/></marker></defs><path d="M${arrow.from.x},${arrow.from.y} L${arrow.to.x},${arrow.to.y}" stroke="${color}" stroke-width="3" fill="none" marker-end="url(#arrow-${i})"/>`,
        );
      if (badge) {
        const x = badge.x + badge.width / 2,
          y = badge.y + badge.height / 2;
        parts.push(
          `<rect x="${badge.x}" y="${badge.y}" width="${badge.width}" height="${badge.height}" rx="17" fill="${color}" stroke="white" stroke-width="2"/><text x="${x}" y="${y}" dy=".35em" text-anchor="middle" font-family="DejaVu Sans,Arial,sans-serif" font-size="15" font-weight="bold" fill="${badgeTextColor(color)}">${escapeXml(m.label!)}</text>`,
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
  if (!/^[A-Za-z0-9_-]+$/.test(id))
    throw new Error('Screenshot ID must contain only letters, digits, underscores and hyphens');
  const labelledMarks = assignLabels(spec);
  const locators = labelledMarks.map((m) => target(page, m.target));
  const focus = spec.focus ? target(page, spec.focus) : undefined;
  if (focus) {
    await expect(focus).toHaveCount(1, { timeout: timeoutMs });
    await expect(focus).toBeVisible({ timeout: timeoutMs });
  }
  for (const locator of locators) {
    await expect(locator).toHaveCount(1, { timeout: timeoutMs });
    await expect(locator).toBeVisible({ timeout: timeoutMs });
  }
  const masks = [...globalMasks, ...(spec.masks ?? [])].map((m) => target(page, m));
  // Fail closed for misspelled privacy masks; multiple matches are intentional.
  for (const mask of masks) await expect(mask).not.toHaveCount(0, { timeout: timeoutMs });
  const documentCapture = Boolean(spec.fullPage || focus);
  if (documentCapture)
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  else if (locators[0]) await locators[0].scrollIntoViewIfNeeded();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  // Pause before measuring: screenshot fast-forwarding would move Web Animations after boundingBox.
  const paused = await page.evaluateHandle(() =>
    document.getAnimations().filter((a) => {
      if (a.playState !== 'running') return false;
      a.pause();
      return true;
    }),
  );
  const freeze = await page.addStyleTag({
    content:
      '*,*::before,*::after{animation-play-state:paused!important;caret-color:transparent!important}',
  });
  try {
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    const visual = await page.evaluate(() => ({
      width: window.visualViewport?.width ?? innerWidth,
      height: window.visualViewport?.height ?? innerHeight,
      x: window.visualViewport?.offsetLeft ?? 0,
      y: window.visualViewport?.offsetTop ?? 0,
    }));
    const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    const marks: ResolvedMark[] = [];
    for (const [i, locator] of locators.entries()) {
      const bounds = await locator.boundingBox();
      if (!bounds || bounds.width <= 0 || bounds.height <= 0)
        throw new Error('Annotation target has no visible bounds');
      marks.push({
        ...labelledMarks[i]!,
        bounds: {
          ...bounds,
          x: bounds.x + (documentCapture ? scroll.x : 0),
          y: bounds.y + (documentCapture ? scroll.y : 0),
        },
      });
    }
    const focusBounds = focus ? await focus.boundingBox() : undefined;
    let raw = await page.screenshot({
      type: 'png',
      fullPage: documentCapture,
      scale: 'css',
      animations: 'allow',
      caret: 'hide',
      mask: masks,
      maskColor: '#111827',
    });
    let { width, height } = await sharp(raw).metadata();
    if (!width || !height) throw new Error('Screenshot dimensions unavailable');
    if (!documentCapture) {
      // Mobile pages without a viewport meta tag are zoomed out in the raster.
      const sx = width / visual.width,
        sy = height / visual.height;
      for (const m of marks) {
        m.bounds = {
          x: (m.bounds.x - visual.x) * sx,
          y: (m.bounds.y - visual.y) * sy,
          width: m.bounds.width * sx,
          height: m.bounds.height * sy,
        };
      }
    }
    let crop: Capture['crop'];
    if (focus) {
      if (!focusBounds || focusBounds.width <= 0 || focusBounds.height <= 0)
        throw new Error('Focus target has no visible bounds');
      const padding = spec.padding ?? 24;
      const x = Math.max(0, Math.floor(focusBounds.x + scroll.x - padding));
      const y = Math.max(0, Math.floor(focusBounds.y + scroll.y - padding));
      const right = Math.min(
        width,
        Math.ceil(focusBounds.x + scroll.x + focusBounds.width + padding),
      );
      const bottom = Math.min(
        height,
        Math.ceil(focusBounds.y + scroll.y + focusBounds.height + padding),
      );
      if (right <= x || bottom <= y) throw new Error('Focus target lies outside screenshot');
      crop = { x, y, width: right - x, height: bottom - y };
      raw = await sharp(raw)
        .extract({ left: x, top: y, width: crop.width, height: crop.height })
        .png()
        .toBuffer();
      width = crop.width;
      height = crop.height;
      for (const mark of marks) {
        mark.bounds.x -= x;
        mark.bounds.y -= y;
      }
    }
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
      crop,
      sha256: createHash('sha256').update(annotated).digest('hex'),
      rawSha256: createHash('sha256').update(raw).digest('hex'),
    };
  } finally {
    await freeze.evaluate((element) => element.parentNode?.removeChild(element));
    await paused.evaluate((animations) =>
      animations.forEach((a) => {
        if (a.playState === 'paused') a.play();
      }),
    );
    await paused.dispose();
  }
}
