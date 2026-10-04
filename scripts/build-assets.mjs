import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { z } from 'zod';
import { configSchema } from '../dist/config.js';
import { captureSchema } from '../dist/capture.js';
import { reportSchema } from '../dist/report.js';
import { authoringSchema } from '../dist/authoring.js';

await mkdir('schemas', { recursive: true });
for (const [name, schema] of [
  ['config', configSchema],
  ['capture', captureSchema.omit({ title: true })],
  ['report', reportSchema],
  ['authoring', authoringSchema],
]) {
  await writeFile(
    `schemas/${name}.schema.json`,
    JSON.stringify(z.toJSONSchema(schema), null, 2) + '\n',
  );
}
await mkdir('dist/pdfcn', { recursive: true });
await copyFile('src/pdfcn/LICENSE', 'dist/pdfcn/LICENSE');
