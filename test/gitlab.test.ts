import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, readFile, mkdir, rm, symlink, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseAllDocuments } from 'yaml';
import { unzipSync } from 'fflate';
import { generateGitlabGuide, gitlabOptionsFromEnvironment } from '../src/gitlab.js';

async function fixture(root: string) {
  const config = join(root, 'config.json');
  await writeFile(
    config,
    JSON.stringify({
      title: 'GitLab guide',
      baseURL: 'https://example.invalid',
      features: ['guide.feature'],
      output: 'unused',
      profile: 'desktop',
      profiles: { desktop: { browser: 'firefox', viewport: { width: 640, height: 480 } } },
      masks: ['#secret'],
    }),
  );
  await writeFile(
    join(root, 'guide.feature'),
    '@manual\nFeature: GitLab integration\n @selected\n Scenario: Save a task\n  Given I open "/"\n  Then "role=heading:Ready" is visible\n  And I capture "Ready page"\n @unselected\n Scenario: Must not run\n  Given I invent an unauthorized action\n',
  );
  return config;
}

test('GitLab adapter executes selected evidence, waits for readiness, exports PDF and packages portable artifacts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-gitlab-'));
  let healthCalls = 0;
  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.statusCode = ++healthCalls < 3 ? 503 : 204;
      res.end();
      return;
    }
    res.setHeader('Content-Type', 'text/html');
    res.end('<h1>Ready</h1><p id=secret>private@example.test</p>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await fixture(root);
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const summary = await generateGitlabGuide({
      project: root,
      config: 'config.json',
      output: 'manual-artifacts',
      baseURL: url,
      waitURL: `${url}/health`,
      waitTimeoutSeconds: 3,
      tagExpression: '@selected',
      scenario: 'Save',
      manual: { pageSize: 'Letter', orientation: 'landscape', margin: 36 },
    });
    assert.equal(summary.status, 'passed', summary.error);
    assert.equal(summary.browser, 'chromium', 'Component browser must override a profile engine');
    assert.equal(summary.profile, 'desktop');
    assert.ok(healthCalls >= 3);
    assert.equal(summary.chapters?.length, 1);
    assert.ok(summary.artifacts?.pdf);
    for (const path of Object.values(summary.artifacts!)) {
      assert.equal(path.startsWith('/'), false);
      await access(join(root, path));
    }
    assert.deepEqual(
      JSON.parse(await readFile(join(root, 'manual-artifacts/summary.json'), 'utf8')),
      summary,
    );
    const zip = unzipSync(await readFile(join(root, summary.artifacts!.bundle!)));
    assert.ok(zip['handbook.pdf']);
    assert.ok(!Object.keys(zip).some((path) => /config|plugin|storage/.test(path)));
    const report = JSON.parse(Buffer.from(zip['report.json']!).toString());
    assert.equal(report.chapters[0].source, 'guide.feature');
    assert.deepEqual(report.manual, { pageSize: 'Letter', orientation: 'landscape', margin: 36 });
    assert.equal(report.selection.tagExpression, '@selected');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

test('GitLab adapter retains failed execution evidence and creates no successful manual or ZIP', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-gitlab-failed-'));
  const server = createServer((_req, res) => res.end('<h1>Other</h1><p id=secret>Private</p>'));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const config = await fixture(root);
    const raw = JSON.parse(await readFile(config, 'utf8'));
    raw.timeoutMs = 100;
    await writeFile(config, JSON.stringify(raw));
    const summary = await generateGitlabGuide({
      project: root,
      config: 'config.json',
      output: 'artifacts',
      baseURL: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
      tagExpression: '@selected',
      pdf: false,
    });
    assert.equal(summary.status, 'failed');
    assert.ok(summary.artifacts?.report);
    assert.equal(summary.artifacts?.html, undefined);
    assert.equal(summary.artifacts?.bundle, undefined);
    const report = JSON.parse(await readFile(join(root, summary.artifacts!.report!), 'utf8'));
    assert.equal(report.status, 'failed');
    assert.equal(
      JSON.parse(await readFile(join(root, 'artifacts/summary.json'), 'utf8')).status,
      'failed',
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

test('GitLab artifact directory rejects stale data, traversal and escaping parents before writing outside the checkout', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-gitlab-paths-'));
  try {
    const project = join(root, 'project');
    await mkdir(project);
    await fixture(project);
    await mkdir(join(project, 'existing'));
    await writeFile(join(project, 'existing/keep.txt'), 'unchanged');
    for (const output of ['existing', '..', '../escape', '.', resolve(root, 'absolute')]) {
      const result = await generateGitlabGuide({ project, config: 'config.json', output });
      assert.equal(result.status, 'failed');
    }
    assert.equal(await readFile(join(project, 'existing/keep.txt'), 'utf8'), 'unchanged');
    const outside = join(root, 'outside');
    await mkdir(outside);
    await symlink(outside, join(project, 'escape-parent'));
    const result = await generateGitlabGuide({
      project,
      config: 'config.json',
      output: 'escape-parent/new/artifacts',
    });
    assert.equal(result.status, 'failed');
    assert.match(result.error ?? '', /outside/);
    await assert.rejects(access(join(outside, 'new')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('GitLab typed inputs are decoded literally and invalid booleans/layouts/timeouts fail before execution', async () => {
  const options = gitlabOptionsFromEnvironment({
    CI_PROJECT_DIR: '/project',
    HOOSERGUIDE_CI_PROFILE: 'profile $HOME $(touch marker)',
    HOOSERGUIDE_CI_SCENARIO: 'quoted "task"',
    HOOSERGUIDE_CI_PDF: 'boolean:false',
    HOOSERGUIDE_CI_BUNDLE: 'boolean:true',
    HOOSERGUIDE_CI_MARGIN: 'number:36',
    HOOSERGUIDE_CI_WAIT_TIMEOUT: 'number:15',
    HOOSERGUIDE_CI_PAGE_SIZE: 'Letter',
  });
  assert.equal(options.profile, 'profile $HOME $(touch marker)');
  assert.equal(options.scenario, 'quoted "task"');
  assert.equal(options.pdf, false);
  assert.equal(options.bundle, true);
  assert.equal(options.manual?.margin, 36);
  assert.equal(options.waitTimeoutSeconds, 15);
  assert.throws(
    () => gitlabOptionsFromEnvironment({ HOOSERGUIDE_CI_PDF: 'yes' }),
    /must be true or false/,
  );
  for (const input of [
    { waitTimeoutSeconds: 0 },
    { waitTimeoutSeconds: 301 },
    { manual: { margin: 23 } },
    { manual: { margin: 73 } },
  ]) {
    assert.equal(
      (await generateGitlabGuide({ ...input, project: '/does-not-exist' })).status,
      'failed',
    );
  }
});

test('GitLab readiness timeout and cancellation retain diagnostics without exposing endpoint query strings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-gitlab-readiness-'));
  const server = createServer((_req, res) => {
    res.statusCode = 503;
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await fixture(root);
    const result = await generateGitlabGuide({
      project: root,
      config: 'config.json',
      output: 'timeout',
      tagExpression: '@selected',
      waitURL: `http://127.0.0.1:${(server.address() as { port: number }).port}/health?secret=do-not-record`,
      waitTimeoutSeconds: 1,
    });
    assert.equal(result.status, 'failed');
    assert.match(result.error ?? '', /timed out/);
    assert.equal(result.error?.includes('do-not-record'), false);
    assert.equal(
      JSON.parse(await readFile(join(root, 'timeout/summary.json'), 'utf8')).status,
      'failed',
    );
    const abort = new AbortController();
    abort.abort();
    const cancelled = await generateGitlabGuide(
      { project: root, config: 'config.json', output: 'cancelled' },
      { signal: abort.signal },
    );
    assert.equal(cancelled.status, 'failed');
    assert.match(cancelled.error ?? '', /cancelled/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

test('GitLab template has typed inputs, literal variables, failure artifacts and safe shell arguments', async () => {
  const documents = parseAllDocuments(await readFile('templates/generate/template.yml', 'utf8'));
  assert.equal(documents.length, 2);
  for (const doc of documents) assert.deepEqual(doc.errors, []);
  const header = documents[0]!.toJS();
  const jobs = documents[1]!.toJS();
  const job = jobs['$[[ inputs.job-name ]]'];
  const inputs = header.spec.inputs;
  const interpolate = (value: unknown): unknown => {
    if (typeof value !== 'string') return value;
    const whole = /^\$\[\[ inputs\.([\w-]+) \]\]$/.exec(value);
    if (whole) return inputs[whole[1]!].default;
    return value.replace(/\$\[\[ inputs\.([\w-]+) \]\]/g, (_m, key) => String(inputs[key].default));
  };
  const environment: NodeJS.ProcessEnv = {};
  for (const [name, variable] of Object.entries(job.variables) as [
    string,
    { value: string; expand: boolean },
  ][]) {
    assert.equal(variable.expand, false);
    const value = interpolate(variable.value);
    assert.equal(
      typeof value,
      'string',
      `Variable ${name} must remain a string after typed interpolation`,
    );
    environment[name] = value as string;
  }
  const decoded = gitlabOptionsFromEnvironment(environment);
  assert.equal(decoded.pdf, true);
  assert.equal(decoded.bundle, true);
  assert.equal(decoded.manual?.margin, undefined);
  assert.equal(decoded.waitTimeoutSeconds, 60);
  assert.deepEqual(inputs.browser.options, ['chromium', 'firefox', 'webkit']);
  assert.equal(job.artifacts.when, 'always');
  assert.equal(job.artifacts.access, 'developer');
  assert.equal(job.artifacts.paths[0], '$[[ inputs.output ]]/job-$CI_JOB_ID/');
  assert.ok(!job.script[0].includes('$[[ inputs.'));
  assert.match(job.script[0], /-- "\$HOOSERGUIDE_INSTALL_SOURCE"/);
  assert.match(job.script[0], /trap .*EXIT/);
  assert.equal(job.allow_failure, undefined);
});

test('GitLab environment scopes each job upload below the artifact root', () => {
  const current = gitlabOptionsFromEnvironment({
    CI_JOB_ID: '101',
    HOOSERGUIDE_CI_OUTPUT: 'output/guides',
  });
  const retried = gitlabOptionsFromEnvironment({
    CI_JOB_ID: '102',
    HOOSERGUIDE_CI_OUTPUT: 'output/guides',
  });
  assert.equal(current.output, 'output/guides/job-101');
  assert.equal(retried.output, 'output/guides/job-102');
  assert.throws(() => gitlabOptionsFromEnvironment({ CI_JOB_ID: '../escape' }), /numeric/);
});

test('native GitLab self-test includes distinct jobs for all engines against its own package', async () => {
  const [document] = parseAllDocuments(await readFile('.gitlab-ci.yml', 'utf8'));
  assert.deepEqual(document!.errors, []);
  const pipeline = document!.toJS();
  const version = JSON.parse(await readFile('package.json', 'utf8')).version;
  assert.deepEqual(
    pipeline.include.map((include: { inputs: { browser: string } }) => include.inputs.browser),
    ['chromium', 'firefox', 'webkit'],
  );
  const names = new Set<string>();
  for (const include of pipeline.include) {
    assert.equal(include.local, '/templates/generate/template.yml');
    assert.equal(names.has(include.inputs['job-name']), false);
    names.add(include.inputs['job-name']);
    assert.equal(include.inputs.package, `file:.ci-package/openhoo-hooserguide-${version}.tgz`);
    assert.equal(include.inputs.needs[0].job, 'verify');
    assert.equal(include.inputs.needs[0].artifacts, true);
  }
});
