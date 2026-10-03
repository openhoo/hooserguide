import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { demo } from '../dist/demo.js';

const output = resolve('output/responsive-demo');
await mkdir(output, { recursive: true });
const result = await demo(output, {
  title: 'HooTasks — Desktop, Tablet & Mobile',
  profiles: {
    desktop: { viewport: { width: 1280, height: 900 } },
    tablet: { viewport: { width: 768, height: 1024 }, hasTouch: true },
    mobile: {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    },
  },
  responsive: {
    profiles: ['desktop', 'tablet', 'mobile'],
    layout: 'side-by-side',
    labels: { desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile' },
  },
  manual: { orientation: 'landscape' },
});
if (result.report.status !== 'passed')
  throw new Error(
    result.report.exportError ??
      result.report.chapters.find((c) => c.error)?.error ??
      'Responsive demo failed',
  );
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  await page.goto(pathToFileURL(result.artifacts.html).href);
  await page
    .locator('.screen-group')
    .first()
    .screenshot({ path: join(output, 'comparison.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator('.screen-group')
    .first()
    .screenshot({ path: join(output, 'mobile-reader.png') });
} finally {
  await browser.close();
}
console.log(
  JSON.stringify(
    {
      directory: result.directory,
      artifacts: result.artifacts,
      comparison: join(output, 'comparison.png'),
    },
    null,
    2,
  ),
);
