import { verifyReportImages } from './evidence.js';
import { reportSchema, requireSuccessfulEvidence } from './report.js';
import { access, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { escapeXml as esc } from './capture.js';
import type { RunReport } from './types.js';
import { brandingSchema } from './config.js';
import { manualLabels } from './manual.js';
import { viewerScript } from './viewer.js';
import { presentationChapters, screenLayout, screenLabel, sameGuidance } from './responsive.js';
import { manualThemeNames, resolveManualTheme, themeVariables } from './themes.js';
import { badgeTextColor } from './annotations.js';

const md = (s: string) =>
  s.replace(/[\\`*_{}\[\]()<>#!|]/g, (c) => `\\${c}`).replace(/\r?\n/g, ' ');
const instructionMarkdown = (text: string, index: number) => {
  const marker = `${index + 1}. `;
  return (
    marker +
    text
      .split(/\r?\n/)
      .map(md)
      .join('\n' + ' '.repeat(marker.length))
  );
};
export async function renderManual(report: RunReport, directory: string): Promise<void> {
  report = reportSchema.parse(report) as RunReport;
  requireSuccessfulEvidence(report);
  await verifyReportImages(report, directory);
  const branding = brandingSchema.parse(report.branding ?? {});
  const theme = resolveManualTheme(report.manual?.theme, branding);
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
      ...presentationChapters(report).map((c, i) => `${i + 1}. ${md(c.title)}`),
      '',
    );
  if (branding.subtitle) markdown.push(md(branding.subtitle), '');
  const presented = presentationChapters(report);
  const chapters = presented
    .map((c, i) => {
      markdown.push(`## ${i + 1}. ${md(c.title)}`, '', md(c.description), '');
      const differingGuidance = c.variants.some((v) => !sameGuidance(c, v));
      const guidanceLabel = differingGuidance ? screenLabel(c.variant!) : '';
      if (guidanceLabel) markdown.push(`### ${md(guidanceLabel)}`, '');
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
      c.instructions.forEach((s, j) => markdown.push(instructionMarkdown(s, j)));
      markdown.push('');
      const variantGuidance = c.variants
        .filter((v) => !sameGuidance(c, v))
        .map((v) => {
          markdown.push(
            `### ${md(screenLabel(v.variant!))}`,
            '',
            md(v.description),
            '',
            ...v.instructions.map((text, n) => instructionMarkdown(text, n)),
            ...(v.prerequisites ?? []).map((text) => `- ${md(text)}`),
            ...(v.callouts ?? []).map((callout) => `> **${l[callout.kind]}:** ${md(callout.text)}`),
            '',
          );
          return `<div class="variant-guidance"><h3>${esc(screenLabel(v.variant!))}</h3><p>${esc(v.description)}</p>${v.prerequisites?.length ? `<h4>${l.prerequisites}</h4><ul>${v.prerequisites.map((text) => `<li>${esc(text)}</li>`).join('')}</ul>` : ''}<ol>${v.instructions.map((text) => `<li>${esc(text)}</li>`).join('')}</ol>${(v.callouts ?? []).map((callout) => `<aside class="callout ${callout.kind}"><strong>${l[callout.kind]}</strong><p>${esc(callout.text)}</p></aside>`).join('')}</div>`;
        })
        .join('');
      const figures = c.captures
        .map((first, j) => {
          const multiple = c.variants.length > 1;
          markdown.push(`### ${md(first.title)}`, '');
          if (multiple && screenLayout(report) === 'side-by-side') {
            markdown.push(
              `| ${c.variants.map((v) => md(screenLabel(v.variant!))).join(' | ')} |`,
              `| ${c.variants.map(() => '---').join(' | ')} |`,
              `| ${c.variants.map((v) => `![${md(v.captures[j]!.title)}](${v.captures[j]!.image})`).join(' | ')} |`,
              '',
            );
          }
          const cells = c.variants
            .map((v) => {
              const shot = v.captures[j]!;
              const label = v.variant ? screenLabel(v.variant) : '';
              if (!multiple || screenLayout(report) === 'stacked')
                markdown.push(
                  label ? `#### ${md(label)}` : '',
                  '',
                  `![${md(shot.title)}](${shot.image})`,
                  '',
                );
              markdown.push(label ? `**${md(label)}**` : '', md(shot.description ?? ''), '');
              const legend = shot.marks
                .filter((m) => m.caption || m.label)
                .map((m) => {
                  markdown.push(
                    m.label
                      ? `- **${md(m.label)}**: ${md(m.caption ?? '')}`
                      : `- ${md(m.caption ?? '')}`,
                  );
                  const color = m.color && /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : '#e11d48';
                  return `<li>${m.label ? `<span class="ref" style="background:${color};color:${badgeTextColor(color)}">${esc(m.label)}</span>` : ''} ${esc(m.caption ?? '')}</li>`;
                })
                .join('');
              markdown.push('');
              return `<figure>${label ? `<div class="screen-label">${esc(label)}</div>` : ''}<a class="screen-image" href="${esc(shot.image)}" aria-label="${esc(shot.title + (label ? ' · ' + label : ''))}"><img src="${esc(shot.image)}" data-annotated="${esc(shot.image)}" data-raw="${esc(shot.raw)}" alt="${esc(shot.title + (label ? ' · ' + label : ''))}" loading="lazy" width="${shot.width}" height="${shot.height}"></a><figcaption><span class="eyebrow">${l.figure} ${i + 1}.${j + 1}${v.variant ? ' · ' + esc(v.variant.label) : ''}</span><h3>${esc(shot.title)}</h3><p>${esc(shot.description ?? '')}</p>${legend ? `<ul class="legend">${legend}</ul>` : ''}</figcaption></figure>`;
            })
            .join('');
          return multiple
            ? `<div class="screen-group ${screenLayout(report)}" style="--screens:${c.variants.length}" role="group" aria-label="${esc(first.title)}">${cells}</div>`
            : cells;
        })
        .join('');
      return `<section id="chapter-${i + 1}"><div class="chapter-number">${String(i + 1).padStart(2, '0')}</div><h2>${esc(c.title)}</h2><p class="intro">${esc(c.description)}</p>${guidanceLabel ? `<h3 class="guidance-label">${esc(guidanceLabel)}</h3>` : ''}${prerequisites}${callouts}${c.instructions.length ? `<ol class="instructions">${c.instructions.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}${variantGuidance}${figures}</section>`;
    })
    .join('');
  const pdfLink = await access(join(directory, 'handbook.pdf')).then(
    () => '<a href="handbook.pdf" download="handbook.pdf" type="application/pdf">PDF</a>',
    () => '',
  );
  const readerActions = `<div class="reader-actions"><span class="theme-picker" hidden><label class="theme-label" for="guide-theme">${l.theme}</label><select id="guide-theme">${manualThemeNames.map((name) => `<option value="${name}"${name === theme.name ? ' selected' : ''}>${esc(resolveManualTheme(name).label)}</option>`).join('')}</select></span>${pdfLink ? `<a class="pdf-download" href="handbook.pdf" download="handbook.pdf" type="application/pdf">${l.downloadPdf}</a>` : ''}</div>`;
  const toolbar = `<div class="toolbar" hidden><label for="guide-search">${l.search}</label><div class="tools"><input id="guide-search" type="search" autocomplete="off" aria-controls="main" placeholder="${l.search}"><button id="annotations" type="button" aria-pressed="true">${l.annotations}</button><button id="print-guide" type="button">${l.print}</button></div><p id="search-results" role="status" aria-live="polite" data-label="${l.results}"></p></div>`;
  const themeCss = manualThemeNames
    .map(
      (name) =>
        `:root[data-theme="${name}"]{${themeVariables(resolveManualTheme(name, branding))}}`,
    )
    .join('\n');
  const html = `<!doctype html><html lang="${esc(report.language)}" data-theme="${theme.name}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="generator" content="hooserguide"><title>${esc(report.title)}</title><style>
  :root{${themeVariables(theme)}}${themeCss}*{box-sizing:border-box}html{scroll-behavior:smooth}body{overflow-wrap:anywhere;margin:0;color:var(--ink);background:var(--page);font:16px/1.7 system-ui,-apple-system,sans-serif}a{color:var(--accent-ink);text-underline-offset:.2em}a:focus-visible{outline:3px solid var(--focus);outline-offset:4px}.skip{position:absolute;left:1rem;top:-100px}.skip:focus{top:1rem;background:var(--surface);padding:1rem;z-index:2}.layout{max-width:1380px;margin:auto;display:grid;grid-template-columns:265px minmax(0,1fr);gap:32px;padding:28px 32px}main,aside{min-width:0}.layout>aside{position:sticky;top:28px;align-self:start}.layout>aside .eyebrow{margin:6px 0}.layout>aside nav ol{margin:10px 0 0}.brand{font-weight:800;font-size:22px;letter-spacing:-.6px}.eyebrow{font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);font-weight:700}nav ol{list-style:none;padding:0}nav li{margin:8px 0}nav a{display:block;padding:6px 10px;border-left:2px solid var(--line);text-decoration:none;font-size:14px}nav a:hover{border-color:var(--accent-ink);background:var(--soft)}.hero{padding:24px;background:var(--hero);color:var(--hero-ink);border-radius:14px;margin-bottom:20px}.hero .eyebrow{color:var(--hero-muted)}h1{font-size:clamp(26px,3vw,36px);line-height:1.2;letter-spacing:-.8px;margin:8px 0 10px}h2{font-size:30px;line-height:1.25;letter-spacing:-.6px;margin:8px 0 16px}h3{font-size:19px;margin:8px 0}.hero p{color:var(--hero-muted);margin:0;font-size:14px}section{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:40px;margin:0 0 32px;scroll-margin-top:24px}.chapter-number{color:var(--accent-ink);font-weight:800;font-size:14px}.intro{color:var(--muted);white-space:pre-line}.instructions{padding-left:24px}.instructions li{padding:6px 0}.instructions li,.variant-guidance li{white-space:pre-line}figure{margin:28px 0 0;border:1px solid var(--line);border-radius:12px;overflow:hidden}figure img{width:100%;height:auto;display:block;background:var(--soft)}figcaption{padding:22px;border-top:1px solid var(--line)}figcaption p{margin:8px 0;color:var(--muted)}.legend{list-style:none;margin:16px 0 0;padding:0}.legend li{display:flex;gap:12px;align-items:flex-start;margin:10px 0}.ref{flex-shrink:0;min-width:28px;text-align:center;border-radius:6px;background:#e11d48;color:white;font-size:13px;font-weight:700}footer{font-size:13px;color:var(--muted);padding:0 0 24px}footer a{margin-right:18px}@media(max-width:850px){.layout{grid-template-columns:1fr;padding:16px;gap:16px}.layout>aside{position:static}nav ol{display:flex;flex-wrap:wrap;gap:4px}nav li{margin:0}.hero{padding:18px}section{padding:24px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}@media print{body{background:var(--surface)}.layout{display:block;padding:0}aside{display:none}.hero{background:var(--surface);color:var(--ink);padding:0}.hero p,.hero .eyebrow{color:var(--muted)}section{border:0;padding:16px 0;break-before:page}figure{break-inside:avoid}footer{display:none}}
  .screen-group{display:grid;gap:16px;align-items:start;margin-top:28px}.screen-group.side-by-side{grid-template-columns:repeat(var(--screens),minmax(0,1fr))}.screen-group figure{margin:0;min-width:0}.screen-label{padding:12px 16px;background:var(--soft);color:var(--accent-ink);font-size:13px;font-weight:700}.screen-image{display:block}.screen-image:focus-visible{outline:3px solid #ffffff;outline-offset:-3px;box-shadow:0 0 0 3px #000000}.screen-group figcaption{padding:16px}.screen-group.side-by-side .screen-image{aspect-ratio:3/4;background:var(--soft)}.screen-group.side-by-side .screen-image img{width:100%;height:100%;object-fit:contain;object-position:top}.variant-guidance{padding:16px;border:1px solid var(--line);border-radius:10px;margin-top:20px}@media(max-width:1100px) and (min-width:651px){.screen-group.side-by-side{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:650px){.screen-group.side-by-side{grid-template-columns:1fr}.screen-group.side-by-side .screen-image{aspect-ratio:auto}.screen-group.side-by-side .screen-image img{height:auto}}@media print{.screen-group{break-inside:avoid}.screen-label{print-color-adjust:exact}}
  [hidden]{display:none!important}.toolbar{background:var(--surface);border:1px solid var(--line);padding:12px;border-radius:12px;margin-bottom:20px}.toolbar label{font-size:13px;font-weight:700}.tools{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}.tools input{flex:1;min-width:160px}@media(max-width:650px){.tools input{flex-basis:100%}}.tools input,.tools button,.tools select{font:inherit;font-size:14px;min-height:40px;border:1px solid var(--control-line);border-radius:8px;padding:7px 10px;background:var(--surface);color:var(--ink)}.tools input::placeholder{color:var(--muted);opacity:1}.tools button{cursor:pointer}.tools button:hover{background:var(--soft)}.tools button[aria-pressed=true]{background:var(--hero);color:var(--hero-ink);border-color:var(--hero-muted)}.tools :focus-visible{outline:3px solid var(--focus);outline-offset:3px}#search-results:empty{display:none}#search-results{margin:8px 0 0;font-size:13px;color:var(--muted)}.callout{position:static;border-left:4px solid var(--accent-ink);background:var(--soft);padding:16px 20px;margin:20px 0;border-radius:8px}.callout.tip{border-color:var(--accent-ink);background:var(--tip-bg)}.callout.warning{border-color:var(--warning);background:var(--warning-bg)}.callout.warning>strong{color:var(--warning)}.callout p{margin:4px 0 0;white-space:pre-line}.prerequisites{margin:20px 0;padding:16px 20px;border:1px solid var(--line);border-radius:8px}.metadata{display:flex;flex-wrap:wrap;gap:2px 16px;margin:8px 0 0;padding:0;list-style:none;font-size:12px;line-height:1.5}.hero .summary,.hero .hero-subtitle{font-size:15px;line-height:1.5;margin:6px 0;white-space:pre-line}.hero .hero-stats{font-size:12px;margin-top:8px}@media print{.reader-actions,.toolbar,#no-results{display:none!important}main>section[hidden]{display:block!important}.callout{display:block!important}figure img{print-color-adjust:exact}}
  .reader-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}.reader-actions select,.pdf-download{font:inherit;font-size:14px;min-height:40px;border:1px solid var(--control-line);border-radius:8px;padding:7px 10px;background:var(--surface);color:var(--ink)}.pdf-download{display:inline-block;background:var(--hero);color:var(--hero-ink);border-color:var(--hero-muted);text-decoration:none;font-weight:700}.reader-actions :focus-visible{outline:3px solid var(--focus);outline-offset:3px}.theme-picker{display:flex;align-items:center;gap:8px}.theme-label{align-self:center}@media print{:root[data-theme]{${themeVariables(resolveManualTheme())}}body{background:white;color:var(--ink)}.hero{background:white;color:var(--ink)}section,.toolbar{background:white}}
  </style></head><body><a class="skip" href="#main">${l.skip}</a><div class="layout"><aside><div class="brand">${esc(brand)}<span aria-hidden="true" style="color:var(--accent)">.</span></div><p class="eyebrow">${l.guide}</p><nav aria-label="${l.contents}"><ol>${presentationChapters(
    report,
  )
    .map(
      (c, i) =>
        `<li><a href="#chapter-${i + 1}">${String(i + 1).padStart(2, '0')} &nbsp; ${esc(c.title)}</a></li>`,
    )
    .join(
      '',
    )}</ol></nav></aside><main id="main" tabindex="-1">${readerActions}<header class="hero"><span class="eyebrow">${l.verified}</span><h1>${esc(report.title)}</h1>${branding.subtitle ? `<p class="hero-subtitle">${esc(branding.subtitle)}</p>` : ''}${document.summary ? `<p class="summary">${esc(document.summary)}</p>` : ''}<p class="hero-stats">${presentationChapters(report).length} ${l.chapters} · ${esc(report.responsive ? [...new Set(report.chapters.map((c) => c.variant!.browser))].join(' / ') : report.browser)}</p>${metadata.length ? `<ul class="metadata">${metadata.map((text) => `<li>${esc(text)}</li>`).join('')}</ul>` : ''}</header>${toolbar}<p id="no-results" hidden role="status">${l.noResults}</p>${chapters}<footer>${l.created} · ${pdfLink}<a href="handbook.md">${l.markdown}</a><a href="report.json">${l.evidence}</a></footer></main></div><script type="module">${viewerScript}</script></body></html>`;
  await writeFile(join(directory, 'handbook.md'), markdown.join('\n'));
  await writeFile(join(directory, 'index.html'), html);
}
