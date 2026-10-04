import { generateMessages } from '@cucumber/gherkin';
import { IdGenerator, SourceMediaType } from '@cucumber/messages';
import { readFile } from 'node:fs/promises';

export async function parseFeature(path: string) {
  const messages = generateMessages(
    await readFile(path, 'utf8'),
    path,
    SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN,
    {
      includeGherkinDocument: true,
      includePickles: true,
      newId: IdGenerator.incrementing(),
    },
  );
  const errors = messages.flatMap((m) => (m.parseError ? [m.parseError] : []));
  if (errors.length)
    throw new Error(
      errors.map((e) => `${path}:${e.source.location?.line}: ${e.message}`).join('\n'),
    );
  const feature = messages.find((m) => m.gherkinDocument)?.gherkinDocument?.feature;
  if (!feature) throw new Error(`No Feature in ${path}`);
  const nodes = new Map<string, { line: number; column: number; description?: string }>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    const node = value as {
      id?: string;
      location?: { line: number; column?: number };
      description?: string;
    };
    if (node.id && node.location)
      nodes.set(node.id, {
        line: node.location.line,
        column: node.location.column ?? 1,
        description: node.description?.trim(),
      });
    for (const child of Object.values(value)) visit(child);
  };
  visit(feature);
  return {
    feature: feature.name,
    description: feature.description.trim(),
    pickles: messages.flatMap((m) => (m.pickle ? [m.pickle] : [])),
    nodes,
  };
}
