import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { main } from '../src/cli.js';

test('CLI rejects explicit empty profile selections instead of silently executing the default', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-cli-profile-'));
  try {
    const config = join(root, 'config.json');
    await writeFile(
      config,
      JSON.stringify({ title: 'Guide', baseURL: 'http://127.0.0.1:1', features: ['*.feature'] }),
    );
    for (const flag of ['--profile', '--profiles']) {
      await assert.rejects(
        main(['run', '--config', config, flag, '']),
        /Too small|Unknown profile|nonempty|at least|empty|minimum/i,
      );
    }
    await assert.rejects(
      main(['run', '--config', config, '--profile', '', '--profiles', 'desktop']),
      /not both/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  test(
    `CLI ${signal} interrupts a browser wait and retains failed evidence`,
    { timeout: 30000 },
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'hooserguide-cli-cancel-'));
      let child: ReturnType<typeof spawn> | undefined;
      let interrupt: ReturnType<typeof setTimeout> | undefined;
      const http = createServer((_req, res) => {
        res.end('<h1>Welcome</h1>');
        interrupt ??= setTimeout(() => child?.kill(signal), 200);
      });
      await new Promise<void>((done) => http.listen(0, '127.0.0.1', done));
      try {
        const address = http.address() as { port: number };
        await writeFile(
          join(root, 'task.feature'),
          'Feature: Task\n Scenario: Wait\n  Given I open "/"\n  Then "#never" is visible\n  And I capture "Welcome"\n',
        );
        const config = join(root, 'config.json');
        await writeFile(
          config,
          JSON.stringify({
            title: 'Cancelled guide',
            baseURL: `http://127.0.0.1:${address.port}`,
            features: ['task.feature'],
            output: 'out',
            pdf: false,
            timeoutMs: 30000,
          }),
        );
        child = spawn(
          process.execPath,
          ['--import', 'tsx', resolve('src/cli.ts'), 'run', '--config', config, '--json'],
          { stdio: ['ignore', 'pipe', 'pipe'] },
        );
        let stdout = '',
          stderr = '';
        child.stdout!.on('data', (data) => {
          stdout += data;
        });
        child.stderr!.on('data', (data) => {
          stderr += data;
        });
        const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
          (done, reject) => {
            child!.once('error', reject);
            child!.once('close', (code, signal) => done({ code, signal }));
          },
        );
        assert.equal(exit.signal, null, stderr);
        assert.equal(exit.code, 1, stderr);
        const summary = JSON.parse(stdout);
        assert.equal(summary.status, 'failed');
        assert.deepEqual(Object.keys(summary.artifacts), ['report']);
        const report = JSON.parse(await readFile(summary.artifacts.report, 'utf8'));
        assert.match(report.chapters[0].error, /cancelled/i);
        const files = await readdir(summary.directory);
        assert.ok(
          !files.some((file) => ['index.html', 'handbook.md', 'handbook.pdf'].includes(file)),
        );
        assert.ok(
          !(await readdir(join(root, 'out'))).some((file) =>
            /^\.(?:staging|run-|build-)/.test(file),
          ),
        );
      } finally {
        if (interrupt) clearTimeout(interrupt);
        child?.kill('SIGKILL');
        await new Promise<void>((done) => http.close(() => done()));
        await rm(root, { recursive: true, force: true });
      }
    },
  );
}
