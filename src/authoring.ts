import { glob } from 'node:fs/promises';
import parseTagExpression from '@cucumber/tag-expressions';
import { z } from 'zod';
import { resolveConfig } from './config.js';
import { parseFeature } from './gherkin.js';
import { loadRegistry } from './runner.js';
import { validateStepArguments } from './preflight.js';
import { builtinSteps } from './steps.js';
import type { Config } from './types.js';

const locationSchema = z.object({
  source: z.string(),
  line: z.number().int(),
  column: z.number().int(),
});
export const diagnosticSchema = locationSchema.extend({
  severity: z.enum(['error', 'warning']),
  code: z.string(),
  message: z.string(),
  hint: z.string(),
  scenario: z.string().optional(),
  suggestions: z.array(z.string()).optional(),
});
export const authoringSchema = z.object({
  valid: z.boolean(),
  executed: z.literal(false),
  selection: z.object({
    tagExpression: z.string().optional(),
    scenario: z.string().optional(),
    profiles: z.array(z.string()),
  }),
  diagnostics: z.array(diagnosticSchema),
  chapters: z.array(
    locationSchema.extend({
      title: z.string(),
      feature: z.string(),
      description: z.string(),
      tags: z.array(z.string()),
      selected: z.boolean(),
      steps: z.number().int(),
      instructions: z.array(z.string()),
      prerequisites: z.array(z.string()),
      assertions: z.number().int(),
      captures: z.array(
        locationSchema.extend({
          title: z.string(),
          description: z.string(),
          marks: z.number().int(),
          masks: z.number().int(),
        }),
      ),
    }),
  ),
  totals: z.object({
    files: z.number().int(),
    chapters: z.number().int(),
    selected: z.number().int(),
    executions: z.number().int(),
    captures: z.number().int(),
    errors: z.number().int(),
    warnings: z.number().int(),
  }),
});
export type AuthoringReport = z.infer<typeof authoringSchema>;
export type AuthoringDiagnostic = z.infer<typeof diagnosticSchema>;

function isAssertion(step: { text: string; type?: string }): boolean {
  try {
    builtinSteps().resolve(step.text);
    return /^(?:"(?:[^"\\]|\\.)*" (?:is |has |contains text )|the URL is |the page title is )/.test(
      step.text,
    );
  } catch {
    return step.type === 'Outcome'; // A custom Then binding can assert app state.
  }
}

/** Rank documented bindings without guessing user selectors or executing a handler. */
export function suggestSteps(text: string, examples: string[]): string[] {
  const words = (value: string) =>
    value
      .replace(/"(?:[^"\\]|\\.)*"/g, ' ARG ')
      .toLowerCase()
      .match(/[a-z]+/g) ?? [];
  const input = new Set(words(text));
  const distance = (a: string, b: string) => {
    let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const next = [i];
      for (let j = 1; j <= b.length; j++)
        next[j] = Math.min(
          next[j - 1]! + 1,
          previous[j]! + 1,
          previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
        );
      previous = next;
    }
    return previous[b.length]!;
  };
  const normalized = words(text).join(' ');
  return examples
    .map((example) => {
      const candidate = new Set(words(example));
      const overlap = [...input].filter((word) => candidate.has(word)).length;
      const phrase = words(example).join(' ');
      const similarity =
        1 - distance(normalized, phrase) / Math.max(normalized.length, phrase.length, 1);
      return {
        example,
        score:
          (0.4 * overlap) / Math.max(new Set([...input, ...candidate]).size, 1) + 0.6 * similarity,
      };
    })
    .filter((item) => item.score > 0.2)
    .sort((a, b) => b.score - a.score || a.example.localeCompare(b.example))
    .slice(0, 3)
    .map((item) => item.example);
}

