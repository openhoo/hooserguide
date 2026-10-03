import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  mkdtemp,
  writeFile,
  readFile,
  mkdir,
  readdir,
  rm,
  symlink,
  access,
  realpath,
} from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import { parse, parseAllDocuments } from 'yaml';
import { chromium } from '@playwright/test';
import { preparePages } from '../src/pages.js';
import { pagesSourceFromArtifacts } from '../src/pages-ci.js';
import { run } from '../src/runner.js';
import type { Config } from '../src/types.js';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-pages-'));
  const app = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(
      '<meta name="viewport" content="width=device-width"><h1>Settings</h1><p id=secret>PRIVATE</p><button id=save>Save</button>',
    );
  });
  await new Promise<void>((done) => app.listen(0, '127.0.0.1', done));
  await writeFile(
    join(root, 'settings.feature'),
    'Feature: Settings\n Scenario: Review settings\n  Given I open "/"\n  And I capture "Settings"\n   """json\n   {"marks":[{"target":"#save","label":"A","caption":"Save settings"}]}\n   """\n',
  );
  const config: Config = {
    title: 'Pages guide',
    baseURL: `http://127.0.0.1:${(app.address() as { port: number }).port}`,
    features: [join(root, 'settings.feature')],
    output: join(root, 'artifacts/job-123'),
    pdf: true,
    masks: ['#secret'],
    profiles: {
      desktop: { viewport: { width: 1280, height: 800 } },
      mobile: { viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 },
    },
    responsive: { profiles: ['desktop', 'mobile'] },
    timeoutMs: 1000,
  };
  return {
    root,
    config,
    async close() {
      await new Promise<void>((done) => app.close(() => done()));
      await rm(root, { recursive: true, force: true });
    },
  };
}

