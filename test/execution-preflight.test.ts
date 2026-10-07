import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { lint, authoringSchema } from '../src/authoring.js';
import { run, validate } from '../src/runner.js';
import { builtinSteps } from '../src/steps.js';
import type { Config, StepContext } from '../src/types.js';

const config = (root: string): Config => ({
  title: 'Preflight',
  baseURL: 'http://127.0.0.1:1',
  features: [join(root, '*.feature')],
  output: join(root, 'output'),
  pdf: false,
});

test('preflight rejects ignored attachments, malformed URLs and impossible counts before any app action', async () => {
  const root = await mkdtemp(join(tmpdir(), 'guide-preflight-'));
  let requests = 0;
  const server = createServer((_request, response) => {
    requests++;
    response.end('<h1>Ready</h1>');
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  try {
    const c = {
      ...config(root),
      baseURL: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    };
    const cases = [
      ['And I click "role=button:Save"\n   """\n   ignored\n   """', /does not accept/],
      ['Then "text=Ready" is visible\n   | ignored |', /does not accept/],
      ['And I open "http://["', /Invalid URL/],
      ['Then the URL is "http://["', /Invalid URL/],
      ['Then "css=.item" has count 9007199254740992', /safe non-negative integers/],
    ] as const;
    for (const [step, error] of cases) {
      await writeFile(
        c.features[0]!.replace('*.feature', 'test.feature'),
        `Feature: Arguments\n Scenario: Reject before navigation\n  Given I open "/"\n  ${step}\n  And I capture "Result"\n`,
      );
      await assert.rejects(validate(c), error);
      await assert.rejects(run(c), error);
      const result = authoringSchema.parse(await lint(c));
      assert.equal(result.valid, false);
      assert.ok(result.diagnostics.some((item) => item.code === 'STEP_ARGUMENT'));
      assert.equal(requests, 0);
      assert.ok(!(await readdir(root)).includes('output'));
    }
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
    await rm(root, { recursive: true, force: true });
  }
});

test('lint retains structured diagnostics across malformed capture descriptions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'guide-description-'));
  try {
    await writeFile(
      join(root, 'test.feature'),
      `Feature: Arguments\n Scenario: Invalid description\n  And I capture "Result"\n   """json\n   {"description":{"trim":"not a function"}}\n   """\n Scenario: Review continues\n  And I capture "Next"\n`,
    );
    const result = authoringSchema.parse(await lint(config(root)));
    assert.equal(result.valid, false);
    assert.equal(result.chapters.length, 2);
    assert.equal(result.chapters[0]!.captures[0]!.description, '');
    assert.ok(result.diagnostics.some((item) => item.code === 'STEP_ARGUMENT'));
    assert.equal(
      result.diagnostics.filter((item) => item.code === 'CAPTURE_DESCRIPTION').length,
      2,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('secret fill failures discard raw, escaped and abbreviated browser error values', async () => {
  const variable = 'HOOSERGUIDE_TEST_PRIVATE_FILL';
  const previous = process.env[variable];
  const value = 'private"value\nwith\\escapes';
  process.env[variable] = value;
  try {
    const binding = builtinSteps().resolve(`I fill "label=Password" from env "${variable}"`);
    for (const message of [
      `fill(${value}) failed`,
      `fill(${JSON.stringify(value)}) failed`,
      'fill("private…") failed',
    ]) {
      await assert.rejects(
        binding.handler(
          {
            target: () => ({
              fill: async (supplied: string) => {
                assert.equal(supplied, value);
                throw new Error(message);
              },
            }),
          } as unknown as StepContext,
          ...binding.matches,
        ),
        { message: `Could not fill the requested input from environment variable: ${variable}` },
      );
    }
  } finally {
    if (previous === undefined) delete process.env[variable];
    else process.env[variable] = previous;
  }
});
