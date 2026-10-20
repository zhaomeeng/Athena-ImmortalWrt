import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseName, checkExistingRelease } from '../Scripts/Athena-release-name.mjs';

test('release date uses Shanghai and crosses UTC midnight correctly', () => {
  assert.equal(releaseName('2026-10-20T15:59:59Z'), 'Athena-ImmortalWrt-261020');
  assert.equal(releaseName('2026-10-20T16:00:00Z'), 'Athena-ImmortalWrt-261021');
  assert.equal(releaseName('2026-12-31T16:00:00Z'), 'Athena-ImmortalWrt-270101');
});
test('invalid creation time is rejected', () => {
  assert.throws(() => releaseName('not-a-date'));
});
test('another run cannot replace an existing date release', () => {
  const release = { target_commitish: 'sha', body: '构建任务：https://github.com/owner/repo/actions/runs/123' };
  assert.throws(() => checkExistingRelease(release, 'owner/repo', '456', 'sha'), /already owns/);
  assert.throws(() => checkExistingRelease(release, 'owner/repo', '123', 'other'), /already owns/);
  assert.doesNotThrow(() => checkExistingRelease(release, 'owner/repo', '123', 'sha'));
  assert.doesNotThrow(() => checkExistingRelease(null, 'owner/repo', '456', 'sha'));
});