/** Read-only editorial review. This is a plan, never application evidence. */
export async function lint(input: Config): Promise<AuthoringReport> {
  const config = resolveConfig(input);
  const registry = await loadRegistry(config);
  const examples = registry.list().flatMap((step) => (step.example ? [step.example] : []));
  const profiles = config.responsive?.profiles ?? [config.profile ?? 'default'];
  const report: AuthoringReport = {
    valid: true,
    executed: false,
    selection: {
      tagExpression: config.tagExpression ?? config.tag,
      scenario: config.scenario,
      profiles,
    },
    diagnostics: [],
    chapters: [],
    totals: {
      files: 0,
      chapters: 0,
      selected: 0,
      executions: 0,
      captures: 0,
      errors: 0,
      warnings: 0,
    },
  };
  const diagnose = (diagnostic: AuthoringDiagnostic) => report.diagnostics.push(diagnostic);
  const files = new Set<string>();
  for (const pattern of config.features) {
    let found = false;
    for await (const path of glob(pattern)) {
      files.add(path);
      found = true;
    }
    if (!found)
      diagnose({
        source: pattern,
        line: 1,
        column: 1,
        severity: 'error',
        code: 'NO_FILES',
        message: 'No feature files match this pattern.',
        hint: 'Check features relative to the config file.',
      });
  }
  const tags = parseTagExpression(config.tagExpression ?? config.tag ?? '');
  for (const source of [...files].sort()) {
    let feature: Awaited<ReturnType<typeof parseFeature>>;
    try {
      feature = await parseFeature(source);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      diagnose({
        source,
        line: Number(/:(\d+):/.exec(message)?.[1] ?? 1),
        column: 1,
        severity: 'error',
        code: 'GHERKIN_SYNTAX',
        message,
        hint: 'Repair Gherkin syntax; other files are still reviewed.',
      });
      continue;
    }
    for (const pickle of feature.pickles) {
      // Outlines reference the scenario then the Examples row. Keep the row as chapter location.
      const at = (ids: readonly string[], last = false) => {
        const node = (last ? [...ids].reverse() : ids)
          .map((id) => feature.nodes.get(id))
          .find(Boolean);
        return { source, line: node?.line ?? 1, column: node?.column ?? 1 };
      };
      const chapter = {
        ...at(pickle.astNodeIds, true),
        title: pickle.name,
        feature: feature.feature,
        description:
          pickle.astNodeIds.map((id) => feature.nodes.get(id)?.description).find(Boolean) ??
          feature.description,
        tags: pickle.tags.map((tag) => tag.name),
        selected:
          tags.evaluate(pickle.tags.map((tag) => tag.name)) &&
          (!config.scenario || pickle.name.toLowerCase().includes(config.scenario.toLowerCase())),
        steps: pickle.steps.length,
        instructions: [] as string[],
        prerequisites: [] as string[],
        assertions: pickle.steps.filter(isAssertion).length,
        captures: [] as AuthoringReport['chapters'][number]['captures'],
      };
      report.chapters.push(chapter);
      const add = (
        code: string,
        message: string,
        hint: string,
        severity: 'error' | 'warning' = 'warning',
        location = at(pickle.astNodeIds, true),
        suggestions?: string[],
      ) => {
        if (chapter.selected)
          diagnose({
            ...location,
            scenario: pickle.name,
            code,
            message,
            hint,
            severity,
            ...(suggestions?.length ? { suggestions } : {}),
          });
      };
      if (!pickle.steps.length)
        add(
          'EMPTY_SCENARIO',
          'Chapter has no steps.',
          'Add navigation, instructions, assertions and a capture.',
          'error',
        );
      for (const step of pickle.steps) {
        const location = at(step.astNodeIds);
        try {
          if (chapter.selected) registry.resolve(step.text);
        } catch (error) {
          add(
            String(error).includes('Ambiguous') ? 'AMBIGUOUS_STEP' : 'UNDEFINED_STEP',
            error instanceof Error ? error.message : String(error),
            'Use a documented phrase from hooserguide steps or register a trusted plugin.',
            'error',
            location,
            suggestSteps(step.text, examples),
          );
          continue;
        }
        try {
          if (chapter.selected) validateStepArguments(step, config);
        } catch (error) {
          add(
            'STEP_ARGUMENT',
            error instanceof Error ? error.message : String(error),
            'Correct the quoted value, docstring or table before running.',
            'error',
            location,
          );
        }
        const quoted = /^(?:I explain|I add a prerequisite) (".*")$/.exec(step.text);
        if (quoted) {
          try {
            const value = JSON.parse(quoted[1]!) as string;
            (step.text.startsWith('I explain') ? chapter.instructions : chapter.prerequisites).push(
              value,
            );
            if (!value.trim())
              add(
                'EMPTY_PROSE',
                'Reader-facing text is empty.',
                'Write a concrete instruction or prerequisite.',
                'error',
                location,
              );
          } catch {
            /* Quoting diagnosed above. */
          }
        }
        if (step.text === 'I explain:' && step.argument?.docString)
          chapter.instructions.push(step.argument.docString.content);
        if (step.text.startsWith('I capture ')) {
          let spec: { description?: string; marks?: unknown[]; masks?: unknown[] } = {};
          let title = step.text.slice(10);
          try {
            title = JSON.parse(title);
            const parsed = step.argument?.docString
              ? JSON.parse(step.argument.docString.content)
              : {};
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) spec = parsed;
          } catch {
            /* Keep the figure in the outline even when its arguments need fixing. */
          }
          chapter.captures.push({
            ...location,
            title,
            description: typeof spec.description === 'string' ? spec.description : '',
            marks: Array.isArray(spec.marks) ? spec.marks.length : 0,
            masks:
              (config.masks?.length ?? 0) + (Array.isArray(spec.masks) ? spec.masks.length : 0),
          });
          if (!spec.description?.trim?.())
            add(
              'CAPTURE_DESCRIPTION',
              'Figure has no reader-facing description.',
              'Describe what the screenshot shows and which reference matters.',
              'warning',
              location,
            );
        }
      }
      if (!chapter.captures.length) {
        const custom = pickle.steps.some((step) => {
          try {
            builtinSteps().resolve(step.text);
            return false;
          } catch {
            return true;
          }
        });
        add(
          'MISSING_CAPTURE',
          custom
            ? 'Chapter has no built-in capture; a plugin may supply screenshots.'
            : 'Chapter has no screenshot; generation would fail.',
          custom
            ? 'Add a built-in capture or review the plugin capture behavior during execution.'
            : 'Add I capture "A descriptive figure title".',
          custom ? 'warning' : 'error',
        );
      }
      if (!chapter.instructions.length)
        add(
          'MISSING_INSTRUCTION',
          'Chapter has no reader-facing instructions.',
          'Add I explain "..." or a multiline I explain: docstring.',
        );
      if (!chapter.assertions)
        add(
          'MISSING_OUTCOME',
          'Chapter has no outcome assertion.',
          'Assert the saved result using Then; a screenshot alone does not verify it.',
        );
      if (!chapter.description.trim())
        add(
          'MISSING_DESCRIPTION',
          'Chapter has no introduction.',
          'Add prose beneath Scenario: or Feature: before the first step.',
        );
      if (
        /\b(TODO|FIXME|REPLACE_ME)\b|<your[^>]*>/i.test(
          [chapter.title, chapter.description, ...chapter.instructions].join('\n'),
        )
      )
        add(
          'PLACEHOLDER',
          'Chapter contains unfinished placeholder prose.',
          'Replace placeholder text with the actual task and app labels.',
        );
      const previous = report.chapters
        .slice(0, -1)
        .find((item) => item.selected && item.title === chapter.title);
      if (previous)
        add(
          'DUPLICATE_TITLE',
          'Another selected chapter has this title.',
          'Use distinct task titles, including Outline example values.',
        );
    }
  }
  const selected = report.chapters.filter((chapter) => chapter.selected);
  if (!selected.length)
    diagnose({
      source: config.features[0]!,
      line: 1,
      column: 1,
      severity: 'error',
      code: 'NO_SELECTION',
      message: 'No chapters selected.',
      hint: 'Check tag expressions and scenario filters; excluded chapters appear in the outline.',
    });
  report.totals = {
    files: files.size,
    chapters: report.chapters.length,
    selected: selected.length,
    executions: selected.length * profiles.length,
    captures:
      selected.reduce((total, chapter) => total + chapter.captures.length, 0) * profiles.length,
    errors: report.diagnostics.filter((d) => d.severity === 'error').length,
    warnings: report.diagnostics.filter((d) => d.severity === 'warning').length,
  };
  report.valid = report.totals.errors === 0;
  return report;
}

