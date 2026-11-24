import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  readlink,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { init } from '../src/scaffold.js';
import { setupEditor } from '../src/authoring-scaffold.js';

for (const command of ['init', 'editor'] as const) {
  for (const conflict of ['file parent', 'dangling destination', 'symlink parent'] as const) {
    test(`${command} leaves the project untouched when an editor asset has a ${conflict}`, async () => {
      const tmp = await mkdtemp(join(tmpdir(), 'hooserguide-scaffold-conflict-'));
      try {
        const project = join(tmp, 'guide');
        await mkdir(project);
        if (command === 'editor') await init(project);
        const config = join(project, 'hooserguide.config.json');
        const ignore = join(project, 'keep.txt');
        await writeFile(ignore, 'user-owned');
        if (conflict === 'file parent') await writeFile(join(project, '.vscode'), 'keep this file');
        else if (conflict === 'dangling destination') {
          await mkdir(join(project, '.hooserguide'));
          await symlink('missing.json', join(project, '.hooserguide', 'capture.schema.json'));
        } else {
          await mkdir(join(tmp, 'shared'));
          await symlink(join(tmp, 'shared'), join(project, '.vscode'), 'dir');
        }
        const before = (await readdir(project)).sort();
        await assert.rejects(
          command === 'init' ? init(project, undefined, true, true) : setupEditor(config),
        );
        assert.deepEqual((await readdir(project)).sort(), before, 'A partial scaffold was written');
        assert.equal(await readFile(ignore, 'utf8'), 'user-owned');
        if (conflict === 'file parent')
          assert.equal(await readFile(join(project, '.vscode'), 'utf8'), 'keep this file');
        if (conflict === 'dangling destination') {
          assert.deepEqual(await readdir(join(project, '.hooserguide')), ['capture.schema.json']);
          assert.equal(
            await readlink(join(project, '.hooserguide', 'capture.schema.json')),
            'missing.json',
          );
        }
        if (conflict === 'symlink parent') assert.deepEqual(await readdir(join(tmp, 'shared')), []);
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    });
  }
}

test('a dangling skill destination is a conflict before the project is initialized', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hooserguide-skill-conflict-'));
  try {
    const skills = join(root, '.agents', 'skills');
    await mkdir(skills, { recursive: true });
    await symlink('missing', join(skills, 'hooserguide-review'), 'dir');
    await assert.rejects(init(root, undefined, true, true), /Skill already exists/);
    assert.deepEqual(await readdir(root), ['.agents']);
    assert.deepEqual(await readdir(skills), ['hooserguide-review']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
