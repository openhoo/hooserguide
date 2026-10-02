import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Config } from './types.js';
import { run } from './runner.js';

/** Self-contained demo: loopback server, real browser, real PDF, no credentials. */
export async function demo(
  output: string,
  overrides: Partial<
    Pick<Config, 'title' | 'language' | 'document' | 'manual' | 'branding' | 'captureDefaults'>
  > = {},
) {
  const html = await readFile(new URL('../examples/app.html', import.meta.url));
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Demo server failed to start');
  try {
    return await run({
      title: 'HooTasks — User guide',
      baseURL: `http://127.0.0.1:${address.port}`,
      features: [
        fileURLToPath(
          new URL(
            overrides.language?.split('-')[0] === 'de'
              ? '../examples/tasks.de.feature'
              : '../examples/tasks.feature',
            import.meta.url,
          ),
        ),
      ],
      output,
      viewport: { width: 1280, height: 900 },
      masks: ['testid=account-email'],
      tag: '@manual',
      document: {
        version: '1.0',
        audience: 'Workspace members',
        summary: 'Create, organize and verify tasks in your HooTasks workspace.',
      },
      ...overrides,
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
