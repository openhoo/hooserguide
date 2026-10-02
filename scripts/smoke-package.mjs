import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

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
  const version = execFileSync(binary, ['--version'], { encoding: 'utf8' }).trim();
  if (version !== '0.1.0') throw new Error(`Unexpected version: ${version}`);
  execFileSync(binary, ['init', 'docs/guide', '--skills', '--json'], { cwd: root, stdio: 'pipe' });
  execFileSync(binary, ['validate', '--config', 'docs/guide/hooserguide.config.json', '--json'], {
    cwd: root,
    stdio: 'pipe',
  });
  await access(join(root, 'docs/guide/.agents/skills/hooserguide-author/SKILL.md'));
  const demo = JSON.parse(
    execFileSync(binary, ['demo', '--output', 'out', '--json'], { cwd: root, encoding: 'utf8' }),
  );
  if (demo.status !== 'passed') throw new Error('Installed package demo failed');
  for (const path of Object.values(demo.artifacts)) await access(path);
  console.log(
    '✓ Installed tarball: bin, init, skills, validation, browser capture and pdfcn PDF verified',
  );
} finally {
  await rm(root, { recursive: true, force: true });
  if (tarball) await rm(tarball, { force: true });
}
