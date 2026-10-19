import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLock, parseFeeds, parseRelease, loadInputs, planUpdate, applyPlan, pinFeeds, formatJson } from '../Scripts/Athena-sources.mjs';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const policy = JSON.parse(await readFile(join(repoRoot, 'Config/UPSTREAM-SOURCE.json'), 'utf8'));
const OLD = policy.legacy_source.commit;
const NEW = '2'.repeat(40);
const FEED = '3'.repeat(40);
const tag = 'IPQ60XX-WIFI-YES-VIKINGYFY-owrt-26.10.19-07.29.05';
const release = () => ({ id: 123, tag_name: tag, html_url: `https://github.com/${policy.release_repository}/releases/tag/${tag}`,
  draft: false, prerelease: false, published_at: '2026-10-19T01:18:10Z',
  body: `源码：https://github.com/${policy.source_repository}.git\n分支：owrt\n提交：${NEW}\n配置：IPQ60XX-WIFI-YES\n平台：qualcommax\n`,
  target_commitish: 'main', // This is the framework ref, never the source SHA.
  assets: [{ name: `Config-${tag}.txt`, size: 4 }, ...['factory', 'sysupgrade'].map(f => ({
    name: `qualcommax-ipq60xx-jdcloud_re-cs-02-squashfs-${f}-VIKINGYFY-owrt-WIFI-YES-26.10.19-07.29.05.bin`, size: 100 }))] });
const initialLock = () => `source\t${policy.source_repository}\tmain\t${OLD}\nfeed\tpackages\t${policy.feed_repositories.packages}\t${'1'.repeat(40)}\npackage\tvernesong/OpenClash\tdev\t${'4'.repeat(40)}\nbinary\tmihomo\thttps://github.com/MetaCubeX/mihomo/releases/download/pinned/core.gz\t${'5'.repeat(64)}\n`;
const feedsText = Object.entries(policy.feed_repositories).map(([name, url]) => `src-git ${name} ${url}`).join('\n') + '\n';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'athena-source-test-'));
  t.after(async () => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.match(basename(root), /^athena-source-test-[A-Za-z0-9]+$/);
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(join(root, 'Config'));
  await writeFile(join(root, 'Config/UPSTREAM-SOURCE.json'), formatJson(policy));
  await writeFile(join(root, 'build.lock.tsv'), initialLock());
  return root;
}

function api({ releases = [release()], feeds = feedsText, branchHead = NEW, comparison = 'ahead', failFeed = false } = {}) {
  const calls = [];
  const get = async path => {
    calls.push(path);
    if (path.includes('/releases?')) return releases;
    if (path.endsWith(`/commits/${NEW}`)) return { sha: NEW };
    if (path.endsWith('/branches/owrt')) return { commit: { sha: branchHead } };
    if (path.includes('/compare/')) return { status: comparison };
    if (path.includes('/contents/feeds.conf.default?')) return { type: 'file', encoding: 'base64', content: Buffer.from(feeds).toString('base64') };
    if (/\/commits\/(HEAD|release%2Fbranch|[0-9a-f]{40})$/.test(path)) {
      if (failFeed) throw new Error('Simulated feed outage.');
      const requested = path.split('/').at(-1);
      return { sha: /^[0-9a-f]{40}$/.test(requested) ? requested : FEED };
    }
    throw new Error(`Unexpected fixture API path: ${path}`);
  };
  return { get, calls };
}

test('release source comes from validated body, not target_commitish', () => {
  const parsed = parseRelease(release(), policy);
  assert.equal(parsed.commit, NEW);
  assert.equal(parsed.branch, 'owrt');
});

