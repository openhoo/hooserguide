import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('MCP stdio exposes tools, validates, executes a guide and returns the real screenshot', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-mcp-'));
  const http = createServer((_req, res) => res.end('<h1>Welcome</h1>'));
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const client = new Client({ name: 'integration-test', version: '1.0.0' });
  try {
    const address = http.address() as { port: number };
    await writeFile(
      join(root, 'welcome.feature'),
      'Feature: Welcome\n Scenario: Read welcome\n  Given I open "/"\n  Then "role=heading:Welcome" is visible\n  And I capture "Welcome"\n',
    );
    const path = join(root, 'hooserguide.config.json');
    await writeFile(
      path,
      JSON.stringify({
        title: 'MCP guide',
        baseURL: `http://127.0.0.1:${address.port}`,
        features: ['welcome.feature'],
        output: 'out',
        pdf: false,
      }),
    );
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', resolve('src/cli.ts'), 'mcp', '--config', path],
      stderr: 'pipe',
    });
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((t) => t.name).sort(), [
      'hooserguide_generate',
      'hooserguide_inspect_capture',
      'hooserguide_validate',
    ]);
    const before = await client.callTool({
      name: 'hooserguide_inspect_capture',
      arguments: { chapter: 1, capture: 1 },
    });
    assert.equal(before.isError, true);
    const validation = await client.callTool({ name: 'hooserguide_validate', arguments: {} });
    assert.equal((validation.structuredContent as { valid: boolean }).valid, true);
    const generated = await client.callTool({ name: 'hooserguide_generate', arguments: {} });
    assert.equal(generated.isError, false);
    assert.equal((generated.structuredContent as { status: string }).status, 'passed');
    const inspected = await client.callTool({
      name: 'hooserguide_inspect_capture',
      arguments: { chapter: 1, capture: 1 },
    });
    const content = inspected.content as { type: string; data?: string; mimeType?: string }[];
    assert.equal(content[0]!.mimeType, 'image/png');
    assert.ok(
      Buffer.from(content[0]!.data!, 'base64')
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    );
    const prompt = await client.getPrompt({ name: 'author-user-guide' });
    assert.equal(prompt.messages[0]!.role, 'user');
  } finally {
    await client.close();
    await new Promise<void>((resolve) => http.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