test('Pages rebuilds verified responsive evidence, sanitizes sources and publishes only intended files with relative downloads', async () => {
  const f = await fixture();
  try {
    const generated = await run(f.config);
    assert.equal(
      generated.report.status,
      'passed',
      generated.report.exportError ??
        generated.report.chapters.find((c) => c.error)?.error ??
        'Generation failed',
    );
    await writeFile(join(generated.directory, 'index.html'), '<script>unverified content</script>');
    await writeFile(join(generated.directory, 'handbook.pdf'), 'not a valid PDF');
    await writeFile(join(generated.directory, 'private.env'), 'must never be public');
    const original = await readFile(join(generated.directory, 'report.json'));
    const site = await preparePages(generated.directory, { root: f.root, output: 'site/public' });
    assert.equal(site.pdf, true);
    assert.equal(site.bundle, true);
    assert.equal(site.sourceReportSha256, createHash('sha256').update(original).digest('hex'));
    assert.deepEqual((await readdir(site.directory)).sort(), [
      '.nojekyll',
      'handbook.md',
      'handbook.pdf',
      'handbook.zip',
      'index.html',
      'pdf-layout.json',
      'report.json',
      'screenshots',
    ]);
    const publicReport = JSON.parse(await readFile(join(site.directory, 'report.json'), 'utf8'));
    assert.equal(publicReport.chapters[0].source, 'settings.feature');
    assert.equal(publicReport.chapters[1].variant.profile, 'mobile');
    assert.ok(!(await readFile(join(site.directory, 'report.json'), 'utf8')).includes(f.root));
    assert.ok(
      (await readFile(join(site.directory, 'handbook.pdf'))).subarray(0, 5).toString() === '%PDF-',
    );
    const html = await readFile(join(site.directory, 'index.html'), 'utf8');
    assert.ok(!html.includes('unverified content'));
    assert.match(html, /href="handbook.zip"/);
    assert.match(html, /href="handbook.pdf"/);
    const zip = unzipSync(await readFile(join(site.directory, 'handbook.zip')));
    assert.ok(zip['handbook.pdf']);
    assert.ok(zip['report.json']);
    assert.ok(
      !Object.keys(zip).some((path) => path.includes('.env') || path.endsWith('.overlay.svg')),
    );
    assert.ok(!Buffer.from(zip['report.json']!).toString().includes(f.root));
    for (const chapter of generated.report.chapters)
      for (const shot of chapter.captures)
        for (const path of [shot.raw, shot.image])
          assert.deepEqual(
            await readFile(join(site.directory, path)),
            await readFile(join(generated.directory, path)),
          );
    // Serve under a project prefix, as both Pages platforms do.
    const server = createServer(async (req, res) => {
      try {
        const path = decodeURIComponent(new URL(req.url!, 'http://local').pathname);
        if (!path.startsWith('/project/')) throw new Error('prefix');
        const file = resolve(site.directory, path.slice('/project/'.length) || 'index.html');
        if (!file.startsWith(site.directory + '/')) throw new Error('escape');
        res.setHeader(
          'Content-Type',
          file.endsWith('.html')
            ? 'text/html'
            : file.endsWith('.png')
              ? 'image/png'
              : 'application/octet-stream',
        );
        res.end(await readFile(file));
      } catch {
        res.statusCode = 404;
        res.end();
      }
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const failed: string[] = [];
      page.on('response', (r) => {
        if (r.status() >= 400) failed.push(r.url());
      });
      await page.goto(
        `http://127.0.0.1:${(server.address() as { port: number }).port}/project/index.html`,
      );
      await page.locator('figure img').last().waitFor();
      await page.locator('#annotations').click();
      await page
        .locator('figure img')
        .last()
        .evaluate((img) => (img as HTMLImageElement).decode());
      assert.equal(await page.locator('.screen-group').count(), 1);
      assert.deepEqual(failed, []);
      for (const file of ['handbook.pdf', 'handbook.zip', 'report.json'])
        assert.equal((await page.request.get(new URL(file, page.url()).href)).status(), 200);
    } finally {
      await browser.close();
      await new Promise<void>((done) => server.close(() => done()));
    }
    assert.equal(
      await readFile(join(generated.directory, 'index.html'), 'utf8'),
      '<script>unverified content</script>',
      'Source stays untouched',
    );
  } finally {
    await f.close();
  }
});

test('Pages rejects failed and tampered evidence, unsafe output ancestors and stale content without destructive cleanup', async () => {
  const f = await fixture();
  const outside = await mkdtemp(join(tmpdir(), 'hooserguide-pages-outside-'));
  try {
    const r = await run({ ...f.config, pdf: false });
    await mkdir(join(f.root, 'stale'));
    await writeFile(join(f.root, 'stale/keep'), 'keep');
    await assert.rejects(
      preparePages(r.directory, { root: f.root, output: 'stale' }),
      /already exists/,
    );
    assert.equal(await readFile(join(f.root, 'stale/keep'), 'utf8'), 'keep');
    await assert.rejects(
      preparePages(r.directory, { root: f.root, output: '../escape' }),
      /inside/,
    );
    await symlink(outside, join(f.root, 'link'));
    await assert.rejects(
      preparePages(r.directory, { root: f.root, output: 'link/nested/site' }),
      /outside/,
    );
    assert.deepEqual(await readdir(outside), []);
    await assert.rejects(
      preparePages(r.directory, { root: f.root, output: relative(f.root, r.directory) + '/pages' }),
      /separate/,
    );
    const shot = r.report.chapters[0]!.captures[0]!;
    await writeFile(join(r.directory, shot.image), 'corrupt');
    await assert.rejects(
      preparePages(r.directory, { root: f.root, output: 'tampered' }),
      /differs|image/i,
    );
    await assert.rejects(access(join(f.root, 'tampered')));
    assert.ok(!(await readdir(f.root)).some((name) => name.startsWith('.pages-')));
    const failed = await run({ ...f.config, pdf: false, masks: ['#missing'], timeoutMs: 100 });
    await assert.rejects(
      preparePages(failed.directory, { root: f.root, output: 'failed' }),
      /unsuccessful/,
    );
    await assert.rejects(access(join(f.root, 'failed')));
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      preparePages(
        r.directory,
        { root: f.root, output: 'cancelled' },
        { signal: controller.signal },
      ),
    );
    await assert.rejects(access(join(f.root, 'cancelled')));
  } finally {
    await f.close();
    await rm(outside, { recursive: true, force: true });
  }
});

