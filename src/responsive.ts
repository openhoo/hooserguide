import sharp from 'sharp';
import { readRunArtifact } from './evidence.js';
import type { Chapter, RunReport, ScreenVariant } from './types.js';

/** Group only recorded executions of the same scenario; never infer mobile evidence from a desktop image. */
export function presentationChapters(report: RunReport): (Chapter & { variants: Chapter[] })[] {
  if (!report.responsive)
    return report.chapters.map((chapter) => ({ ...chapter, variants: [chapter] }));
  const groups = new Map<number, Chapter[]>();
  for (const chapter of report.chapters) {
    const key = chapter.variant!.scenario;
    groups.set(key, [...(groups.get(key) ?? []), chapter]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, variants]) => {
      variants.sort(
        (a, b) =>
          report.responsive!.profiles.indexOf(a.variant!.profile) -
          report.responsive!.profiles.indexOf(b.variant!.profile),
      );
      return { ...variants[0]!, variants };
    });
}
export function screenLabel(variant: ScreenVariant): string {
  return `${variant.label} · ${variant.viewport.width} × ${variant.viewport.height} CSS px`;
}
export function screenLayout(report: RunReport) {
  return report.manual?.screenLayout ?? report.responsive?.layout ?? 'side-by-side';
}
/** Shared instructions apply to every listed screen, even when another screen differs. */
export function guidanceGroups(variants: Chapter[]) {
  const groups = new Map<string, Chapter[]>();
  for (const variant of variants) {
    const key = JSON.stringify([
      variant.description,
      variant.prerequisites ?? [],
      variant.callouts ?? [],
      variant.instructions,
    ]);
    const members = groups.get(key);
    if (members) members.push(variant);
    else groups.set(key, [variant]);
  }
  return [...groups.values()].map((members) => ({
    chapter: members[0]!,
    label: groups.size > 1 ? members.map((v) => screenLabel(v.variant!)).join(' / ') : '',
  }));
}
/** A non-cropped overview. Full-size, annotation-aware detail pages remain available in PDF. */
export async function comparisonImage(
  variants: Chapter[],
  captureIndex: number,
  directory: string,
) {
  const cellWidth = 600,
    cellHeight = 700,
    gap = 24;
  const inputs = await Promise.all(
    variants.map(async (chapter, i) => ({
      input: await sharp(
        await readRunArtifact(directory, chapter.captures[captureIndex]!.image, 64 * 1024 * 1024),
      )
        .resize(cellWidth, cellHeight, { fit: 'contain', position: 'top', background: '#ffffff' })
        .png()
        .toBuffer(),
      left: i * (cellWidth + gap),
      top: 0,
    })),
  );
  const width = variants.length * cellWidth + (variants.length - 1) * gap;
  return {
    bytes: await sharp({
      create: { width, height: cellHeight, channels: 3, background: '#ffffff' },
    })
      .composite(inputs)
      .png()
      .toBuffer(),
    width,
    height: cellHeight,
  };
}
