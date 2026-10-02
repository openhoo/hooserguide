import { verifyReportImages } from './evidence.js';
import { reportSchema, requireSuccessfulEvidence } from './report.js';
import { access, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { escapeXml as esc } from './capture.js';
import type { RunReport } from './types.js';
import { brandingSchema } from './config.js';
import { manualLabels } from './manual.js';
import { viewerScript } from './viewer.js';
import { badgeTextColor } from './annotations.js';

const md = (s: string) =>
  s.replace(/[\\`*_{}\[\]()<>#!|]/g, (c) => `\\${c}`).replace(/\r?\n/g, ' ');
export async function renderManual(report: RunReport, directory: string): Promise<void> {
  report = reportSchema.parse(report) as RunReport;
  requireSuccessfulEvidence(report);
  await verifyReportImages(report, directory);
  const branding = brandingSchema.parse(report.branding ?? {});
  const accent = branding.accentColor ?? '#075e59';
  const brand = branding.name ?? 'hooserguide';
  const l = manualLabels(report.language);
  const document = report.document ?? {};
  const showDate = report.manual?.showGeneratedAt !== false;
  const metadata = [
    ...(document.version ? [`${l.version}: ${document.version}`] : []),
    ...(document.productVersion ? [`${l.productVersion}: ${document.productVersion}`] : []),
    ...(document.audience ? [`${l.audience}: ${document.audience}`] : []),
    ...(showDate ? [`${l.generated}: ${report.generatedAt.slice(0, 10)}`] : []),
    ...(showDate && report.rebuiltAt ? [`${l.rebuilt}: ${report.rebuiltAt.slice(0, 10)}`] : []),
  ];
  const markdown = [`# ${md(report.title)}`, '', ...metadata.map(md), ''];
  if (document.summary) markdown.push(md(document.summary), '');
  if (report.manual?.contents !== false)
    markdown.push(
      `## ${l.contents}`,
      '',
      ...report.chapters.map((c, i) => `${i + 1}. ${md(c.title)}`),
      '',
    );
  if (branding.subtitle) markdown.push(md(branding.subtitle), '');
  const chapters = report.chapters
    .map((c, i) => {
      markdown.push(`## ${i + 1}. ${md(c.title)}`, '', md(c.description), '');
      if (c.prerequisites?.length)
        markdown.push(
          `### ${l.prerequisites}`,
          '',
          ...c.prerequisites.map((text) => `- ${md(text)}`),
          '',
        );
      for (const callout of c.callouts ?? [])
        markdown.push(`> **${l[callout.kind]}:** ${md(callout.text)}`, '');
      const prerequisites = c.prerequisites?.length
        ? `<div class="prerequisites"><h3>${l.prerequisites}</h3><ul>${c.prerequisites.map((text) => `<li>${esc(text)}</li>`).join('')}</ul></div>`
        : '';
      const callouts = (c.callouts ?? [])
        .map(
          (callout) =>
            `<aside class="callout ${callout.kind}" aria-label="${l[callout.kind]}"><strong>${l[callout.kind]}</strong><p>${esc(callout.text)}</p></aside>`,
        )
        .join('');
      c.instructions.forEach((s, j) => markdown.push(`${j + 1}. ${md(s)}`));
      markdown.push('');
      const figures = c.captures
        .map((s, j) => {
          markdown.push(
            `### ${md(s.title)}`,
            '',
            md(s.description ?? ''),
            '',
            `![${md(s.title)}](${s.image})`,
            '',
          );
          const legend = s.marks
            .filter((m) => m.caption || m.label)
            .map((m) => {
              const label = m.label;
              markdown.push(
                label ? `- **${md(label)}**: ${md(m.caption ?? '')}` : `- ${md(m.caption ?? '')}`,
              );
              const color = m.color && /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : '#e11d48';
              return `<li>${label ? `<span class="ref" style="background:${color};color:${badgeTextColor(color)}">${esc(label)}</span>` : ''} ${esc(m.caption ?? '')}</li>`;
            })
            .join('');
          markdown.push('');
          return `<figure><img src="${esc(s.image)}" data-annotated="${esc(s.image)}" data-raw="${esc(s.raw)}" alt="${esc(s.title)}" loading="lazy" width="${s.width}" height="${s.height}"><figcaption><span class="eyebrow">${l.figure} ${i + 1}.${j + 1}</span><h3>${esc(s.title)}</h3><p>${esc(s.description ?? '')}</p>${legend ? `<ul class="legend">${legend}</ul>` : ''}</figcaption></figure>`;
        })
        .join('');
      return `<section id="chapter-${i + 1}"><div class="chapter-number">${String(i + 1).padStart(2, '0')}</div><h2>${esc(c.title)}</h2><p class="intro">${esc(c.description)}</p>${prerequisites}${callouts}${c.instructions.length ? `<ol class="instructions">${c.instructions.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}${figures}</section>`;
    })
    .join('');
  const pdfLink = await access(join(directory, 'handbook.pdf')).then(
    () => '<a href="handbook.pdf">PDF</a>',
    () => '',
  );
  const toolbar = `<div class="toolbar" hidden><label for="guide-search">${l.search}</label><div class="tools"><input id="guide-search" type="search" autocomplete="off" aria-controls="main" placeholder="${l.search}"><button id="annotations" type="button" aria-pressed="true">${l.annotations}</button><button id="print-guide" type="button">${l.print}</button></div><p id="search-results" role="status" aria-live="polite" data-label="${l.results}"></p></div>`;
  const html = `<!doctype html><html lang="${esc(report.language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="generator" content="hooserguide"><title>${esc(report.title)}</title><style>
  :root{color-scheme:light;--ink:#142636;--muted:#52667a;--accent:${accent};--line:#dce5e9}*{box-sizing:border-box}html{scroll-behavior:smooth}body{overflow-wrap:anywhere;margin:0;color:var(--ink);background:#f5f8fa;font:16px/1.7 system-ui,-apple-system,sans-serif}a{color:var(--accent)}a:focus-visible{outline:3px solid #f59e0b;outline-offset:4px}.skip{position:absolute;left:1rem;top:-100px}.skip:focus{top:1rem;background:white;padding:1rem;z-index:2}.layout{max-width:1380px;margin:auto;display:grid;grid-template-columns:265px minmax(0,1fr);gap:48px;padding:48px 32px}main,aside{min-width:0}.layout>aside{position:sticky;top:32px;align-self:start}.brand{font-weight:800;font-size:22px;letter-spacing:-.6px}.eyebrow{font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);font-weight:700}nav ol{list-style:none;padding:0}nav li{margin:8px 0}nav a{display:block;padding:8px 12px;border-left:2px solid var(--line);text-decoration:none;font-size:14px}nav a:hover{border-color:var(--accent);background:#eaf3f1}.hero{padding:48px;background:var(--ink);color:#fff;border-radius:20px;margin-bottom:32px}.hero .eyebrow{color:#a7d5ce}h1{font-size:clamp(32px,5vw,52px);line-height:1.12;letter-spacing:-1.5px;margin:16px 0 24px}h2{font-size:30px;line-height:1.25;letter-spacing:-.6px;margin:8px 0 16px}h3{font-size:19px;margin:8px 0}.hero p{color:#c7d7e2;margin:0;font-size:14px}section{background:white;border:1px solid var(--line);border-radius:18px;padding:40px;margin:0 0 32px;scroll-margin-top:24px}.chapter-number{color:var(--accent);font-weight:800;font-size:14px}.intro{color:var(--muted);white-space:pre-line}.instructions{padding-left:24px}.instructions li{padding:6px 0}figure{margin:28px 0 0;border:1px solid var(--line);border-radius:12px;overflow:hidden}figure img{width:100%;height:auto;display:block;background:#f1f5f9}figcaption{padding:22px;border-top:1px solid var(--line)}figcaption p{margin:8px 0;color:var(--muted)}.legend{list-style:none;margin:16px 0 0;padding:0}.legend li{display:flex;gap:12px;align-items:flex-start;margin:10px 0}.ref{flex-shrink:0;min-width:28px;text-align:center;border-radius:6px;background:#e11d48;color:white;font-size:13px;font-weight:700}footer{font-size:13px;color:var(--muted);padding:0 0 24px}footer a{margin-right:18px}@media(max-width:850px){.layout{grid-template-columns:1fr;padding:20px;gap:20px}.layout>aside{position:static}nav ol{display:flex;flex-wrap:wrap;gap:4px}nav li{margin:0}.hero,section{padding:24px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}@media print{body{background:white}.layout{display:block;padding:0}aside{display:none}.hero{background:white;color:var(--ink);padding:0}.hero p,.hero .eyebrow{color:var(--muted)}section{border:0;padding:16px 0;break-before:page}figure{break-inside:avoid}footer{display:none}}
  [hidden]{display:none!important}.toolbar{background:white;border:1px solid var(--line);padding:20px;border-radius:14px;margin-bottom:24px}.toolbar label{font-size:14px;font-weight:700}.tools{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px}.tools input{flex:1;min-width:160px}.tools input,.tools button{font:inherit;border:1px solid var(--line);border-radius:8px;padding:9px 12px;background:white;color:var(--ink)}.tools button{cursor:pointer}.tools button[aria-pressed=true]{background:var(--ink);color:white}.tools :focus-visible{outline:3px solid #f59e0b;outline-offset:3px}#search-results{margin:8px 0 0;font-size:13px;color:var(--muted)}.callout{position:static;border-left:4px solid #64748b;background:#f1f5f9;padding:16px 20px;margin:20px 0;border-radius:8px}.callout.tip{border-color:#075e59;background:#ecfdf5}.callout.warning{border-color:#b45309;background:#fffbeb}.callout p{margin:4px 0 0;white-space:pre-line}.prerequisites{margin:20px 0;padding:16px 20px;border:1px solid var(--line);border-radius:8px}.metadata{display:flex;flex-wrap:wrap;gap:4px 18px;padding:0;list-style:none}.hero .summary{font-size:18px;margin-bottom:20px;white-space:pre-line}@media print{.toolbar,#no-results{display:none!important}main>section[hidden]{display:block!important}.callout{display:block!important}figure img{print-color-adjust:exact}}
  </style></head><body><a class="skip" href="#main">${l.skip}</a><div class="layout"><aside><div class="brand">${esc(brand)}<span aria-hidden="true" style="color:${accent}">.</span></div><p class="eyebrow">${l.guide}</p><nav aria-label="${l.contents}"><ol>${report.chapters.map((c, i) => `<li><a href="#chapter-${i + 1}">${String(i + 1).padStart(2, '0')} &nbsp; ${esc(c.title)}</a></li>`).join('')}</ol></nav></aside><main id="main" tabindex="-1"><header class="hero"><span class="eyebrow">${l.verified}</span><h1>${esc(report.title)}</h1>${branding.subtitle ? `<p style="font-size:18px;margin-bottom:18px">${esc(branding.subtitle)}</p>` : ''}${document.summary ? `<p class="summary">${esc(document.summary)}</p>` : ''}<p>${report.chapters.length} ${l.chapters} · ${esc(report.browser)}</p>${metadata.length ? `<ul class="metadata">${metadata.map((text) => `<li>${esc(text)}</li>`).join('')}</ul>` : ''}</header>${toolbar}<p id="no-results" hidden role="status">${l.noResults}</p>${chapters}<footer>${l.created} · ${pdfLink}<a href="handbook.md">${l.markdown}</a><a href="report.json">${l.evidence}</a></footer></main></div><script type="module">${viewerScript}</script></body></html>`;
  await writeFile(join(directory, 'handbook.md'), markdown.join('\n'));
  await writeFile(join(directory, 'index.html'), html);
}
