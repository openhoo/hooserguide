import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { loadConfig } from './config.js';
import { run, validate, type RunResult } from './runner.js';

export function createMcpServer(configPath: string) {
  const server = new McpServer({ name: 'hooserguide', version: '0.1.0' });
  let last: RunResult | undefined;
  let busy = false;
  server.registerTool(
    'hooserguide_validate',
    {
      description:
        'Parse Gherkin and check all step bindings for the configured project without opening a browser.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const result = await validate(await loadConfig(configPath));
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
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async () => {
      if (busy)
        return { isError: true, content: [{ type: 'text', text: 'A run is already in progress' }] };
      busy = true;
      try {
        last = await run(await loadConfig(configPath));
        const summary = {
          status: last.report.status,
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
            text: 'Inspect the actual app and write @manual Gherkin scenarios using hooserguide built-in steps. Add I explain steps for user-facing instructions and I capture steps with JSON marks (target, kind: box/arrow/both, label, caption). Use stable role/label/testid locators, assert saved outcomes and mask private data in every capture. Call hooserguide_validate, then hooserguide_generate. Inspect screenshots with hooserguide_inspect_capture and review the PDF. Report artifact paths and remaining limitations. Do not invent controls or claim success after a failed scenario.',
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