export function formatDiagnostics(report: AuthoringReport): string {
  return [
    ...report.diagnostics.map(
      (d) =>
        `${d.source}:${d.line}:${d.column}: ${d.severity} ${d.code}: ${d.message.replace(/\s+/g, ' ')}\n  ${d.hint}${d.suggestions?.length ? '\n  Try: ' + d.suggestions.join(' | ') : ''}`,
    ),
    `${report.totals.selected} selected chapters · ${report.totals.executions} planned executions · ${report.totals.errors} errors · ${report.totals.warnings} warnings. No app actions executed.`,
  ].join('\n');
}

export function formatOutline(report: AuthoringReport): string {
  const md = (value: string) => value.replace(/[\\`*_{}\[\]<>#|]/g, '\\$&').replace(/\r?\n/g, ' ');
  return [
    '# Guide authoring outline',
    '',
    '**Plan only — no application workflows have been executed.**',
    '',
    `Profiles: ${report.selection.profiles.map(md).join(', ')}. ${report.totals.selected}/${report.totals.chapters} chapters selected.`,
    '',
    ...report.chapters.flatMap((chapter, index) => [
      `## ${index + 1}. ${md(chapter.title)}${chapter.selected ? '' : ' (excluded)'}`,
      '',
      `${md(chapter.feature)} · ${md(chapter.source)}:${chapter.line}`,
      '',
      md(chapter.description) || '_Introduction missing._',
      '',
      ...chapter.prerequisites.map((text) => `- Prerequisite: ${md(text)}`),
      ...chapter.instructions.map((text, i) => `${i + 1}. ${md(text)}`),
      '',
      `${chapter.steps} steps · ${chapter.assertions} outcome assertions · ${chapter.captures.length} figures`,
      '',
      ...chapter.captures.map(
        (shot) =>
          `- **${md(shot.title)}** — ${md(shot.description)} (${shot.marks} marks, ${shot.masks} configured masks) · line ${shot.line}`,
      ),
      '',
    ]),
    '## Authoring diagnostics',
    '',
    ...report.diagnostics.map(
      (d) =>
        `- **${d.severity} ${d.code}** ${md(d.scenario ?? '')}: ${md(d.message)} ${md(d.hint)} (${md(d.source)}:${d.line})`,
    ),
    '',
  ].join('\n');
}
