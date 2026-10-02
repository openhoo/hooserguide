import type { CaptureDefaults, CaptureSpec, ManualOptions } from './types.js';

export function applyCaptureDefaults(
  spec: CaptureSpec,
  defaults: CaptureDefaults = {},
): CaptureSpec {
  const { color, padding, fullPage, ...rest } = defaults;
  return {
    ...rest,
    ...(fullPage !== undefined && !spec.focus ? { fullPage } : {}),
    ...(padding !== undefined && spec.focus ? { padding } : {}),
    ...spec,
    marks: spec.marks?.map((mark) => ({ ...(color ? { color } : {}), ...mark })),
  };
}
export function pageGeometry(options: ManualOptions = {}) {
  const size = options.pageSize ?? 'A4';
  const [short, long] = size === 'Letter' ? [612, 792] : [595.28, 841.89];
  const landscape = options.orientation === 'landscape';
  const width = landscape ? long! : short!,
    height = landscape ? short! : long!;
  const margin = options.margin ?? 48;
  return {
    size: { width, height },
    margin,
    contentWidth: width - 2 * margin,
    contentHeight: height - 2 * margin,
  };
}
const en = {
  guide: 'User guide',
  verified: 'Verified walkthrough',
  chapters: 'chapters',
  chapter: 'Chapter',
  figure: 'Figure',
  part: 'Part',
  generated: 'Generated',
  contents: 'Contents',
  subtitle: 'Verified walkthroughs with annotated screenshots.',
  version: 'Guide version',
  productVersion: 'Product version',
  audience: 'Audience',
  prerequisites: 'Prerequisites',
  note: 'Note',
  tip: 'Tip',
  warning: 'Warning',
  skip: 'Skip to guide',
  search: 'Search this guide',
  results: 'matching chapters',
  noResults: 'No matching chapters.',
  annotations: 'Show annotations',
  print: 'Print',
  markdown: 'Markdown',
  evidence: 'Execution evidence',
  pageNumber: 'Page {page} of {total}',
  created: 'Created with hooserguide',
  rebuilt: 'Re-exported',
};
const de: typeof en = {
  guide: 'Benutzerhandbuch',
  verified: 'Geprüfte Anleitung',
  chapters: 'Kapitel',
  chapter: 'Kapitel',
  figure: 'Abbildung',
  part: 'Teil',
  generated: 'Erstellt',
  contents: 'Inhalt',
  subtitle: 'Geprüfte Abläufe mit annotierten Screenshots.',
  version: 'Handbuchversion',
  productVersion: 'Produktversion',
  audience: 'Zielgruppe',
  prerequisites: 'Voraussetzungen',
  note: 'Hinweis',
  tip: 'Tipp',
  warning: 'Warnung',
  skip: 'Zum Handbuch springen',
  search: 'Handbuch durchsuchen',
  results: 'passende Kapitel',
  noResults: 'Keine passenden Kapitel.',
  annotations: 'Annotationen anzeigen',
  print: 'Drucken',
  markdown: 'Markdown',
  evidence: 'Ausführungsnachweis',
  pageNumber: 'Seite {page} von {total}',
  created: 'Erstellt mit hooserguide',
  rebuilt: 'Neu exportiert',
};
export function manualLabels(language: string) {
  return language.toLowerCase().split('-')[0] === 'de' ? de : en;
}
