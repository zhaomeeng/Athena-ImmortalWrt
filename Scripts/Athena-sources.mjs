// Source metadata only: never execute upstream files or invoke a firmware build.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const SHA = /^[0-9a-f]{40}$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const normalize = text => text.replace(/\r\n/g, '\n');
export const digest = text => createHash('sha256').update(normalize(text)).digest('hex');
const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const json = text => JSON.parse(text);
export const formatJson = value => `${JSON.stringify(value, null, 2)}\n`;

export function parseLock(text) {
  const entries = normalize(text).trimEnd().split('\n').map(line => {
    const fields = line.split('\t');
    ensure(fields.length === 4 && fields.every(Boolean), 'Invalid lock row.');
    const [kind, name, location, revision] = fields;
    ensure(['source', 'feed', 'package', 'binary'].includes(kind), 'Unknown lock kind.');
    ensure((kind === 'binary' ? /^[0-9a-f]{64}$/ : SHA).test(revision), 'Invalid locked digest.');
    return { kind, name, location, revision };
  });
  ensure(entries.filter(e => e.kind === 'source').length === 1, 'Exactly one source lock is required.');
  ensure(new Set(entries.map(e => `${e.kind}:${e.name}`)).size === entries.length, 'Duplicate lock row.');
  return entries;
}

export function parseFeeds(text, policy) {
  const feeds = [];
  for (const line of normalize(text).split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = line.match(/^\s*(src-git(?:-full)?)\s+([a-z0-9_-]+)\s+(https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.git)(?:([;^])([^\s]+))?\s*$/);
    ensure(match, 'Unsupported active feed declaration.');
    const [, method, name, url, separator, ref] = match;
    ensure(policy.feed_repositories[name] === url, 'Unapproved feed name or repository.');
    if (separator === '^') ensure(SHA.test(ref), 'Invalid fixed feed commit.');
    if (separator === ';') ensure(/^[A-Za-z0-9_./-]+$/.test(ref) && !ref.includes('..'), 'Invalid feed ref.');
    feeds.push({ method, name, url, ref: ref || 'HEAD' });
  }
  ensure(feeds.length > 0, 'No active source feeds.');
  ensure(new Set(feeds.map(e => e.name)).size === feeds.length, 'Duplicate source feed.');
  return feeds;
}

export function parseRelease(release, policy) {
  ensure(Number.isSafeInteger(release.id) && release.id > 0, 'Invalid release ID.');
  ensure(!release.draft && !release.prerelease, 'Upstream release is not final.');
  ensure(typeof release.tag_name === 'string' && /^[A-Za-z0-9_.-]+$/.test(release.tag_name), 'Invalid release tag.');
  const field = label => {
    const matches = [...normalize(release.body || '').matchAll(new RegExp(`^${label}[:：][ \\t]*(\\S+)[ \\t]*$`, 'gm'))];
    ensure(matches.length === 1, `Missing or ambiguous release field: ${label}.`);
    return matches[0][1];
  };
  const repo = field('源码');
  const branch = field('分支');
  const commit = field('提交');
  ensure(repo === `https://github.com/${policy.source_repository}.git`, 'Unapproved source repository.');
  ensure(policy.allowed_branches.includes(branch), 'Upstream changed to an unapproved branch.');
  ensure(SHA.test(commit), 'Invalid release source commit.');
  ensure(field('配置') === 'IPQ60XX-WIFI-YES' && field('平台') === 'qualcommax', 'Wrong upstream target.');
  const suffix = release.tag_name.slice(`${policy.release_prefix}${branch}-`.length);
  ensure(release.tag_name.startsWith(`${policy.release_prefix}${branch}-`) && /^\d{2}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}$/.test(suffix), 'Release tag and source branch disagree.');
  ensure(Number.isFinite(Date.parse(release.published_at)), 'Missing release publication time.');
  const url = `https://github.com/${policy.release_repository}/releases/tag/${release.tag_name}`;
  ensure(release.html_url === url, 'Unexpected release URL.');
  const assets = (release.assets || []).filter(a => a.size > 0 && (!a.state || a.state === 'uploaded'));
  ensure(assets.some(a => a.name === `Config-${release.tag_name}.txt`), 'Missing upstream configuration asset.');
  for (const format of ['factory', 'sysupgrade']) {
    const pattern = new RegExp(`^qualcommax-ipq60xx-jdcloud_re-cs-02-squashfs-${format}(?:-[A-Za-z0-9_.-]+)?\\.bin$`);
    ensure(assets.some(a => pattern.test(a.name)), `Missing upstream Athena ${format} asset.`);
  }
  return { repository: policy.source_repository, branch, commit, release_id: release.id,
    release_tag: release.tag_name, release_url: url, published_at: release.published_at };
}