test('Pages without PDF or ZIP regenerates HTML without dangling downloads', async () => {
  const f = await fixture();
  try {
    const r = await run({ ...f.config, pdf: false });
    const site = await preparePages(r.directory, { root: f.root, output: 'public', bundle: false });
    assert.equal(site.pdf, false);
    assert.equal(site.bundle, false);
    const html = await readFile(join(site.directory, 'index.html'), 'utf8');
    assert.ok(!html.includes('href="handbook.pdf"'));
    assert.ok(!html.includes('href="handbook.zip"'));
    await assert.rejects(access(join(site.directory, 'handbook.pdf')));
    await assert.rejects(access(join(site.directory, 'handbook.zip')));
  } finally {
    await f.close();
  }
});

test('GitLab Pages selects exactly one successful job summary and rejects ambiguous or escaping source runs', async () => {
  const f = await fixture();
  try {
    const r = await run({ ...f.config, pdf: false });
    const path = join(f.root, 'artifacts/job-123/summary.json');
    await writeFile(
      path,
      JSON.stringify({ status: 'passed', directory: relative(f.root, r.directory) }),
    );
    assert.equal(await pagesSourceFromArtifacts(f.root, 'artifacts'), await realpath(r.directory));
    await writeFile(
      path,
      JSON.stringify({ status: 'failed', directory: relative(f.root, r.directory) }),
    );
    await assert.rejects(pagesSourceFromArtifacts(f.root, 'artifacts'), /failed/);
    await writeFile(path, JSON.stringify({ status: 'passed', directory: r.directory }));
    await assert.rejects(pagesSourceFromArtifacts(f.root, 'artifacts'), /relative/);
    const other = await run({ ...f.config, output: join(f.root, 'other'), pdf: false });
    await writeFile(
      path,
      JSON.stringify({ status: 'passed', directory: relative(f.root, other.directory) }),
    );
    await assert.rejects(pagesSourceFromArtifacts(f.root, 'artifacts'), /outside/);
    await writeFile(
      path,
      JSON.stringify({ status: 'passed', directory: relative(f.root, r.directory) }),
    );
    await mkdir(join(f.root, 'artifacts/job-456'));
    await writeFile(join(f.root, 'artifacts/job-456/summary.json'), '{}');
    await assert.rejects(pagesSourceFromArtifacts(f.root, 'artifacts'), /exactly one/);
  } finally {
    await f.close();
  }
});

test('GitLab and GitHub Pages templates use success-only deployments, literal data transport and official Pages permissions', async () => {
  const [spec, template] = parseAllDocuments(
    await readFile('templates/pages/template.yml', 'utf8'),
  );
  assert.deepEqual(spec!.errors, []);
  assert.deepEqual(template!.errors, []);
  const job = template!.toJS()['$[[ inputs.job-name ]]'];
  assert.equal(job.pages.publish, '$[[ inputs.output ]]');
  assert.equal(job.pages.expire_in, 'never');
  assert.equal(job.needs[0].job, '$[[ inputs.generate-job ]]');
  assert.equal(job.needs[0].artifacts, true);
  assert.equal(job.artifacts.when, 'on_success');
  assert.match(spec!.toJS().spec.inputs.rules.default[0].if, /CI_DEFAULT_BRANCH/);
  for (const variable of Object.values(job.variables) as any[])
    assert.equal(variable.expand, false);
  assert.ok(!job.script[0].includes('$[[ inputs.'));
  assert.match(job.script[0], /pages-ci.js/);
  const action = parse(await readFile('actions/pages/action.yml', 'utf8'));
  assert.equal(action.runs.steps.at(-1).uses, 'actions/upload-pages-artifact@v4');
  assert.equal(action.runs.steps[1].env.HOOSERGUIDE_PAGES_RUN, '${{ inputs.run-directory }}');
  const generate = parse(await readFile('actions/generate/action.yml', 'utf8'));
  assert.ok(!generate.runs.steps[1].run.includes('${{ inputs.'));
  const workflow = parse(await readFile('.github/workflows/pages.yml', 'utf8'));
  assert.equal(workflow.jobs.deploy.needs, 'build');
  assert.equal(workflow.jobs.deploy.permissions.pages, 'write');
  assert.equal(workflow.jobs.deploy.permissions['id-token'], 'write');
  assert.equal(workflow.jobs.deploy.environment.name, 'github-pages');
  assert.equal(workflow.jobs.deploy.steps[0].uses, 'actions/deploy-pages@v4');
  assert.match(workflow.jobs.build.if, /conclusion == 'success'/);
  assert.match(workflow.jobs.build.if, /head_repository.full_name == github.repository/);
});
