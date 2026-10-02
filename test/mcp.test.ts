import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm, readFile, symlink, mkdir } from 'node:fs/promises';
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
        timeoutMs: 500,
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
      'hooserguide_bundle',
      'hooserguide_compare_runs',
      'hooserguide_generate',
      'hooserguide_inspect_capture',
      'hooserguide_inspect_run',
      'hooserguide_rebuild',
      'hooserguide_status',
      'hooserguide_steps',
      'hooserguide_validate',
    ]);
    for (const tool of tools.tools) {
      assert.ok(tool.title);
      assert.ok(tool.outputSchema);
      assert.equal(tool.inputSchema.additionalProperties, false);
    }
    assert.ok(client.getInstructions()?.includes('runId'));
    assert.deepEqual((await client.listPrompts()).prompts.map((p) => p.name).sort(), [
      'author-user-guide',
      'review-user-guide',
    ]);
    const status = await client.callTool({ name: 'hooserguide_status', arguments: {} });
    assert.equal(status.isError, false);
    assert.equal((status.structuredContent as any).project.configPath, path);
    assert.deepEqual((status.structuredContent as any).runs, []);
    const invalid = await client.callTool({
      name: 'hooserguide_generate',
      arguments: { unknown: true },
    });
    assert.equal(invalid.isError, true);
    const badProfile = await client.callTool({
      name: 'hooserguide_validate',
      arguments: { profile: 'absent' },
    });
    assert.equal((badProfile.structuredContent as any).error.code, 'CONFIG_ERROR');
    const resources = await client.listResources();
    assert.ok(resources.resources.some((r) => r.uri === 'hooserguide://project'));
    assert.equal((await client.listResourceTemplates()).resourceTemplates.length, 1);
    const project = await client.readResource({ uri: 'hooserguide://project' });
    assert.match((project.contents[0] as { text: string }).text, /MCP guide/);
    const before = await client.callTool({
      name: 'hooserguide_inspect_capture',
      arguments: { chapter: 1, capture: 1 },
    });
    assert.equal(before.isError, true);
    assert.equal((before.structuredContent as any).error.code, 'NO_RUN');
    const beforeBuild = await client.callTool({
      name: 'hooserguide_rebuild',
      arguments: { pdf: false },
    });
    assert.equal(beforeBuild.isError, true);
    const catalogue = await client.callTool({ name: 'hooserguide_steps', arguments: {} });
    assert.ok(
      (catalogue.structuredContent as { steps: { example: string }[] }).steps.some(
        (s) => s.example === 'I fill the form:',
      ),
    );
    const validation = await client.callTool({ name: 'hooserguide_validate', arguments: {} });
    assert.equal((validation.structuredContent as { valid: boolean }).valid, true);
    const progress: number[] = [];
    const generated = await client.callTool(
      { name: 'hooserguide_generate', arguments: {} },
      undefined,
      {
        onprogress: (p) => {
          progress.push(p.progress);
        },
      },
    );
    assert.ok(progress.length >= 4);
    assert.ok(progress.every((p, i) => i === 0 || p >= progress[i - 1]!));
    const runId = (generated.structuredContent as any).runId;
    const directory = (generated.structuredContent as any).directory;
    const reportResource = await client.readResource({
      uri: `hooserguide://runs/${runId}/report.json`,
    });
    assert.equal(
      JSON.parse((reportResource.contents[0] as { text: string }).text).status,
      'passed',
    );
    const compared = await client.callTool({
      name: 'hooserguide_compare_runs',
      arguments: { beforeRunId: runId, afterRunId: runId },
    });
    assert.equal(compared.isError, false);
    assert.equal((compared.structuredContent as any).comparison.totals.unchanged, 1);
    const packaged = await client.callTool({ name: 'hooserguide_bundle', arguments: { runId } });
    assert.equal(packaged.isError, false);
    assert.ok((packaged.structuredContent as any).path.endsWith('.zip'));
    await assert.rejects(
      client.readResource({ uri: `hooserguide://runs/${runId}/../../config.json` }),
    );
    const raw = await client.callTool({
      name: 'hooserguide_inspect_capture',
      arguments: { runId, chapter: 1, capture: 1, variant: 'raw' },
    });
    assert.equal(raw.isError, false);
    assert.equal((raw.structuredContent as any).hashVerified, true);
    const missing = await client.callTool({
      name: 'hooserguide_inspect_capture',
      arguments: { runId, chapter: 2, capture: 1 },
    });
    assert.equal((missing.structuredContent as any).error.code, 'CAPTURE_NOT_FOUND');
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
    await writeFile(
      join(root, 'welcome.feature'),
      'Feature: Welcome\n Scenario: Failed attempt\n  Given I open "/"\n  Then "#missing" is visible\n  And I capture "Missing"\n',
    );
    const failed = await client.callTool({ name: 'hooserguide_generate', arguments: {} });
    assert.equal(failed.isError, true);
    const pinned = await client.callTool({ name: 'hooserguide_inspect_run', arguments: { runId } });
    assert.equal((pinned.structuredContent as any).report.status, 'passed');
    const latest = await client.callTool({ name: 'hooserguide_inspect_run', arguments: {} });
    assert.equal(latest.isError, false);
    assert.equal((latest.structuredContent as any).report.status, 'failed');
    const rebuilt = await client.callTool({
      name: 'hooserguide_rebuild',
      arguments: { pdf: false },
    });
    assert.equal(rebuilt.isError, false);
    assert.notEqual(
      (rebuilt.structuredContent as { directory: string }).directory,
      (generated.structuredContent as { directory: string }).directory,
    );
    await client.close();
    const restarted = new Client({ name: 'restart-test', version: '1.0.0' });
    await restarted.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ['--import', 'tsx', resolve('src/cli.ts'), 'mcp', '--config', path],
        stderr: 'pipe',
      }),
    );
    try {
      const corruptId = 'run-9999-01-01T00-00-00-000Z-aaaaaaaa';
      await mkdir(join(root, 'out', corruptId));
      await writeFile(join(root, 'out', corruptId, 'report.json'), '{}');
      const defaultBuild = await restarted.callTool({
        name: 'hooserguide_rebuild',
        arguments: { pdf: false },
      });
      assert.equal(defaultBuild.isError, false);
      const recent = await restarted.callTool({ name: 'hooserguide_status', arguments: {} });
      assert.equal((recent.structuredContent as any).unreadableRuns, 1);
      const old = await restarted.callTool({
        name: 'hooserguide_inspect_run',
        arguments: { runId },
      });
      assert.equal((old.structuredContent as any).run.runId, runId);
      const shot = (raw.structuredContent as any).capture;
      const imagePath = join(directory, shot.image);
      const original = await readFile(imagePath);
      await writeFile(imagePath, Buffer.concat([original, Buffer.from('tampered')]));
      const tampered = await restarted.callTool({
        name: 'hooserguide_inspect_capture',
        arguments: { runId, chapter: 1, capture: 1 },
      });
      assert.equal((tampered.structuredContent as any).error.code, 'HASH_MISMATCH');
      await rm(imagePath);
      await writeFile(join(root, 'outside.png'), original);
      await symlink(join(root, 'outside.png'), imagePath);
      const escaped = await restarted.callTool({
        name: 'hooserguide_inspect_capture',
        arguments: { runId, chapter: 1, capture: 1 },
      });
      assert.equal((escaped.structuredContent as any).error.code, 'UNSAFE_PATH');
    } finally {
      await restarted.close();
    }
  } finally {
    await client.close();
    await new Promise<void>((resolve) => http.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

test('MCP cancellation interrupts browser waits, releases busy state and keeps failure evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-cancel-'));
  const http = createServer((_req, res) => res.end('<h1>Welcome</h1>'));
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const client = new Client({ name: 'cancel-test', version: '1.0.0' });
  try {
    const path = join(root, 'config.json');
    await writeFile(
      join(root, 'wait.feature'),
      'Feature: Wait\n Scenario: Wait for absent target\n  Given I open "/"\n  Then "#never" is visible\n  And I capture "Never"\n',
    );
    await writeFile(
      join(root, 'plugin.mjs'),
      'console.log("plugin diagnostic"); export function register() { console.log("registry diagnostic"); }',
    );
    await writeFile(
      path,
      JSON.stringify({
        title: 'Cancellation',
        baseURL: `http://127.0.0.1:${(http.address() as { port: number }).port}/?private=secret`,
        features: ['wait.feature'],
        plugins: ['plugin.mjs'],
        output: 'out',
        pdf: false,
        timeoutMs: 30000,
      }),
    );
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ['--import', 'tsx', resolve('src/cli.ts'), 'mcp', '--config', path],
        stderr: 'pipe',
      }),
    );
    assert.equal(
      (await client.callTool({ name: 'hooserguide_steps', arguments: {} })).isError,
      false,
    );
    const controller = new AbortController();
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pending = client.callTool({ name: 'hooserguide_generate', arguments: {} }, undefined, {
      signal: controller.signal,
      onprogress: (p) => {
        if (p.progress >= 1) started();
      },
    });
    // Attach rejection handling before sending cancellation.
    const cancelled = pending.then(
      () => false,
      () => true,
    );
    await ready;
    const status = await client.callTool({ name: 'hooserguide_status', arguments: {} });
    assert.equal((status.structuredContent as any).busy, true);
    assert.ok(!JSON.stringify(status.structuredContent).includes('private=secret'));
    const busy = await client.callTool({ name: 'hooserguide_generate', arguments: {} });
    assert.equal((busy.structuredContent as any).error.code, 'BUSY');
    controller.abort();
    assert.equal(await cancelled, true);
    const deadline = Date.now() + 10000;
    let settled;
    do {
      settled = await client.callTool({ name: 'hooserguide_status', arguments: {} });
      if (!(settled.structuredContent as any).busy) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    } while (Date.now() < deadline);
    assert.equal((settled.structuredContent as any).busy, false);
    const evidence = await client.callTool({ name: 'hooserguide_inspect_run', arguments: {} });
    assert.equal((evidence.structuredContent as any).report.status, 'failed');
    assert.match((evidence.structuredContent as any).report.chapters[0].error, /cancelled/);
    assert.equal((evidence.structuredContent as any).run.artifacts.html, undefined);
    assert.equal(
      (await client.callTool({ name: 'hooserguide_validate', arguments: {} })).isError,
      false,
    );
  } finally {
    await client.close();
    await new Promise<void>((resolve) => http.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
