import { access, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { escapeXml as esc } from './capture.js';
import type { RunReport } from './types.js';

const md = (s: string) =>
  s.replace(/[\\`*_{}\[\]()<>#!|]/g, (c) => `\\${c}`).replace(/\r?\n/g, ' ');
export async function renderManual(report: RunReport, directory: string): Promise<void> {
  if (report.status !== 'passed') throw new Error('Cannot render a manual from a failed run');
  const markdown = [`# ${md(report.title)}`, '', `Generated: ${report.generatedAt}`, ''];
  const chapters = report.chapters
    .map((c, i) => {
      markdown.push(`## ${i + 1}. ${md(c.title)}`, '', md(c.description), '');
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
            .map((m, n) => {
              const label = m.label ?? `${n + 1}`;
              markdown.push(`- **${md(label)}**: ${md(m.caption ?? '')}`);
              return `<li><span class="ref">${esc(label)}</span> ${esc(m.caption ?? '')}</li>`;
            })
            .join('');
          markdown.push('');
          return `<figure><img src="${s.image}" alt="${esc(s.title)}" loading="lazy" width="${s.width}" height="${s.height}"><figcaption><span class="eyebrow">Figure ${i + 1}.${j + 1}</span><h3>${esc(s.title)}</h3><p>${esc(s.description ?? '')}</p>${legend ? `<ul class="legend">${legend}</ul>` : ''}</figcaption></figure>`;
        })
        .join('');
      return `<section id="chapter-${i + 1}"><div class="chapter-number">${String(i + 1).padStart(2, '0')}</div><h2>${esc(c.title)}</h2><p class="intro">${esc(c.description)}</p>${c.instructions.length ? `<ol class="instructions">${c.instructions.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}${figures}</section>`;
    })
    .join('');
  const pdfLink = await access(join(directory, 'handbook.pdf')).then(
    () => '<a href="handbook.pdf">PDF</a>',
    () => '',
  );
  const html = `<!doctype html><html lang="${esc(report.language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="generator" content="hooserguide"><title>${esc(report.title)}</title><style>
  :root{color-scheme:light;--ink:#142636;--muted:#52667a;--accent:#075e59;--line:#dce5e9}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;color:var(--ink);background:#f5f8fa;font:16px/1.7 system-ui,-apple-system,sans-serif}a{color:var(--accent)}a:focus-visible{outline:3px solid #f59e0b;outline-offset:4px}.skip{position:absolute;left:1rem;top:-100px}.skip:focus{top:1rem;background:white;padding:1rem;z-index:2}.layout{max-width:1380px;margin:auto;display:grid;grid-template-columns:265px minmax(0,1fr);gap:48px;padding:48px 32px}aside{position:sticky;top:32px;align-self:start}.brand{font-weight:800;font-size:22px;letter-spacing:-.6px}.eyebrow{font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);font-weight:700}nav ol{list-style:none;padding:0}nav li{margin:8px 0}nav a{display:block;padding:8px 12px;border-left:2px solid var(--line);text-decoration:none;font-size:14px}nav a:hover{border-color:var(--accent);background:#eaf3f1}.hero{padding:48px;background:var(--ink);color:#fff;border-radius:20px;margin-bottom:32px}.hero .eyebrow{color:#a7d5ce}h1{font-size:clamp(32px,5vw,52px);line-height:1.12;letter-spacing:-1.5px;margin:16px 0 24px}h2{font-size:30px;line-height:1.25;letter-spacing:-.6px;margin:8px 0 16px}h3{font-size:19px;margin:8px 0}.hero p{color:#c7d7e2;margin:0;font-size:14px}section{background:white;border:1px solid var(--line);border-radius:18px;padding:40px;margin:0 0 32px;scroll-margin-top:24px}.chapter-number{color:var(--accent);font-weight:800;font-size:14px}.intro{color:var(--muted);white-space:pre-line}.instructions{padding-left:24px}.instructions li{padding:6px 0}figure{margin:28px 0 0;border:1px solid var(--line);border-radius:12px;overflow:hidden}figure img{width:100%;height:auto;display:block;background:#f1f5f9}figcaption{padding:22px;border-top:1px solid var(--line)}figcaption p{margin:8px 0;color:var(--muted)}.legend{list-style:none;margin:16px 0 0;padding:0}.legend li{display:flex;gap:12px;align-items:baseline;margin:10px 0}.ref{flex-shrink:0;min-width:28px;text-align:center;border-radius:6px;background:#e11d48;color:white;font-size:13px;font-weight:700}footer{font-size:13px;color:var(--muted);padding:0 0 24px}footer a{margin-right:18px}@media(max-width:850px){.layout{grid-template-columns:1fr;padding:20px;gap:20px}aside{position:static}nav ol{display:flex;flex-wrap:wrap;gap:4px}nav li{margin:0}.hero,section{padding:24px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}@media print{body{background:white}.layout{display:block;padding:0}aside{display:none}.hero{background:white;color:var(--ink);padding:0}.hero p,.hero .eyebrow{color:var(--muted)}section{border:0;padding:16px 0;break-before:page}figure{break-inside:avoid}footer{display:none}}
  </style></head><body><a class="skip" href="#main">Skip to guide</a><div class="layout"><aside><div class="brand">hooserguide<span aria-hidden="true" style="color:#0d9488">.</span></div><p class="eyebrow">User guide</p><nav aria-label="Chapters"><ol>${report.chapters.map((c, i) => `<li><a href="#chapter-${i + 1}">${String(i + 1).padStart(2, '0')} &nbsp; ${esc(c.title)}</a></li>`).join('')}</ol></nav></aside><main id="main"><header class="hero"><span class="eyebrow">Verified walkthrough</span><h1>${esc(report.title)}</h1><p>${report.chapters.length} chapters · Generated ${esc(report.generatedAt.slice(0, 10))} · ${esc(report.browser)}</p></header>${chapters}<footer>Created with hooserguide · ${pdfLink}<a href="handbook.md">Markdown</a><a href="report.json">Execution evidence</a></footer></main></div></body></html>`;
  await writeFile(join(directory, 'handbook.md'), markdown.join('\n'));
  await writeFile(join(directory, 'index.html'), html);
}
