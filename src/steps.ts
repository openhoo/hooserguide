import { expect } from '@playwright/test';
import type { StepHandler, StepContext, Target, CaptureSpec } from './types.js';

export class StepRegistry {
  private bindings: { pattern: RegExp; handler: StepHandler }[] = [];
  define(pattern: RegExp, handler: StepHandler): void {
    if (pattern.global || pattern.sticky) throw new Error('Step patterns cannot use g or y flags');
    this.bindings.push({ pattern, handler });
  }
  resolve(text: string): { handler: StepHandler; matches: string[] } {
    const matches = this.bindings.flatMap((b) => {
      const m = b.pattern.exec(text);
      return m ? [{ handler: b.handler, matches: m.slice(1) }] : [];
    });
    if (matches.length !== 1)
      throw new Error(`${matches.length ? 'Ambiguous' : 'Undefined'} BDD step: ${text}`);
    return matches[0]!;
  }
  async execute(context: StepContext): Promise<void> {
    const binding = this.resolve(context.step.text);
    await binding.handler(context, ...binding.matches);
  }
}

/** Strings support css=, role=button:Save, label=Email, text=Welcome, testid=save. */
export function target(page: StepContext['page'], value: Target) {
  if (typeof value === 'string') {
    const m = /^(role|label|text|testid|css)=(.*)$/s.exec(value);
    if (!m) return page.locator(value);
    const [, kind, body] = m;
    if (kind === 'role') {
      const at = body!.indexOf(':');
      if (at < 1) throw new Error('Role selector must be role=button:Accessible name');
      return page.getByRole(body!.slice(0, at) as Parameters<typeof page.getByRole>[0], {
        name: body!.slice(at + 1),
        exact: true,
      });
    }
    if (kind === 'label') return page.getByLabel(body!, { exact: true });
    if (kind === 'text') return page.getByText(body!, { exact: true });
    if (kind === 'testid') return page.getByTestId(body!);
    return page.locator(body!);
  }
  if ('role' in value) return page.getByRole(value.role, { name: value.name, exact: true });
  if ('label' in value) return page.getByLabel(value.label, { exact: true });
  if ('text' in value) return page.getByText(value.text, { exact: true });
  if ('testId' in value) return page.getByTestId(value.testId);
  return page.locator(value.css);
}

const q = '"((?:[^"\\\\]|\\\\.)*)"';
const unquote = (s: string) => JSON.parse(`"${s}"`) as string;
export function builtinSteps(): StepRegistry {
  const registry = new StepRegistry();
  registry.define(new RegExp(`^I open ${q}$`), async (c, url) => {
    await c.page.goto(unquote(url!), { waitUntil: 'domcontentloaded' });
  });
  registry.define(new RegExp(`^I click ${q}$`), async (c, selector) => {
    await c.target(unquote(selector!)).click();
  });
  registry.define(new RegExp(`^I fill ${q} with ${q}$`), async (c, selector, value) => {
    await c.target(unquote(selector!)).fill(unquote(value!));
  });
  registry.define(new RegExp(`^I fill ${q} from env ${q}$`), async (c, selector, name) => {
    const variable = unquote(name!);
    const value = process.env[variable];
    if (value === undefined) throw new Error(`Missing environment variable: ${variable}`);
    try {
      await c.target(unquote(selector!)).fill(value);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(value ? message.replaceAll(value, '[REDACTED]') : message);
    }
  });
  registry.define(new RegExp(`^I select ${q} in ${q}$`), async (c, value, selector) => {
    await c.target(unquote(selector!)).selectOption(unquote(value!));
  });
  registry.define(new RegExp(`^I (check|uncheck) ${q}$`), async (c, action, selector) => {
    await c.target(unquote(selector!)).setChecked(action === 'check');
  });
  registry.define(new RegExp(`^I press ${q} on ${q}$`), async (c, key, selector) => {
    await c.target(unquote(selector!)).press(unquote(key!));
  });
  registry.define(new RegExp(`^I scroll to ${q}$`), async (c, selector) => {
    await c.target(unquote(selector!)).scrollIntoViewIfNeeded();
  });
  registry.define(new RegExp(`^${q} is visible$`), async (c, selector) => {
    await expect(c.target(unquote(selector!))).toBeVisible({
      timeout: c.config.timeoutMs ?? 10000,
    });
  });
  registry.define(new RegExp(`^${q} has text ${q}$`), async (c, selector, text) => {
    await expect(c.target(unquote(selector!))).toHaveText(unquote(text!), {
      timeout: c.config.timeoutMs ?? 10000,
    });
  });
  registry.define(new RegExp(`^I explain ${q}$`), (c, text) => {
    c.instruction(unquote(text!));
  });
  registry.define(new RegExp(`^I capture ${q}$`), async (c, title) => {
    const body = c.step.argument?.docString?.content;
    const options = body ? (JSON.parse(body) as Omit<CaptureSpec, 'title'>) : {};
    await c.capture({ ...options, title: unquote(title!) });
  });
  return registry;
}
