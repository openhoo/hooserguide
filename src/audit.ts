import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { z } from 'zod';
import { inspectRun, readRunArtifact } from './evidence.js';
import { executionStepKind } from './steps.js';
import { readerCopyIssues, uncheckedInteraction } from './reader-review.js';
import type { Capture } from './types.js';

// Indices refer to report.json (and inspect_capture), including separate responsive executions.
const locationSchema = z.object({
  chapter: z.number().int().positive().optional(),
  capture: z.number().int().positive().optional(),
  mark: z.number().int().positive().optional(),
  step: z.number().int().positive().optional(),
  source: z.string().optional(),
  line: z.number().int().positive().optional(),
  profile: z.string().optional(),
  field: z.string().optional(),
});
type Location = z.infer<typeof locationSchema>;
const rules = {
  RUN_FAILED: [
    'error',
    'This run did not produce a successful guide.',
    'Inspect the first failed step or export error before using the guide.',
  ],
  LEGACY_RAW: [
    'warning',
    'The original screenshot has no recorded hash.',
    'Inspect the masked original and disclose the missing hash.',
  ],
  DRAFT_COPY: [
    'warning',
    'Reader text contains a draft marker.',
    'Replace the placeholder or confirm the literal text belongs in this guide.',
  ],
  SELECTOR_COPY: [
    'warning',
    'Reader text contains what looks like an automation selector.',
    'Use the visible control name unless the selector is part of the task.',
  ],
  MISSING_OUTCOME: [
    'warning',
    'This chapter has no recorded assertion or custom verification step.',
    'Check the visible outcome with a Then assertion. A capture alone only records what was on screen.',
  ],
  UNCHECKED_ACTION: [
    'warning',
    'No later assertion follows the final recorded interaction.',
    'Add an assertion for the result the reader should see, or narrow the claim.',
  ],
  NO_INSTRUCTION: [
    'warning',
    'This chapter has no reader instruction.',
    'Check whether the introduction alone explains the task; otherwise add an I explain step.',
  ],
  EMPTY_LEGEND: [
    'warning',
    'The reference badge has no legend text.',
    'Add a mark caption that names the control and explains what it does.',
  ],
  REPEATED_FIGURE: [
    'warning',
    'This exact annotated PNG appears earlier in the same chapter.',
    'Compare both figures; remove a redundant capture or show the intended state change.',
  ],
  PDF_FILE_MISSING: [
    'error',
    'There is a PDF layout record but no handbook.pdf.',
    'Restore the matching PDF or rebuild the guide before offering the PDF.',
  ],
  PDF_FILE_INVALID: [
    'error',
    'The PDF is missing its file signature or end marker.',
    'Rebuild the PDF from the verified run and open the result.',
  ],
  PDF_HASH_MISMATCH: [
    'error',
    'The PDF differs from the one that produced this layout record.',
    'Restore the matching PDF and layout record, or rebuild both from the verified run.',
  ],
  PDF_LAYOUT_MISSING: [
    'warning',
    'The PDF has no layout record.',
    'Inspect the rendered PDF and disclose that its slice coverage could not be checked.',
  ],
  PDF_LAYOUT_INVALID: [
    'error',
    'The PDF layout record is unreadable or inconsistent with the captures.',
    'Rebuild the exports from the verified run and inspect the regenerated PDF.',
  ],
  PDF_RENDER_WARNING: [
    'warning',
    'The PDF renderer recorded a layout warning.',
    'Open the warning in pdf-layout.json and check the affected rendered pages.',
  ],
  PDF_UNMARKED_SLICE: [
    'warning',
    'A PDF figure part contains none of this figure’s marked controls.',
    'Check whether the extra context helps the reader. Focus on the relevant panel if it does not.',
  ],
  PDF_SPLIT_TARGET: [
    'warning',
    'A PDF slice boundary passes through a marked control.',
    'Inspect both continuation pages. If the control is hard to follow, use a focused capture or adjust the page layout.',
  ],
} as const;
type Rule = keyof typeof rules;
const ruleCodes = Object.keys(rules) as [Rule, ...Rule[]];
const findingSchema = locationSchema.extend({
  code: z.enum(ruleCodes),
  severity: z.enum(['error', 'warning']),
  message: z.string(),
  hint: z.string(),
});
export const auditSchema = z.object({
  runId: z.string(),
  runStatus: z.enum(['passed', 'failed']),
  visualReview: z.literal('required'),
  chapters: z.number().int(),
  captures: z.number().int(),
  verifiedImages: z.number().int(),
  legacyRawWithoutHash: z.number().int(),
  pdf: z.boolean(),
  pdfHashVerified: z.boolean(),
  layoutPages: z.number().int().positive().optional(),
  errors: z.number().int(),
  warnings: z.number().int(),
  findings: z.array(findingSchema),
});
export type AuditReport = z.infer<typeof auditSchema>;

