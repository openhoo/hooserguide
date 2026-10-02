import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { loadConfig } from './config.js';
import { run, validate, loadRegistry, type RunResult } from './runner.js';
import { build } from './build.js';
import { VERSION } from './version.js';

export function createMcpServer(configPath: string) {
  const server = new McpServer({ name: 'hooserguide', version: VERSION });
  let last: RunResult | undefined;
  let successful: RunResult | undefined;
  let busy = false;
  server.registerTool(
    'hooserguide_validate',
    {
      description:
        'Parse Gherkin and check all step bindings for the configured project without opening a browser.',
      inputSchema: { profile: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ profile }) => {
      const result = await validate(await loadConfig(configPath, profile ? { profile } : {}));
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
  server.registerTool(
    'hooserguide_generate',
    {
      description:
        'Execute the configured BDD workflows with Playwright and generate annotated screenshots, pdfcn PDF, HTML and Markdown. This interacts with the target app; use authorized workflows only.',
      inputSchema: { profile: z.string().optional() },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async ({ profile }) => {
      if (busy)
        return { isError: true, content: [{ type: 'text', text: 'A run is already in progress' }] };
      busy = true;
      try {
        last = undefined;
        last = await run(await loadConfig(configPath, profile ? { profile } : {}));
        if (last.report.status === 'passed') successful = last;
        const summary = {
          status: last.report.status,
          profile: last.report.profile,
          exportError: last.report.exportError,
          directory: last.directory,
          artifacts: last.artifacts,
          chapters: last.report.chapters.map((c) => ({
            title: c.title,
            status: c.status,
            captures: c.captures.length,
            error: c.error,
          })),
        };
        return {
          isError: last.report.status !== 'passed',
          content: [{ type: 'text', text: JSON.stringify(summary) }],
          structuredContent: summary,
        };
      } finally {
        busy = false;
      }
    },
  );
  server.registerTool(
    'hooserguide_steps',
    {
      description:
        'List supported BDD step patterns, examples and descriptions, including configured custom plugins.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const result = { steps: (await loadRegistry(await loadConfig(configPath))).list() };
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
  server.registerTool(
    'hooserguide_rebuild',
    {
      description:
        'Re-export the latest successful evidence without interacting with the app. Verifies screenshot hashes and applies branding from the configured project.',
      inputSchema: { pdf: z.boolean().optional() },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ pdf }) => {
      if (busy)
        return { isError: true, content: [{ type: 'text', text: 'A run is already in progress' }] };
      if (!successful)
        return {
          isError: true,
          content: [{ type: 'text', text: 'Generate a successful guide before rebuilding' }],
        };
      busy = true;
      try {
        const config = await loadConfig(configPath);
        last = await build(successful.directory, {
          output: config.output,
          pdf: pdf ?? config.pdf,
          branding: config.branding,
        });
        if (last.report.status === 'passed') successful = last;
        const result = {
          status: last.report.status,
          exportError: last.report.exportError,
          directory: last.directory,
          artifacts: last.artifacts,
        };
        return {
          isError: last.report.status !== 'passed',
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result,
        };
      } finally {
        busy = false;
      }
    },
  );
  server.registerTool(
    'hooserguide_inspect_capture',
    {
      description:
        'Return an annotated screenshot and its reference legend from the latest run for visual review. Indices start at 1.',
      inputSchema: { chapter: z.number().int().min(1), capture: z.number().int().min(1) },
      annotations: { readOnlyHint: true },
    },
    async ({ chapter, capture }) => {
      const image = last?.report.chapters[chapter - 1]?.captures[capture - 1];
      if (!last || !image)
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'Capture unavailable; generate a guide first and use valid indices',
            },
          ],
        };
      const png = await readFile(join(last.directory, image.image));
      return {
        content: [
          { type: 'image', data: png.toString('base64'), mimeType: 'image/png' },
          { type: 'text', text: JSON.stringify(image) },
        ],
      };
    },
  );
  server.registerPrompt(
    'author-user-guide',
    {
      description: 'Author a verified user guide using the configured project and available tools.',
    },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'Use hooserguide_steps to discover supported steps. Inspect the actual app and write @manual Gherkin scenarios using hooserguide built-in steps. Add I explain steps for user-facing instructions and I capture steps with JSON marks (target, kind: box/arrow/both, label, caption). Use focus and autoLabels for detailed captures, named profiles for responsive workflows, and stable role/label/testid locators, assert saved outcomes and mask private data in every capture. Call hooserguide_validate, then hooserguide_generate. Inspect screenshots with hooserguide_inspect_capture and review the PDF. Report artifact paths and remaining limitations. Do not invent controls or claim success after a failed scenario.',
          },
        },
      ],
    }),
  );
  return server;
}
export async function serveMcp(configPath: string) {
  await loadConfig(configPath); // Fail early with a meaningful configuration error.
  await createMcpServer(configPath).connect(new StdioServerTransport());
}
