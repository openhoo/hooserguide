import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm, access, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = await mkdtemp(join(tmpdir(), 'hooserguide-package-'));
let tarball;
try {
  const pack = JSON.parse(
    execFileSync('npm', ['pack', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    }),
  );
  tarball = resolve(pack[0].filename);
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
  console.log(
    '✓ Installed tarball: bin, init, skills with references, MCP stdio, step discovery, validation, browser capture, rebuild and pdfcn PDF verified',
  );
} finally {
  await rm(root, { recursive: true, force: true });
  if (tarball) await rm(tarball, { force: true });
}
