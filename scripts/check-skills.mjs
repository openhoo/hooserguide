import assert from 'node:assert/strict';
import { lstat, readFile, readdir, readlink, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'yaml';

export const skillAudiences = {
  'hooserguide-development': 'contributor',
  'hooserguide-author': 'consumer',
  'hooserguide-review': 'consumer',
};

export async function skillFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    assert.ok(!entry.isSymbolicLink(), `Skill resource must travel with the skill: ${path}`);
    if (entry.isDirectory()) {
      for (const child of await skillFiles(path)) files.push(join(entry.name, child));
    } else if (entry.isFile()) files.push(entry.name);
    else assert.fail(`Unsupported skill resource: ${path}`);
  }
  return files.sort();
}

export async function compareSkillCopies(source, installed) {
  const expected = await skillFiles(source),
    actual = await skillFiles(installed);
  assert.deepEqual(actual, expected, `Installed resource set differs: ${installed}`);
  for (const file of expected)
    assert.ok(
      (await readFile(join(source, file))).equals(await readFile(join(installed, file))),
      `Installed skill file differs: ${join(installed, file)}`,
    );
  return expected.length;
}

export async function checkSkill(directory, expectedName) {
  const root = await realpath(directory);
  const files = await skillFiles(root);
  const content = await readFile(join(root, 'SKILL.md'), 'utf8');
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  assert.ok(frontmatter, `Missing YAML frontmatter: ${directory}`);
  const metadata = parse(frontmatter[1]);
  assert.equal(metadata.name, expectedName);
  assert.match(metadata.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.ok(metadata.name.length <= 64);
  assert.equal(typeof metadata.description, 'string');
  assert.ok(metadata.description.trim().length > 20 && metadata.description.length <= 1024);
  assert.ok(!/[<>]/.test(metadata.description));
  for (const field of Object.keys(metadata))
    assert.ok(
      ['name', 'description', 'license', 'allowed-tools', 'metadata'].includes(field),
      `Unsupported frontmatter field ${field}: ${directory}`,
    );

  const ui = parse(await readFile(join(root, 'agents/openai.yaml'), 'utf8'));
  assert.equal(typeof ui.interface.display_name, 'string');
  assert.ok(
    ui.interface.short_description.length >= 25 && ui.interface.short_description.length <= 64,
  );
  assert.ok(ui.interface.default_prompt.includes(`$${expectedName}`));
  assert.notEqual(
    ui.policy?.allow_implicit_invocation,
    false,
    'These skills use normal automatic discovery',
  );
  const reachable = new Set(['SKILL.md']);
  const links = new Map();
  for (const file of files.filter((file) => file.endsWith('.md'))) {
    const markdown = await readFile(join(root, file), 'utf8');
    const destinations = [];
    for (const match of markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const href = match[1].trim().replace(/^<|>$/g, '');
      if (/^[a-z][a-z0-9+.-]*:|^#/i.test(href)) continue;
      const target = resolve(dirname(join(root, file)), decodeURIComponent(href.split('#')[0]));
      assert.ok(
        !isAbsolute(href) && !relative(root, target).startsWith('..'),
        `Reference escapes installed skill: ${file} -> ${href}`,
      );
      assert.ok((await lstat(target)).isFile(), `Reference is not a file: ${file} -> ${href}`);
      destinations.push(relative(root, target));
    }
    links.set(file, destinations);
  }
  const visit = (file) => {
    for (const child of links.get(file) ?? []) {
      if (reachable.has(child)) continue;
      reachable.add(child);
      visit(child);
    }
  };
  visit('SKILL.md');
  for (const file of files.filter((file) => file.startsWith('references/') && file.endsWith('.md')))
    assert.ok(
      reachable.has(file),
      `Reference is undiscoverable from SKILL.md: ${directory}/${file}`,
    );
  return { name: expectedName, files: files.length, references: reachable.size - 1 };
}

export async function checkSkills(root) {
  const names = (await readdir(join(root, 'skills'), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(names, Object.keys(skillAudiences).sort());
  const results = [];
  for (const name of names)
    results.push({
      ...(await checkSkill(join(root, 'skills', name), name)),
      audience: skillAudiences[name],
    });
  const discovery = join(root, '.agents/skills/hooserguide-development');
  assert.ok((await lstat(discovery)).isSymbolicLink());
  assert.equal(await readlink(discovery), '../../skills/hooserguide-development');
  assert.equal(
    await realpath(discovery),
    await realpath(join(root, 'skills/hooserguide-development')),
  );
  assert.deepEqual(await readdir(join(root, '.agents/skills')), ['hooserguide-development']);
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  for (const result of await checkSkills(root))
    console.log(
      `✓ ${result.name} (${result.audience}): ${result.files} files, ${result.references} discoverable bundled references`,
    );
}
