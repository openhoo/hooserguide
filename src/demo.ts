import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { run } from './runner.js';

/** Self-contained demo: loopback server, real browser, real PDF, no credentials. */
export async function demo(output: string) {
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
      features: [fileURLToPath(new URL('../examples/tasks.feature', import.meta.url))],
      output,
      viewport: { width: 1280, height: 900 },
      masks: ['testid=account-email'],
      tag: '@manual',
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