const layoutSchema = z.object({
  pdfSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  pages: z.number().int().positive(),
  warnings: z.array(z.string()),
  figures: z.array(
    z.object({
      id: z.string(),
      slices: z
        .array(
          z.object({ top: z.number().int().nonnegative(), height: z.number().int().positive() }),
        )
        .min(1),
    }),
  ),
});
type Figure = { shot: Capture; at: Location };
type Add = (code: Rule, at?: Location, detail?: string) => void;

async function reviewLayout(
  directory: string,
  pdfHash: string,
  figures: Map<string, Figure>,
  add: Add,
) {
  let bytes: Buffer;
  try {
    bytes = await readRunArtifact(directory, 'pdf-layout.json');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    add('PDF_LAYOUT_MISSING');
    return;
  }
  let layout: z.infer<typeof layoutSchema>;
  try {
    layout = layoutSchema.parse(JSON.parse(bytes.toString('utf8')));
  } catch {
    add('PDF_LAYOUT_INVALID');
    return;
  }
  const hashVerified = layout.pdfSha256 === pdfHash;
  if (layout.pdfSha256 && !hashVerified) {
    add('PDF_HASH_MISMATCH');
    return;
  }
  if (layout.warnings.length)
    add(
      'PDF_RENDER_WARNING',
      { field: 'pdf-layout.json:warnings' },
      `Warnings: ${layout.warnings.length}.`,
    );
  const seen = new Set<string>();
  for (const { id, slices } of layout.figures) {
    const entry = figures.get(id);
    if (!entry || seen.has(id)) {
      add('PDF_LAYOUT_INVALID', entry?.at, 'Unknown or repeated figure ID.');
      continue;
    }
    seen.add(id);
    let end = 0;
    const continuous = slices.every(({ top, height }) => {
      if (top !== end) return false;
      end += height;
      return true;
    });
    if (!continuous || end !== entry.shot.height) {
      add(
        'PDF_LAYOUT_INVALID',
        entry.at,
        'The slices do not cover the recorded image exactly once.',
      );
      continue;
    }
    if (slices.length > 1 && entry.shot.marks.length) {
      let unmarked = 0;
      let first = 0;
      for (const [index, slice] of slices.entries()) {
        const hasTarget = entry.shot.marks.some(
          ({ bounds }) =>
            bounds.y < slice.top + slice.height && bounds.y + bounds.height > slice.top,
        );
        if (!hasTarget) {
          if (!unmarked) first = index + 1;
          unmarked++;
        }
      }
      if (unmarked)
        add(
          'PDF_UNMARKED_SLICE',
          entry.at,
          `First affected part: ${first}/${slices.length}; ${unmarked} without a target.`,
        );
    }
    for (const [m, mark] of entry.shot.marks.entries()) {
      const seam = slices.find(
        ({ top }) => top > mark.bounds.y && top < mark.bounds.y + mark.bounds.height,
      );
      if (seam)
        add('PDF_SPLIT_TARGET', { ...entry.at, mark: m + 1 }, `Cut at image row ${seam.top}.`);
    }
  }
  for (const [id, entry] of figures)
    if (!seen.has(id)) add('PDF_LAYOUT_INVALID', entry.at, 'Figure missing from layout record.');
  return { pages: layout.pages, hashVerified };
}

