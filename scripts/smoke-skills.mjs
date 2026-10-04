import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { checkSkill, checkSkills, compareSkillCopies, skillAudiences } from './check-skills.mjs';

const exec = promisify(execFile);
const source = fileURLToPath(new URL('../', import.meta.url));
await checkSkills(source);
const consumer = await mkdtemp(join(tmpdir(), 'hooserguide-skills-'));
try {
  await exec(
    'npx',
    [
      '--yes',
      'skills',
      'add',
      source,
      '--skill',
      ...Object.keys(skillAudiences),
      '--agent',
      'codex',
      '--yes',
      '--copy',
      '--json',
    ],
    {
      cwd: consumer,
      timeout: 120000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, DISABLE_TELEMETRY: '1' },
    },
  );
  for (const name of Object.keys(skillAudiences)) {
    const installed = join(consumer, '.agents/skills', name);
    await checkSkill(installed, name);
    const files = await compareSkillCopies(join(source, 'skills', name), installed);
    console.log(
      `✓ Actual Skills CLI install: ${name} (${skillAudiences[name]}), ${files} files match source`,
    );
  }
} finally {
  await rm(consumer, { recursive: true, force: true });
}
