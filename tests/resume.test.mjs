import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateResume } from '../Scripts/Athena-resume.mjs';

const repository = 'owner/repo';
const fixture = () => ({
  run: { id: 123, status: 'completed', conclusion: 'failure', event: 'workflow_dispatch',
    repository: { full_name: repository }, head_repository: { full_name: repository },
    head_branch: 'main', path: '.github/workflows/ATHENA.yml' },
  jobs: { jobs: [{ name: 'toolchain / VIKINGYFY/immortalwrt / toolchain', conclusion: 'success' }] },
  artifacts: { artifacts: [{ name: 'athena-b-checkpoint-toolchain-123', expired: false, size_in_bytes: 100 }] }
});
test('resume accepts completed same-repository toolchain metadata', () => {
  const f = fixture();
  assert.doesNotThrow(() => validateResume(f.run, f.jobs, f.artifacts, repository, 'main', '123'));
});
for (const [name, mutate] of [
  ['foreign repository', f => { f.run.repository.full_name = 'other/repo'; }],
  ['fork source', f => { f.run.head_repository.full_name = 'other/repo'; }],
  ['another branch', f => { f.run.head_branch = 'other'; }],
  ['different workflow', f => { f.run.path = '.github/workflows/OTHER.yml'; }],
  ['running build', f => { f.run.status = 'in_progress'; }],
  ['failed toolchain', f => { f.jobs.jobs[0].conclusion = 'failure'; }],
  ['expired archive', f => { f.artifacts.artifacts[0].expired = true; }],
  ['wrong artifact', f => { f.artifacts.artifacts[0].name = 'different-run'; }]
]) test(`resume rejects ${name}`, () => {
  const f = fixture(); mutate(f);
  assert.throws(() => validateResume(f.run, f.jobs, f.artifacts, repository, 'main', '123'));
});

test('actual checkpoint shell rejects unfinished, preview and wrong-run imports', async t => {
  const script = await readFile(new URL('../Scripts/Athena-checkpoint.sh', import.meta.url), 'utf8');
  const start = script.indexOf('        expected_run=');
  const end = script.indexOf('        [[ "$(cat "$src/arch.txt")', start);
  assert.ok(start > 0 && end > start);
  const guard = 'set -e\n' + script.slice(start, end);
  const root = await mkdtemp(join(tmpdir(), 'athena-resume-test-'));
  t.after(async () => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.match(basename(root), /^athena-resume-test-[A-Za-z0-9]+$/);
    await rm(root, { recursive: true, force: true });
  });
  await writeFile(join(root, 'run.txt'), '123\n');
  const bashRoot = process.platform === 'win32' ? root.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`) : root;
  for (const [stage, preview, complete, expected, current, ok] of [
    ['firmware', 'false', 'true', '123', '456', true],
    ['firmware', 'false', 'false', '123', '456', false],
    ['firmware', 'true', 'true', '123', '456', false],
    ['toolchain', 'false', 'true', '123', '456', false],
    ['firmware', 'false', 'true', '789', '456', false],
    ['firmware', 'true', 'true', '', '123', true]
  ]) {
    await writeFile(join(root, 'complete.txt'), complete + '\n');
    const result = spawnSync(process.env.TEST_BASH || 'bash', ['-c', guard], {
      env: { ...process.env, src: bashRoot, WRT_STAGE: stage, stage: 'toolchain', WRT_TEST: preview,
        WRT_CHECKPOINT_RUN_ID: expected, GITHUB_RUN_ID: current }, encoding: 'utf8'
    });
    assert.equal(result.status === 0, ok, `${stage}/${preview}/${complete}/${expected}: ${result.stderr}`);
  }
});

test('GNU make forwards the single-device override to recursive image rules', async t => {
  const available = spawnSync('make', ['--version'], { encoding: 'utf8' });
  if (available.error?.code === 'ENOENT') return t.skip('GNU make is checked on the GitHub Linux runner.');
  assert.equal(available.status, 0);
  const root = await mkdtemp(join(tmpdir(), 'athena-make-test-'));
  t.after(async () => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.match(basename(root), /^athena-make-test-[A-Za-z0-9]+$/);
    await rm(root, { recursive: true, force: true });
  });
  const file = join(root, 'device.mk');
  await writeFile(file, 'TARGET_DEVICES += unrelated-device\nall:\n\t@$(MAKE) --no-print-directory -f "$(lastword $(MAKEFILE_LIST))" show\nshow:\n\t@printf "%s\\n" "$(TARGET_DEVICES)"\n');
  const result = spawnSync('make', ['--no-print-directory', '-f', file, 'TARGET_DEVICES=jdcloud_re-cs-02', 'all'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'jdcloud_re-cs-02');
});
