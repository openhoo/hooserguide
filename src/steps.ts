import { expect } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import type { StepHandler, StepContext, Target, CaptureSpec, StepDocumentation } from './types.js';

export class StepRegistry {
  private bindings: { pattern: RegExp; handler: StepHandler; documentation?: StepDocumentation }[] =
    [];
  define(pattern: RegExp, handler: StepHandler, documentation?: StepDocumentation): void {
    if (pattern.global || pattern.sticky) throw new Error('Step patterns cannot use g or y flags');
    this.bindings.push({ pattern, handler, documentation });
  }
  list() {
    return this.bindings.map((b) => ({ pattern: b.pattern.toString(), ...b.documentation }));
  }
  document(example: string, description: string): void {
    this.resolve(example);
    this.bindings.find((b) => b.pattern.test(example))!.documentation = { example, description };
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
export function formRows(step: StepContext['step']): { selector: string; value: string }[] {
  const rows = step.argument?.dataTable?.rows;
  if (!rows || rows.length < 2 || rows[0]?.cells.map((c) => c.value).join('|') !== 'selector|value')
    throw new Error(
      'I fill the form requires a non-empty data table with selector and value columns',
    );
  return rows.slice(1).map((row) => {
    if (row.cells.length !== 2 || !row.cells[0]?.value.trim())
      throw new Error('Each form row requires a non-empty selector and a value');
    return { selector: row.cells[0]!.value, value: row.cells[1]!.value };
  });
}
export function builtinSteps(): StepRegistry {
  const registry = new StepRegistry();
  const docs: Record<string, string> = {
    'I open "/settings"': 'Navigate to a page.',
    'I click "role=button:Save"': 'Click a control.',
    'I fill "label=Name" with "Demo"': 'Fill an input.',
    'I fill "label=Password" from env "APP_PASSWORD"':
      'Fill from an environment variable without recording its value.',
    'I select "high" in "label=Priority"': 'Select an option by value.',
    'I check "label=Notifications"': 'Check or uncheck a checkbox.',
    'I press "Enter" on "label=Search"': 'Press a key on an element.',
    'I scroll to "testid=preferences"': 'Scroll an element into view.',
    '"role=heading:Settings" is visible': 'Assert visibility.',
    '"role=status:Result" has text "Saved"': 'Assert exact text.',
    'I explain "Select Save."': 'Add user-facing instructions.',
    'I capture "Settings"': 'Capture a screenshot using optional JSON annotation options.',
  };
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
  // Existing bindings keep their patterns; document them for agent discovery.
  for (const [example, description] of Object.entries(docs)) {
    registry.document(example, description);
  }
  const define = (pattern: string, example: string, description: string, handler: StepHandler) =>
    registry.define(new RegExp(pattern), handler, { example, description });
  const options = (c: StepContext) => ({ timeout: c.config.timeoutMs ?? 10000 });
  define(`^I hover ${q}$`, 'I hover "role=button:Help"', 'Hover a control.', async (c, s) => {
    await c.target(unquote(s!)).hover();
  });
  define(
    `^I double click ${q}$`,
    'I double click "testid=item"',
    'Double-click an element.',
    async (c, s) => {
      await c.target(unquote(s!)).dblclick();
    },
  );
  define(`^I clear ${q}$`, 'I clear "label=Search"', 'Clear an input.', async (c, s) => {
    await c.target(unquote(s!)).clear();
  });
  define(
    '^I reload the page$',
    'I reload the page',
    'Reload to verify persisted state.',
    async (c) => {
      await c.page.reload({ waitUntil: 'domcontentloaded' });
    },
  );
  define('^I go back$', 'I go back', 'Navigate back in browser history.', async (c) => {
    await c.page.goBack({ waitUntil: 'domcontentloaded' });
  });
  define('^I go forward$', 'I go forward', 'Navigate forward in browser history.', async (c) => {
    await c.page.goForward({ waitUntil: 'domcontentloaded' });
  });
  define(
    `^I drag ${q} to ${q}$`,
    'I drag "testid=task" to "testid=column"',
    'Drag an element to another element.',
    async (c, a, b) => {
      await c.target(unquote(a!)).dragTo(c.target(unquote(b!)));
    },
  );
  define(
    `^I upload ${q} to ${q}$`,
    'I upload "fixtures/avatar.png" to "label=Avatar"',
    'Upload a file resolved relative to the feature file.',
    async (c, file, selector) => {
      await c
        .target(unquote(selector!))
        .setInputFiles(resolve(dirname(c.chapter.source), unquote(file!)));
    },
  );
  define(
    '^I fill the form:$',
    'I fill the form:',
    'Fill inputs using a selector/value Gherkin data table.',
    async (c) => {
      for (const row of formRows(c.step)) await c.target(row.selector).fill(row.value);
    },
  );
  define(
    `^${q} is hidden$`,
    '"testid=loading" is hidden',
    'Assert hidden or detached state.',
    async (c, s) => {
      await expect(c.target(unquote(s!))).toBeHidden(options(c));
    },
  );
  define(
    `^${q} is (enabled|disabled)$`,
    '"role=button:Save" is enabled',
    'Assert enabled or disabled state.',
    async (c, s, state) => {
      const assertion = expect(c.target(unquote(s!)));
      if (state === 'enabled') await assertion.toBeEnabled(options(c));
      else await assertion.toBeDisabled(options(c));
    },
  );
  define(
    `^${q} is (checked|unchecked)$`,
    '"label=Notifications" is checked',
    'Assert checkbox state.',
    async (c, s, state) => {
      await expect(c.target(unquote(s!))).toBeChecked({
        ...options(c),
        checked: state === 'checked',
      });
    },
  );
  define(
    `^${q} has value ${q}$`,
    '"label=Name" has value "Demo"',
    'Assert an input value.',
    async (c, s, value) => {
      await expect(c.target(unquote(s!))).toHaveValue(unquote(value!), options(c));
    },
  );
  define(
    `^${q} contains text ${q}$`,
    '"testid=tasks" contains text "Launch"',
    'Assert text content contains a substring.',
    async (c, s, text) => {
      await expect(c.target(unquote(s!))).toContainText(unquote(text!), options(c));
    },
  );
  define(
    `^${q} has count (\\d+)$`,
    '"css=.task" has count 3',
    'Assert the number of matching elements.',
    async (c, s, count) => {
      await expect(c.target(unquote(s!))).toHaveCount(Number(count), options(c));
    },
  );
  define(
    `^${q} has attribute ${q} with value ${q}$`,
    '"role=button:Save" has attribute "aria-pressed" with value "true"',
    'Assert an attribute value.',
    async (c, s, name, value) => {
      await expect(c.target(unquote(s!))).toHaveAttribute(
        unquote(name!),
        unquote(value!),
        options(c),
      );
    },
  );
  define(
    `^the URL is ${q}$`,
    'the URL is "/settings"',
    'Assert an exact URL, resolving relative URLs against baseURL.',
    async (c, url) => {
      await expect(c.page).toHaveURL(new URL(unquote(url!), c.config.baseURL).href, options(c));
    },
  );
  define(
    `^the page title is ${q}$`,
    'the page title is "Settings"',
    'Assert the document title.',
    async (c, title) => {
      await expect(c.page).toHaveTitle(unquote(title!), options(c));
    },
  );
  return registry;
}
