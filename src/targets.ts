import type { Target } from './types.js';

/** Parse hooserguide's selector shorthand without opening a browser. */
export function parseTarget(value: Target): Exclude<Target, string> {
  if (typeof value !== 'string') return value;
  if (!value.trim()) throw new Error('A target selector cannot be empty');
  const match = /^(role|label|text|testid|css)=(.*)$/s.exec(value);
  if (!match) return { css: value }; // Playwright resolves its own selector syntax at execution.
  const body = match[2]!;
  if (match[1] === 'role') {
    const at = body.indexOf(':');
    if (at < 1 || !body.slice(0, at).trim())
      throw new Error('Role selector must be role=button:Accessible name');
    return {
      role: body.slice(0, at) as Extract<Target, { role: string }>['role'],
      name: body.slice(at + 1),
    };
  }
  if (!body.trim()) throw new Error(`The ${match[1]}= selector requires a value`);
  if (match[1] === 'label') return { label: body };
  if (match[1] === 'text') return { text: body };
  if (match[1] === 'testid') return { testId: body };
  return { css: body };
}