for (const [name, mutate] of [
  ['missing source', r => { r.body = r.body.replace(/^源码：.*\n/, ''); }],
  ['ambiguous source', r => { r.body += `提交：${OLD}\n`; }],
  ['unapproved source', r => { r.body = r.body.replace(policy.source_repository, 'attacker/source'); }],
  ['branch migration', r => { r.body = r.body.replace('分支：owrt', '分支：unexpected'); }],
  ['shell-shaped SHA', r => { r.body = r.body.replace(NEW, '$(execute)'); }],
  ['wrong target', r => { r.body = r.body.replace('配置：IPQ60XX-WIFI-YES', '配置：IPQ60XX-WIFI-NO'); }],
  ['missing Athena image', r => { r.assets.pop(); }],
  ['empty config asset', r => { r.assets[0].size = 0; }],
  ['draft', r => { r.draft = true; }],
  ['prerelease', r => { r.prerelease = true; }],
  ['tag branch mismatch', r => { r.tag_name = r.tag_name.replace('-owrt-', '-main-'); }],
  ['untrusted URL', r => { r.html_url = 'https://example.com/release'; }]
]) test(`reject ${name}`, () => {
  const candidate = release(); mutate(candidate);
  assert.throws(() => parseRelease(candidate, policy));
});

test('plain Athena image names are accepted', () => {
  const candidate = release();
  candidate.assets[1].name = 'qualcommax-ipq60xx-jdcloud_re-cs-02-squashfs-factory.bin';
  assert.equal(parseRelease(candidate, policy).commit, NEW);
});

test('feed parsing handles comments, exact commits and branch refs', () => {
  const text = `# ignored\r\nsrc-git packages ${policy.feed_repositories.packages};release/branch\r\nsrc-git-full luci ${policy.feed_repositories.luci}^${FEED}\r\n`;
  assert.deepEqual(parseFeeds(text, policy).map(f => f.ref), ['release/branch', FEED]);
});

for (const [name, text] of [
  ['unknown feed', 'src-git surprise https://github.com/attacker/feed.git\n'],
  ['changed feed URL', 'src-git packages https://github.com/attacker/feed.git\n'],
  ['unsupported source', 'src-link packages /tmp/feed\n'],
  ['bad fixed SHA', `src-git packages ${policy.feed_repositories.packages}^latest\n`],
  ['duplicate feeds', `src-git packages ${policy.feed_repositories.packages}\nsrc-git packages ${policy.feed_repositories.packages}\n`]
]) test(`reject ${name}`, () => assert.throws(() => parseFeeds(text, policy)));

test('resolve all new source feeds while retaining custom package and binary locks', async t => {
  const root = await fixture(t);
  const mock = api();
  const before = parseLock(initialLock()).filter(e => ['package', 'binary'].includes(e.kind));
  const plan = await planUpdate(root, mock.get, '2026-10-19T03:20:00Z');
  assert.equal(plan.changed, true);
  assert.equal(plan.record.feeds.length, 7);
  const after = parseLock(plan.lockText);
  assert.deepEqual(after.filter(e => ['package', 'binary'].includes(e.kind)), before);
  assert.equal(after[0].location, 'owrt');
  assert.equal(await readFile(join(root, 'build.lock.tsv'), 'utf8'), initialLock()); // planning/dry run is read only
  await applyPlan(root, plan);
  assert.equal((await loadInputs(root)).source.revision, NEW);
  const again = api();
  const noChange = await planUpdate(root, again.get);
  assert.equal(noChange.changed, false);
  assert.equal(again.calls.length, 1); // no daily feed/plugin drift for the same source commit
});

test('newer platform releases with unsupported branches stop instead of falling back', async t => {
  const root = await fixture(t);
  const newer = release();
  newer.id++;
  newer.published_at = '2026-10-20T01:18:10Z';
  newer.body = newer.body.replace('分支：owrt', '分支：other');
  await assert.rejects(planUpdate(root, api({ releases: [release(), newer] }).get), /unapproved branch/);
});

test('ignore other platforms and prereleases', async t => {
  const root = await fixture(t);
  const other = { ...release(), tag_name: 'IPQ807X-WIFI-YES-other', published_at: '2026-10-20T01:18:10Z' };
  const preview = { ...release(), prerelease: true, published_at: '2026-10-20T01:18:10Z' };
  assert.equal((await planUpdate(root, api({ releases: [other, preview, release()] }).get)).source.commit, NEW);
});

test('paginate before deciding no matching platform release exists', async t => {
  const root = await fixture(t);
  const mock = api();
  const get = path => path.endsWith('page=1') ? Promise.resolve(Array.from({ length: 100 }, () => ({ tag_name: 'other' }))) : mock.get(path);
  assert.equal((await planUpdate(root, get)).source.commit, NEW);
});