/** Check existing run evidence and reader copy. Does not open the application or render a PDF. */
export async function auditRun(directory: string): Promise<AuditReport> {
  const run = await inspectRun(directory);
  const findings: AuditReport['findings'] = [];
  const add: Add = (code, at = {}, detail) => {
    const [severity, message, hint] = rules[code];
    findings.push({
      ...at,
      code,
      severity,
      message: detail ? message + ' ' + detail : message,
      hint,
    });
  };
  // Do not echo excerpts: a copy defect can contain private application data.
  const copy = (value: string | undefined, field: string, at: Location = {}) => {
    for (const issue of readerCopyIssues(value)) add(issue, { ...at, field });
  };
  const figures = new Map<string, Figure>();
  if (run.report.status === 'failed') add('RUN_FAILED');
  copy(run.report.title, 'title');
  for (const [key, value] of Object.entries(run.report.branding ?? {}))
    copy(value, 'branding.' + key);
  for (const [key, value] of Object.entries(run.report.document ?? {}))
    copy(value, 'document.' + key);
  for (const [c, chapter] of run.report.chapters.entries()) {
    const at = {
      chapter: c + 1,
      source: basename(chapter.source.replaceAll('\\', '/')),
      line: chapter.location?.line,
      profile: chapter.variant?.profile ?? run.report.profile,
    };
    if (!chapter.instructions.some((text) => text.trim())) add('NO_INSTRUCTION', at);
    if (chapter.status === 'passed') {
      const steps = chapter.steps.map((step) => ({
        ...step,
        kind: step.kind ?? executionStepKind(step.text),
      }));
      const index = uncheckedInteraction(steps);
      if (index !== undefined)
        add('UNCHECKED_ACTION', {
          ...at,
          step: index + 1,
          line: chapter.steps[index]?.location?.line,
        });
      else if (!steps.some((s) => s.kind === 'assertion' || s.kind === 'custom'))
        add('MISSING_OUTCOME', at);
    }
    copy(chapter.title, 'title', at);
    copy(chapter.description, 'description', at);
    chapter.instructions.forEach((text, i) => copy(text, `instruction ${i + 1}`, at));
    chapter.prerequisites?.forEach((text, i) => copy(text, `prerequisite ${i + 1}`, at));
    chapter.callouts?.forEach(({ text }, i) => copy(text, `callout ${i + 1}`, at));
    const annotated = new Map<string, number>();
    for (const [i, shot] of chapter.captures.entries()) {
      const here = {
        ...at,
        capture: i + 1,
        step: shot.step,
        line: shot.step ? chapter.steps[shot.step - 1]?.location?.line : at.line,
      };
      figures.set(shot.id, { shot, at: here });
      if (!shot.rawSha256) add('LEGACY_RAW', here);
      const first = annotated.get(shot.sha256);
      if (first !== undefined) add('REPEATED_FIGURE', here, `First shown in capture ${first}.`);
      else annotated.set(shot.sha256, i + 1);
      copy(shot.title, 'title', here);
      copy(shot.description, 'description', here);
      for (const [m, mark] of shot.marks.entries()) {
        const where = { ...here, mark: m + 1 };
        if (mark.label && !mark.caption?.trim()) add('EMPTY_LEGEND', where);
        copy(mark.caption, 'caption', where);
      }
    }
  }
  const pdf = Boolean(run.artifacts.pdf);
  let layout;
  if (pdf) {
    const bytes = await readRunArtifact(run.directory, 'handbook.pdf', 64 * 1024 * 1024);
    if (
      !bytes.subarray(0, 5).equals(Buffer.from('%PDF-')) ||
      !/%%EOF\s*$/.test(bytes.subarray(-1024).toString('latin1'))
    )
      add('PDF_FILE_INVALID');
    layout = await reviewLayout(
      run.directory,
      createHash('sha256').update(bytes).digest('hex'),
      figures,
      add,
    );
  } else if (run.report.status === 'passed') {
    try {
      await readRunArtifact(run.directory, 'pdf-layout.json');
      add('PDF_FILE_MISSING');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  const errors = findings.filter((f) => f.severity === 'error').length;
  return {
    runId: run.runId,
    runStatus: run.report.status,
    visualReview: 'required',
    chapters: run.report.chapters.length,
    captures: figures.size,
    verifiedImages: run.verifiedImages,
    legacyRawWithoutHash: run.legacyRawWithoutHash,
    pdf,
    layoutPages: layout?.pages,
    pdfHashVerified: layout?.hashVerified ?? false,
    errors,
    warnings: findings.length - errors,
    findings,
  };
}

export function formatAudit(report: AuditReport): string {
  const lines = [
    `${report.runId}: ${report.chapters} execution chapter(s), ${report.captures} capture(s), ${report.verifiedImages} verified image hash(es).`,
    `Audit: ${report.errors} error(s), ${report.warnings} warning(s). Visual review required.`,
  ];
  for (const f of report.findings) {
    const location = [
      f.source && (f.line ? `${f.source}:${f.line}` : f.source),
      f.profile,
      f.chapter && `chapter ${f.chapter}`,
      f.capture && `capture ${f.capture}`,
      f.step && `step ${f.step}`,
      f.mark && `mark ${f.mark}`,
      f.field,
    ]
      .filter(Boolean)
      .join(' · ');
    lines.push(
      `${f.severity} ${f.code}${location ? ' (' + location + ')' : ''}: ${f.message}\n  ${f.hint}`,
    );
  }
  return lines.join('\n');
}
