import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { loadRegistry } from './runner.js';

export const chapterTemplates = ['task', 'form', 'read-only'] as const;
export type ChapterTemplate = (typeof chapterTemplates)[number];

export function chapterTemplate(
  title: string,
  template: ChapterTemplate = 'task',
  tag = '@manual',
): string {
  if (!title.trim() || /[\r\n]/.test(title))
    throw new Error('Chapter title must be a non-empty single line');
  if (!chapterTemplates.includes(template))
    throw new Error(`Unknown chapter template: ${template}`);
  if (!/^@[\w-]+$/.test(tag)) throw new Error('Chapter tag must be a single Gherkin tag');
  const start = `${tag}\nFeature: ${title.trim()}\n\n  Scenario: ${title.trim()}\n    REPLACE_ME: Explain who this task is for and what they will achieve.\n\n    Given I add a prerequisite "REPLACE_ME: Required account or permissions."\n    And I open "/"\n    Then "role=heading:REPLACE_ME" is visible\n`;
  const action =
    template === 'read-only'
      ? '    And I explain "REPLACE_ME: Explain what to look for on this page."\n'
      : template === 'form'
        ? `    And I explain "REPLACE_ME: Describe the information to enter."\n    When I fill the form:\n      | selector           | value      |\n      | label=REPLACE_ME   | Demo value |\n    And I click "role=button:REPLACE_ME"\n    And I reload the page\n    Then "label=REPLACE_ME" has value "Demo value"\n`
        : `    And I explain "REPLACE_ME: Tell the reader which control to use and why."\n    When I click "role=button:REPLACE_ME"\n    And I reload the page\n    Then "role=status:REPLACE_ME" has text "REPLACE_ME"\n`;
  return (
    start +
    action +
    `    And I capture ${JSON.stringify(title.trim())}\n      """json\n      {\n        "description": "REPLACE_ME: Describe the verified result and reference A.",\n        "marks": [\n          { "target": "role=heading:REPLACE_ME", "kind": "both", "label": "A", "caption": "REPLACE_ME: Explain this control." }\n        ]\n      }\n      """\n`
  );
}

export async function newChapter(
  configPath: string,
  title: string,
  options: { template?: ChapterTemplate; output?: string } = {},
) {
  const config = await loadConfig(configPath);
  const slug =
    title
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'chapter';
  const folder = dirname(config.features[0]!);
  if (!options.output && /[*?{}\[\]]/.test(folder))
    throw new Error('The feature directory contains a glob; choose --output explicitly.');
  const path = options.output
    ? resolve(dirname(resolve(configPath)), options.output)
    : join(folder, `${slug}.feature`);
  if (!path.endsWith('.feature')) throw new Error('Chapter output must end in .feature');
  const content = chapterTemplate(title, options.template, config.tag ?? '@manual');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, { flag: 'wx' });
  return { feature: path, template: options.template ?? 'task', needsEditing: true };
}

/** Standalone workspace avoids changing the consumer's existing editor settings/tasks. */
export async function setupEditor(configPath: string) {
  const path = resolve(configPath),
    root = dirname(path);
  const registry = await loadRegistry(await loadConfig(path));
  const snippets: Record<
    string,
    { prefix: string; scope: string; body: string[]; description: string }
  > = {};
  const snippetEscape = (value: string) => value.replace(/[\\$}]/g, '\\$&');
  for (const [index, step] of registry.list().entries()) {
    if (!step.example) continue;
    let slot = 0;
    const example = step.example.replace(
      /"((?:[^"\\]|\\.)*)"/g,
      (_match, value: string) => `"\${${++slot}:${snippetEscape(value)}}"`,
    );
    const body = [`And ${example}`];
    if (step.example === 'I explain:')
      body.push('  """text', '  ${1:Explain the action and its result.}', '  """');
    if (step.example === 'I fill the form:')
      body.push('  | selector | value |', '  | ${1:label=Name} | ${2:Demo} |');
    if (step.example.startsWith('I capture '))
      body.push(
        '  """json',
        '  {',
        `    "description": "\${${++slot}:Describe the verified result.}",`,
        '    "marks": [',
        `      { "target": "\${${++slot}:role=button:Save}", "kind": "both", "label": "A", "caption": "\${${++slot}:Save your changes.}" }`,
        '    ]',
        '  }',
        '  """',
      );
    snippets[`Step ${index + 1}: ${step.example}`] = {
      prefix: `hg-${step.example
        .replace(/"(?:[^"\\]|\\.)*"/g, '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')}-${index + 1}`,
      scope: 'gherkin,feature',
      body,
      description: step.description ?? 'Trusted custom guide step',
    };
  }
  for (const template of chapterTemplates)
    snippets[`Chapter: ${template}`] = {
      prefix: `hg-chapter-${template}`,
      scope: 'gherkin,feature',
      body: chapterTemplate('Your task', template).split('\n').map(snippetEscape),
      description: `Complete ${template} chapter; replace REPLACE_ME before execution.`,
    };
  const configArg = relative(root, path).split('\\').join('/');
  const task = (label: string, command: string, extras: string[] = []) => ({
    label: `hooserguide: ${label}`,
    type: 'process',
    command: 'npx',
    args: ['--no-install', 'hooserguide', command, '--config', configArg, ...extras],
    options: { cwd: '${workspaceFolder}' },
    ...(command === 'lint'
      ? {
          group: { kind: 'test', isDefault: true },
          problemMatcher: {
            owner: 'hooserguide',
            fileLocation: 'absolute',
            pattern: {
              regexp: '^(.+):(\\d+):(\\d+): (error|warning) ([A-Z_]+): (.*)$',
              file: 1,
              line: 2,
              column: 3,
              severity: 4,
              code: 5,
              message: 6,
            },
          },
        }
      : { problemMatcher: [] }),
  });
  const workspace = {
    folders: [{ path: '.' }],
    settings: {
      'files.associations': { '*.feature': 'gherkin' },
      'json.schemas': [
        { fileMatch: [`/${configArg}`], url: './.hooserguide/config.schema.json' },
        { fileMatch: ['/*.capture.json'], url: './.hooserguide/capture.schema.json' },
      ],
    },
    tasks: {
      version: '2.0.0',
      tasks: [
        task('Lint authoring', 'lint'),
        task('Review outline', 'outline'),
        task('Validate bindings', 'validate'),
        task('Generate guide (executes app workflows)', 'run'),
      ],
    },
  };
  const schemas = fileURLToPath(new URL('../schemas/', import.meta.url));
  const assets: [string, string][] = [
    ['hooserguide.code-workspace', JSON.stringify(workspace, null, 2) + '\n'],
    ['.vscode/hooserguide.code-snippets', JSON.stringify(snippets, null, 2) + '\n'],
    [
      '.hooserguide/config.schema.json',
      await readFile(join(schemas, 'config.schema.json'), 'utf8'),
    ],
    [
      '.hooserguide/capture.schema.json',
      await readFile(join(schemas, 'capture.schema.json'), 'utf8'),
    ],
  ];
  for (const [name] of assets) {
    if (
      await access(join(root, name)).then(
        () => true,
        () => false,
      )
    )
      throw new Error(`Refusing to overwrite ${join(root, name)}`);
  }
  for (const [name, content] of assets) {
    await mkdir(dirname(join(root, name)), { recursive: true });
    await writeFile(join(root, name), content, { flag: 'wx' });
  }
  return {
    workspace: join(root, 'hooserguide.code-workspace'),
    files: assets.map(([name]) => join(root, name)),
    snippets: Object.keys(snippets).length,
  };
}