export async function loadInputs(root) {
  const policy = json(await readFile(join(root, 'Config/UPSTREAM-SOURCE.json'), 'utf8'));
  ensure(REPO.test(policy.release_repository) && REPO.test(policy.source_repository), 'Invalid policy repository.');
  ensure(Array.isArray(policy.allowed_branches) && policy.allowed_branches.every(b => /^[a-z0-9_-]+$/.test(b)), 'Invalid branch policy.');
  const lockText = await readFile(join(root, 'build.lock.tsv'), 'utf8');
  const entries = parseLock(lockText);
  const source = entries.find(e => e.kind === 'source');
  ensure(source.name === policy.source_repository, 'Current source does not match policy.');
  const legacy = source.location === policy.legacy_source.branch && source.revision === policy.legacy_source.commit;
  ensure(legacy || policy.allowed_branches.includes(source.location), 'Current source branch is not approved.');
  let provenance;
  try { provenance = json(await readFile(join(root, 'sources/upstream.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (provenance) {
    ensure(provenance.source.repository === source.name && provenance.source.branch === source.location && provenance.source.commit === source.revision, 'Source provenance disagrees with lock.');
    ensure(provenance.build_lock_sha256 === digest(lockText), 'Lock differs from its source provenance.');
  } else ensure(legacy, 'Updated source requires provenance.');
  return { policy, entries, source, lockText, provenance };
}

export function githubClient(token = process.env.GH_TOKEN) {
  return async path => {
    ensure(path.startsWith('/repos/'), 'Unsupported API path.');
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(`https://api.github.com${path}`, {
          headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'Athena-ImmortalWrt-source-update', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          signal: AbortSignal.timeout(20000)
        });
        if (!response.ok) {
          if (response.status >= 500 && attempt < 2) continue;
          throw new Error(`GitHub API request failed (${response.status}).`);
        }
        return await response.json();
      } catch (error) {
        if (attempt === 2 || error.message.startsWith('GitHub API request failed')) throw error;
      }
    }
  };
}

export async function planUpdate(root, get = githubClient(), now = new Date().toISOString()) {
  const input = await loadInputs(root);
  const { policy, source, entries, lockText, provenance } = input;
  let releases = [];
  for (let page = 1; page <= 5; page++) {
    const items = await get(`/repos/${policy.release_repository}/releases?per_page=100&page=${page}`);
    ensure(Array.isArray(items), 'Invalid releases response.');
    releases = items.filter(r => !r.draft && !r.prerelease && typeof r.tag_name === 'string' && r.tag_name.startsWith(policy.release_prefix));
    if (releases.length || items.length < 100) break;
  }
  ensure(releases.length > 0, 'No matching platform release found.');
  ensure(releases.every(r => Number.isFinite(Date.parse(r.published_at))), 'Invalid release publication time.');
  releases.sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at) || b.id - a.id);
  const candidate = parseRelease(releases[0], policy);
  if (provenance) ensure(Date.parse(candidate.published_at) >= Date.parse(provenance.source.published_at), 'Upstream publication moved backwards.');
  if (source.location === candidate.branch && source.revision === candidate.commit) {
    return { changed: false, reason: 'Source commit unchanged; feed and plugin locks retained.', source: candidate };
  }
  const commit = await get(`/repos/${policy.source_repository}/commits/${candidate.commit}`);
  ensure(commit.sha === candidate.commit, 'Source commit could not be verified.');
  const branch = await get(`/repos/${policy.source_repository}/branches/${candidate.branch}`);
  ensure(SHA.test(branch.commit?.sha || ''), 'Invalid source branch response.');
  if (branch.commit.sha !== candidate.commit) {
    const comparison = await get(`/repos/${policy.source_repository}/compare/${candidate.commit}...${branch.commit.sha}`);
    ensure(['ahead', 'identical'].includes(comparison.status), 'Release commit is not on the approved branch.');
  }
  if (source.location === candidate.branch) {
    const comparison = await get(`/repos/${policy.source_repository}/compare/${source.revision}...${candidate.commit}`);
    ensure(comparison.status === 'ahead', 'Source update would roll back or diverge.');
  }
  const contents = await get(`/repos/${policy.source_repository}/contents/feeds.conf.default?ref=${candidate.commit}`);
  ensure(contents.type === 'file' && contents.encoding === 'base64' && typeof contents.content === 'string', 'Invalid feed file response.');
  const feeds = parseFeeds(Buffer.from(contents.content, 'base64').toString('utf8'), policy);
  const lockedFeeds = [];
  for (const feed of feeds) {
    const repository = feed.url.slice('https://github.com/'.length, -4);
    const result = await get(`/repos/${repository}/commits/${encodeURIComponent(feed.ref)}`);
    ensure(SHA.test(result.sha || ''), 'Feed commit could not be verified.');
    if (SHA.test(feed.ref)) ensure(result.sha === feed.ref, 'Fixed feed commit disagrees with GitHub.');
    lockedFeeds.push({ ...feed, commit: result.sha });
  }
  const retained = entries.filter(e => !['source', 'feed'].includes(e.kind));
  const nextEntries = [{ kind: 'source', name: candidate.repository, location: candidate.branch, revision: candidate.commit },
    ...lockedFeeds.map(f => ({ kind: 'feed', name: f.name, location: f.url, revision: f.commit })), ...retained];
  const nextLock = `${nextEntries.map(e => [e.kind, e.name, e.location, e.revision].join('\t')).join('\n')}\n`;
  parseLock(nextLock);
  const record = { schema_version: 1, source: candidate, resolved_at: now, feeds: lockedFeeds,
    build_lock_sha256: digest(nextLock), validation_scope: 'source metadata and feed locks only; updater does not compile firmware',
    previous_source: { branch: source.location, commit: source.revision },
    custom_package_and_binary_locks: 'retained unchanged',
    base_framework_commit: process.env.GITHUB_SHA || null };
  return { changed: nextLock !== normalize(lockText), source: candidate, lockText: nextLock, record };
}

