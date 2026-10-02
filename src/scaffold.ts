import { mkdir, writeFile, access, cp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const starterFeature = `@manual
Feature: Your application
  Follow these steps to complete your first task.

  Scenario: Get started
    Given I open "/"
    Then "role=heading:Welcome" is visible
    And I explain "Review the welcome page before getting started."
    And I capture "Welcome page"
      """json
      {
        "description": "The welcome heading is highlighted with reference A.",
        "marks": [
          { "target": "role=heading:Welcome", "kind": "both", "label": "A", "caption": "Welcome heading" }
        ]
      }
      """
`;

export async function init(directory: string, baseURL = 'http://localhost:3000', skills = false) {
  const root = resolve(directory);
  const paths = ['hooserguide.config.json', 'features/get-started.feature'];
  for (const path of paths) {
    const exists = await access(join(root, path)).then(
      () => true,
      () => false,
    );
    if (exists) throw new Error(`Refusing to overwrite ${join(root, path)}`);
  }
  await mkdir(join(root, 'features'), { recursive: true });
  await writeFile(
    join(root, paths[0]!),
    JSON.stringify(
      {
        title: 'Your application — User guide',
        baseURL,
        features: ['features/*.feature'],
        output: 'output/hooserguide',
        tag: '@manual',
        language: 'en',
      },
      null,
      2,
    ) + '\n',
  );
  await writeFile(join(root, paths[1]!), starterFeature);
  if (skills) {
    const source = fileURLToPath(new URL('../skills/', import.meta.url));
    for (const name of ['hooserguide-author', 'hooserguide-review']) {
      const destination = join(root, '.agents', 'skills', name);
      if (
        await access(destination).then(
          () => true,
          () => false,
        )
      )
        throw new Error(`Skill already exists: ${destination}`);
      await cp(join(source, name), destination, {
        recursive: true,
        errorOnExist: true,
        force: false,
      });
    }
  }
  return { directory: root, config: join(root, paths[0]!), feature: join(root, paths[1]!) };
}
