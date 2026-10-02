import { generateMessages } from '@cucumber/gherkin';
import { IdGenerator, SourceMediaType, type Pickle } from '@cucumber/messages';
import { readFile } from 'node:fs/promises';

export async function parseFeature(
  path: string,
): Promise<{ feature: string; description: string; pickles: Pickle[] }> {
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
  return {
    feature: feature.name,
    description: feature.description.trim(),
    pickles: messages.flatMap((m) => (m.pickle ? [m.pickle] : [])),
  };
}
