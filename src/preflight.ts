import type { PickleStep } from '@cucumber/messages';
import { builtinSteps, formRows } from './steps.js';
import { applyCaptureDefaults } from './manual.js';
import { validateCapture } from './capture.js';
import type { Config } from './types.js';

/** Validate built-in arguments before a browser can perform any actions. */
export function validateStepArguments(step: PickleStep, config: Config): void {
  try {
    builtinSteps().resolve(step.text);
  } catch {
    return; // Trusted plugins own validation of their own argument syntax.
  }
  const quoted = [...step.text.matchAll(/"(?:[^"\\]|\\.)*"/g)].map(
    (match) => JSON.parse(match[0]) as string,
  );
  if (
    step.argument &&
    step.text !== 'I fill the form:' &&
    step.text !== 'I explain:' &&
    !step.text.startsWith('I capture ')
  )
    throw new Error('This built-in step does not accept a docstring or data table');
  if (step.text.startsWith('I open ') || step.text.startsWith('the URL is '))
    new URL(quoted[0]!, config.baseURL);
  const count = / has count (\d+)$/.exec(step.text);
  if (count && !Number.isSafeInteger(Number(count[1])))
    throw new Error('Element counts must be safe non-negative integers');
  if (step.text === 'I fill the form:') formRows(step);
  if (step.text === 'I explain:') {
    if (!step.argument?.docString?.content.trim())
      throw new Error('I explain: requires a non-empty text docstring');
    if (step.argument.docString.mediaType && step.argument.docString.mediaType !== 'text')
      throw new Error('I explain: accepts a text docstring, not JSON or executable content');
  }
  if (/^I (?:explain |add a (?:prerequisite|note|tip|warning) )/.test(step.text)) {
    const quoted = /"(?:[^"\\]|\\.)*"$/.exec(step.text);
    if (quoted && !(JSON.parse(quoted[0]) as string).trim())
      throw new Error('Reader-facing instructions, prerequisites and callouts cannot be empty');
  }
  if (step.text.startsWith('I capture ')) {
    const body = step.argument?.docString;
    if (step.argument?.dataTable) throw new Error('Captures accept a JSON docstring, not a table');
    if (body?.mediaType && body.mediaType !== 'json')
      throw new Error('Capture docstrings must use json or omit the media type');
    const title = JSON.parse(step.text.slice('I capture '.length)) as string;
    const options = body ? JSON.parse(body.content) : {};
    if (!options || typeof options !== 'object' || Array.isArray(options))
      throw new Error('Capture docstrings must contain a JSON object');
    validateCapture(applyCaptureDefaults({ ...options, title }, config.captureDefaults));
  }
}
