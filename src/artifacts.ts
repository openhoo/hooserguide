import { writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { renderManual } from './render.js';
import { renderPdf } from './pdf.js';
import type { RunReport, RunResult } from './types.js';

/** Both browser runs and evidence-only rebuilds publish through the same gate. */
export async function publishReport(
  report: RunReport,
  staging: string,
  output: string,
  pdf = true,
): Promise<RunResult> {
  if (report.status === 'passed') {
    try {
      if (pdf) await renderPdf(report, staging);
      await renderManual(report, staging);
    } catch (error) {
      report.status = 'failed';
      report.exportError = error instanceof Error ? error.message : String(error);
      await Promise.all(
        ['index.html', 'handbook.md', 'handbook.pdf'].map((name) =>
          rm(join(staging, name), { force: true }),
        ),
      );
    }
  }
  await writeFile(join(staging, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  const timestamp = report.rebuiltAt ?? report.generatedAt;
  const directory = join(
    output,
    `${report.rebuiltAt ? 'build' : 'run'}-${timestamp.replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`,
  );
  await rename(staging, directory);
  const artifacts: RunResult['artifacts'] = { report: join(directory, 'report.json') };
  if (report.status === 'passed') {
    artifacts.html = join(directory, 'index.html');
    artifacts.markdown = join(directory, 'handbook.md');
    if (pdf) artifacts.pdf = join(directory, 'handbook.pdf');
  }
  return { report, directory, artifacts };
}