test('feed resolution failure leaves every tracked input untouched', async t => {
  const root = await fixture(t);
  await assert.rejects(planUpdate(root, api({ failFeed: true }).get), /outage/);
  assert.equal(await readFile(join(root, 'build.lock.tsv'), 'utf8'), initialLock());
  await assert.rejects(readFile(join(root, 'sources/upstream.json')), { code: 'ENOENT' });
});

test('reject a release commit outside the approved branch', async t => {
  const root = await fixture(t);
  await assert.rejects(planUpdate(root, api({ branchHead: '6'.repeat(40), comparison: 'diverged' }).get), /not on/);
});

test('reject rollback on the same branch', async t => {
  const root = await fixture(t);
  await applyPlan(root, await planUpdate(root, api().get));
  const next = release();
  next.body = next.body.replace(NEW, '7'.repeat(40));
  const mock = api({ releases: [next], branchHead: '7'.repeat(40), comparison: 'behind' });
  const get = path => path.endsWith(`/commits/${'7'.repeat(40)}`) ? Promise.resolve({ sha: '7'.repeat(40) }) : mock.get(path);
  await assert.rejects(planUpdate(root, get), /roll back/);
});

test('manual source validation rejects a lock edited without matching provenance', async t => {
  const root = await fixture(t);
  await applyPlan(root, await planUpdate(root, api().get));
  const lock = await readFile(join(root, 'build.lock.tsv'), 'utf8');
  await writeFile(join(root, 'build.lock.tsv'), lock.replace(FEED, '8'.repeat(40)));
  await assert.rejects(loadInputs(root), /provenance/);
});

test('manual build pins every source feed including new feeds', async t => {
  const root = await fixture(t);
  await applyPlan(root, await planUpdate(root, api().get));
  const path = join(root, 'feeds.conf.default');
  await writeFile(path, '# keep comment\n' + feedsText);
  await pinFeeds(root, path);
  const pinned = await readFile(path, 'utf8');
  assert.equal((pinned.match(new RegExp(`\\^${FEED}`, 'g')) || []).length, 7);
  assert.ok(pinned.startsWith('# keep comment\n'));
  await pinFeeds(root, path); // idempotent after already pinned
});

test('manual build refuses missing or additional locked feeds', async t => {
  const root = await fixture(t);
  const path = join(root, 'feeds.conf.default');
  await writeFile(path, feedsText);
  await assert.rejects(pinFeeds(root, path), /differs from lock/);
  assert.equal(await readFile(path, 'utf8'), feedsText);
});

test('manual build retains upstream full-history feed declarations', async t => {
  const root = await fixture(t);
  const full = feedsText.replace('src-git luci', 'src-git-full luci');
  await applyPlan(root, await planUpdate(root, api({ feeds: full }).get));
  const path = join(root, 'feeds.conf.default');
  await writeFile(path, full);
  await pinFeeds(root, path);
  assert.match(await readFile(path, 'utf8'), /^src-git-full luci /m);
});

test('build is manual only and the update workflow cannot dispatch a build', async () => {
  const build = await readFile(join(repoRoot, '.github/workflows/ATHENA.yml'), 'utf8');
  const update = await readFile(join(repoRoot, '.github/workflows/SOURCE-UPDATE.yml'), 'utf8');
  const triggers = build.slice(build.indexOf('\non:'), build.indexOf('\npermissions:'));
  assert.match(triggers, /workflow_dispatch:/);
  assert.doesNotMatch(triggers, /\b(push|schedule|workflow_run|repository_dispatch|pull_request):/);
  assert.match(update, /cron: '20 3 \* \* \*'/);
  assert.doesNotMatch(update, /WRT-CORE|workflow run|workflow_dispatches|\bmake\b|Athena-compile|actions:\s*write/);
  assert.match(update, /git add -- build.lock.tsv sources\/upstream.json/);
});

test('source runtime is installed after hosted tool cache cleanup', async () => {
  const core = await readFile(join(repoRoot, '.github/workflows/WRT-CORE.yml'), 'utf8');
  assert.ok(core.indexOf('Set up source validation runtime') > core.indexOf('Reclaim hosted runner disk space'));
  assert.ok(core.indexOf('Set up source validation runtime') < core.indexOf('Prepare Athena locked sources and service defaults'));
});
