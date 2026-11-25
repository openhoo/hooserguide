import type { ExecutionStepKind } from './types.js';

// Check only copy intended for readers. Selector-bearing action steps and mark targets are expected.
export function readerCopyIssues(value: string | undefined): ('DRAFT_COPY' | 'SELECTOR_COPY')[] {
  if (!value) return [];
  const issues: ('DRAFT_COPY' | 'SELECTOR_COPY')[] = [];
  if (/\b(?:TODO|FIXME|TBD)\b/.test(value) || /\breplace_me(?:_\w+)?\b|<your[^>\n]+>/i.test(value))
    issues.push('DRAFT_COPY');
  if (
    /(?:^|[\s("'`])(?:(?:testid|label|text|css)=[^\s]|role=[a-z]+:|\[?data-testid\s*=)/i.test(value)
  )
    issues.push('SELECTOR_COPY');
  return issues;
}

/** Return the index of the last interaction with no later assertion or opaque plugin binding.
 * Scrolling, opening the app and hover are often just preparation for a figure. Do not warn for those alone. */
export function uncheckedInteraction(steps: readonly { kind?: ExecutionStepKind; text: string }[]) {
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i]!;
    if (!step.kind || step.kind === 'custom' || step.kind === 'assertion') return;
    if (
      step.kind === 'action' &&
      /^I (?:click|double click|fill|clear|select|check|uncheck|press|drag|upload|reload|go back|go forward)\b/.test(
        step.text,
      )
    )
      return i;
  }
}