export async function applyPlan(root, plan) {
  if (!plan.changed) return;
  // All network requests and validation finish before writing either tracked file.
  await mkdir(join(root, 'sources'), { recursive: true });
  await writeFile(join(root, 'build.lock.tsv'), plan.lockText, 'utf8');
  await writeFile(join(root, 'sources/upstream.json'), formatJson(plan.record), 'utf8');
}

export async function pinFeeds(root, path) {
  const { policy, entries } = await loadInputs(root);
  const text = await readFile(path, 'utf8');
  const feeds = parseFeeds(text, policy);
  const locks = entries.filter(e => e.kind === 'feed');
  ensure(locks.length === feeds.length, 'Source feed set differs from lock.');
  const pinned = new Map();
  for (const feed of feeds) {
    const lock = locks.find(e => e.name === feed.name);
    ensure(lock && lock.location === feed.url, 'Source feed has no matching repository lock.');
    if (SHA.test(feed.ref)) ensure(feed.ref === lock.revision, 'Source fixed feed commit differs from lock.');
    pinned.set(feed.name, `${feed.method} ${feed.name} ${feed.url}^${lock.revision}`);
  }
  const result = normalize(text).split('\n').map(line => {
    const match = line.match(/^\s*src-git(?:-full)?\s+([a-z0-9_-]+)\s+/);
    return match ? pinned.get(match[1]) : line;
  }).join('\n');
  await writeFile(path, result, 'utf8');
}

async function main() {
  const args = process.argv.slice(2);
  let root = process.env.GITHUB_WORKSPACE || process.cwd();
  const rootIndex = args.indexOf('--root');
  if (rootIndex >= 0) { ensure(args[rootIndex + 1], 'Missing root path.'); root = args.splice(rootIndex, 2)[1]; }
  if (args.length === 1 && args[0] === '--resolve-build') {
    const { source } = await loadInputs(root);
    const output = `repo=https://github.com/${source.name}.git\nname=${source.name}\nbranch=${source.location}\nrevision=${source.revision}\n`;
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, output);
    console.log(output.trimEnd());
    return;
  }
  if (args.length === 2 && args[0] === '--pin-feeds') {
    await pinFeeds(root, resolve(args[1]));
    console.log('PASS: every active source feed has an exact lock.');
    return;
  }
  ensure(args.length === 0 || (args.length === 1 && args[0] === '--dry-run'), 'Unsupported arguments.');
  const dryRun = args.includes('--dry-run');
  const plan = await planUpdate(root);
  if (!dryRun) await applyPlan(root, plan);
  const report = { ...plan };
  delete report.lockText;
  const out = join(root, 'artifacts/source-update');
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'report.json'), formatJson({ dry_run: dryRun, ...report }));
  if (plan.changed) await writeFile(join(out, 'proposed.build.lock.tsv'), plan.lockText);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT,
    `changed=${plan.changed && !dryRun}\nsource_commit=${plan.source.commit}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
    `### Athena source update\n\n- Dry run: ${dryRun}\n- Changed: ${plan.changed}\n- Upstream: [${plan.source.release_tag}](${plan.source.release_url})\n- Source: \`${plan.source.commit}\`\n- Firmware: not compiled; use Build Firmware manually.\n`);
  console.log(formatJson({ dry_run: dryRun, changed: plan.changed, source: plan.source }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`Source operation stopped: ${error.message}`); process.exitCode = 1; });
}
