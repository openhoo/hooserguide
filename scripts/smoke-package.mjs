import { parseAllDocuments } from 'yaml';
import { once } from 'node:events';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm, access, readFile, mkdir, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = await mkdtemp(join(tmpdir(), 'hooserguide-package-'));
let tarball;
try {
  await mkdir('dist', { recursive: true });
  await writeFile('dist/__stale-module.js', 'throw new Error(\"obsolete module must not ship\");');
  const pack = JSON.parse(
    execFileSync('npm', ['pack', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    }),
  );
  tarball = resolve(pack[0].filename);
  if (
    pack[0].files.some(
      (file) => file.path === 'dist/__stale-module.js' || file.path.startsWith('dist/mcp-runs.'),
    )
  )
    throw new Error('Package contains stale modules from an earlier build');
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({ name: 'hooserguide-consumer', private: true }),
  );
  execFileSync('npm', ['install', '--no-audit', '--no-fund', tarball], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const binary = join(root, 'node_modules/.bin/hooserguide');
  const catalogue = JSON.parse(
    execFileSync(binary, ['steps', '--json'], { cwd: root, encoding: 'utf8' }),
  );
  if (!catalogue.steps.some((step) => step.example === 'I fill the form:'))
    throw new Error('Installed step catalogue is incomplete');
  const version = execFileSync(binary, ['--version'], { encoding: 'utf8' }).trim();
  const expected = JSON.parse(await readFile('package.json', 'utf8')).version;
  if (version !== expected) throw new Error(`Unexpected version: ${version}`);
  execFileSync(binary, ['init', 'docs/guide', '--skills', '--json'], { cwd: root, stdio: 'pipe' });
  execFileSync(binary, ['validate', '--config', 'docs/guide/hooserguide.config.json', '--json'], {
    cwd: root,
    stdio: 'pipe',
  });
  await access(join(root, 'docs/guide/.agents/skills/hooserguide-author/SKILL.md'));
  await access(join(root, 'docs/guide/.agents/skills/hooserguide-author/references/authoring.md'));
  await access(
    join(root, 'docs/guide/.agents/skills/hooserguide-review/references/mcp-workflow.md'),
  );
  const mcp = new Client({ name: 'installed-package-test', version: '1.0.0' });
  try {
    await mcp.connect(
      new StdioClientTransport({
        command: binary,
        args: ['mcp', '--config', join(root, 'docs/guide/hooserguide.config.json')],
        stderr: 'pipe',
      }),
    );
    if ((await mcp.listTools()).tools.length !== 9) throw new Error('Installed MCP tools missing');
    const status = await mcp.callTool({ name: 'hooserguide_status', arguments: {} });
    if (status.isError || status.structuredContent?.status !== 'passed')
      throw new Error('Installed MCP status failed');
    const validation = await mcp.callTool({ name: 'hooserguide_validate', arguments: {} });
    if (validation.isError) throw new Error('Installed MCP validation failed');
  } finally {
    await mcp.close();
  }
  const demo = JSON.parse(
    execFileSync(binary, ['demo', '--output', 'out', '--json'], { cwd: root, encoding: 'utf8' }),
  );
  if (demo.status !== 'passed') throw new Error('Installed package demo failed');
  for (const path of Object.values(demo.artifacts)) await access(path);
  const rebuilt = JSON.parse(
    execFileSync(
      binary,
      [
        'build',
        demo.directory,
        '--output',
        'rebuilt',
        '--page-size',
        'Letter',
        '--orientation',
        'landscape',
        '--margin',
        '36',
        '--json',
      ],
      {
        cwd: root,
        encoding: 'utf8',
      },
    ),
  );
  if (rebuilt.status !== 'passed') throw new Error('Installed package rebuild failed');
  for (const path of Object.values(rebuilt.artifacts)) await access(path);
  const evidence = JSON.parse(await readFile(rebuilt.artifacts.report, 'utf8'));
  if (
    evidence.manual.pageSize !== 'Letter' ||
    evidence.manual.orientation !== 'landscape' ||
    evidence.manual.margin !== 36
  )
    throw new Error('Installed layout overrides failed');
  if (!evidence.rebuiltAt || !evidence.sourceReportSha256)
    throw new Error('Rebuild provenance is missing');
  const comparison = JSON.parse(
    execFileSync(binary, ['compare', demo.directory, rebuilt.directory, '--json'], {
      cwd: root,
      encoding: 'utf8',
    }),
  );
  if (comparison.totals.changed || !comparison.totals.unchanged)
    throw new Error('Installed comparison failed');
  const inspected = JSON.parse(
    execFileSync(binary, ['inspect', demo.directory, '--json'], { cwd: root, encoding: 'utf8' }),
  );
  if (!inspected.verifiedImages) throw new Error('Installed evidence inspection failed');
  const archive = JSON.parse(
    execFileSync(binary, ['bundle', rebuilt.directory, '--json'], { cwd: root, encoding: 'utf8' }),
  );
  await access(archive.path);
  await access(join(root, 'node_modules/@openhoo/hooserguide/docs/gitlab.md'));
  await access(
    join(root, 'docs/guide/.agents/skills/hooserguide-review/references/ci-integration.md'),
  );
  await access(join(root, 'docs/guide/.agents/skills/hooserguide-author/references/responsive.md'));
  await mkdir(join(root, '.ci-package'));
  await copyFile(tarball, join(root, '.ci-package/fixture.tgz'));
  const componentDocuments = parseAllDocuments(
    await readFile(
      join(root, 'node_modules/@openhoo/hooserguide/templates/generate/template.yml'),
      'utf8',
    ),
  );
  if (componentDocuments.some((document) => document.errors.length))
    throw new Error('Installed component YAML is invalid');
  const inputs = componentDocuments[0].toJS().spec.inputs;
  const job = componentDocuments[1].toJS()['$[[ inputs.job-name ]]'];
  const componentEnv = {};
  for (const [name, variable] of Object.entries(job.variables))
    componentEnv[name] = variable.value.replace(/\$\[\[ inputs\.([\w-]+) \]\]/g, (_match, key) =>
      String(inputs[key].default),
    );
  await mkdir(join(root, 'component-out'));
  await writeFile(join(root, 'component-out/stale.txt'), 'must stay outside the job upload');
  const manifestBefore = await readFile(join(root, 'package.json'));
  const lockBefore = await readFile(join(root, 'package-lock.json'));
  const app = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      'import {createServer} from "node:http"; const server=createServer((_q,r)=>r.end("<h1>Welcome</h1>")); server.listen(0,"127.0.0.1",()=>console.log(server.address().port));',
    ],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  );
  try {
    const [port] = await once(app.stdout, 'data');
    const baseURL = `http://127.0.0.1:${String(port).trim()}`;
    const generated = JSON.parse(
      execFileSync('/bin/sh', ['-c', job.script[0]], {
        cwd: root,
        encoding: 'utf8',
        timeout: 120000,
        env: {
          ...process.env,
          ...componentEnv,
          CI_PROJECT_DIR: root,
          CI_JOB_ID: '91001',
          HOOSERGUIDE_CI_PACKAGE: 'file:.ci-package/fixture.tgz',
          HOOSERGUIDE_CI_CONFIG: 'docs/guide/hooserguide.config.json',
          HOOSERGUIDE_CI_PROFILES: 'desktop,mobile',
          HOOSERGUIDE_CI_SCREEN_LAYOUT: 'side-by-side',
          HOOSERGUIDE_CI_OUTPUT: 'component-out',
          HOOSERGUIDE_CI_BASE_URL: baseURL,
          HOOSERGUIDE_CI_WAIT_URL: baseURL,
        },
        stdio: ['ignore', 'pipe', 'inherit'],
      }),
    );
    if (generated.status !== 'passed' || !generated.artifacts.pdf || !generated.artifacts.bundle)
      throw new Error(`Installed component failed: ${generated.error}`);
    if (generated.chapters.length !== 2 || generated.chapters[1].variant.profile !== 'mobile')
      throw new Error('Packaged responsive execution is missing');
    for (const path of Object.values(generated.artifacts)) await access(join(root, path));
    if (
      !(await readFile(join(root, 'package.json'))).equals(manifestBefore) ||
      !(await readFile(join(root, 'package-lock.json'))).equals(lockBefore)
    )
      throw new Error('Component modified application dependency files');
    const summary = JSON.parse(
      await readFile(join(root, 'component-out/job-91001/summary.json'), 'utf8'),
    );
    if (
      (await readFile(join(root, 'component-out/stale.txt'), 'utf8')) !==
      'must stay outside the job upload'
    )
      throw new Error('Component modified unrelated artifact-root data');
    if (!generated.directory.startsWith('component-out/job-91001/'))
      throw new Error('Component output is not job scoped');
    if (summary.status !== 'passed' || summary.browser !== 'chromium')
      throw new Error('Component summary is invalid');
  } finally {
    const exited = once(app, 'exit');
    app.kill();
    await exited;
  }
  console.log(
    '✓ Installed tarball: bin, init, skills with references, MCP stdio, step discovery, validation, browser capture, rebuild, pdfcn PDF and real GitLab component shell verified',
  );
} finally {
  await rm(root, { recursive: true, force: true });
  if (tarball) await rm(tarball, { force: true });
}
