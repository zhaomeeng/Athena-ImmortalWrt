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

async function sourceFile(get, repository, commit, path) {
  const result = await get(`/repos/${repository}/contents/${path}?ref=${commit}`);
  ensure(result.type === 'file' && result.encoding === 'base64' && typeof result.content === 'string', 'Invalid source version file.');
  return normalize(Buffer.from(result.content, 'base64').toString('utf8'));
}

export async function resolveVersions(get, source) {
  const read = path => sourceFile(get, source.repository, source.commit, path);
  const target = await read('target/linux/qualcommax/Makefile');
  const subtarget = await read('target/linux/qualcommax/ipq60xx/target.mk');
  const patch = text => [...text.matchAll(/^\s*KERNEL_PATCHVER\s*:?=\s*(\d+\.\d+)\s*$/gm)];
  const assignments = patch(subtarget).length ? patch(subtarget) : patch(target);
  ensure(assignments.length === 1, 'Missing or ambiguous target kernel version.');
  const series = assignments[0][1];
  const kernelFile = `target/linux/generic/kernel-${series}`;
  const details = await read(kernelFile);
  const suffixes = [...details.matchAll(new RegExp(`^LINUX_VERSION-${series.replace('.', '\\.')}\\s*:?=\\s*(\\.\\d+(?:[-a-z0-9.]*)?)\\s*$`, 'gm'))];
  ensure(suffixes.length === 1, 'Missing or ambiguous kernel patch version.');
  const versionMk = await read('include/version.mk');
  const defaults = [...versionMk.matchAll(/^VERSION_NUMBER:=\$\(if \$\(VERSION_NUMBER\),\$\(VERSION_NUMBER\),([A-Za-z0-9_.-]+)\)\s*$/gm)];
  ensure(defaults.length === 1, 'Unsupported ImmortalWrt source version declaration.');
  ensure(/^VERSION_DIST:=.*ImmortalWRT\)\s*$/m.test(versionMk), 'Unexpected source distribution.');
  return { kernel: series + suffixes[0][1], immortalwrt: defaults[0][1],
    basis: 'locked source defaults; not a compiled firmware version',
    files: ['target/linux/qualcommax/Makefile', 'target/linux/qualcommax/ipq60xx/target.mk', kernelFile, 'include/version.mk'] };
}

export function renderVersionReadme(text, source, versions) {
  const start = '<!-- ATHENA-SOURCE-VERSIONS:START -->';
  const end = '<!-- ATHENA-SOURCE-VERSIONS:END -->';
  const normalized = normalize(text);
  ensure(normalized.split(start).length === 2 && normalized.split(end).length === 2 && normalized.indexOf(end) > normalized.indexOf(start), 'Missing or ambiguous README version markers.');
  const base = `https://github.com/${source.repository}/blob/${source.commit}`;
  const origin = source.selection === 'branch-head'
    ? `| 更新来源 | 作者 \`${source.branch}\` 分支固定提交（保留 NSS） |`
    : `| 对应上游发布 | [${source.release_tag}](${source.release_url}) |`;
  const block = `${start}\n## 当前待编译源码版本\n\n| 项目 | 锁定版本 |\n| --- | --- |\n| ImmortalWrt | **${versions.immortalwrt}**（源码默认版本） |\n| Linux 内核 | **${versions.kernel}** |\n| 源码分支 | \`${source.branch}\` |\n| 源码提交 | [\`${source.commit.slice(0, 12)}\`](https://github.com/${source.repository}/commit/${source.commit}) |\n${origin}\n\n版本随源码更新任务自动维护，读取固定提交的 [版本声明](${base}/include/version.mk) 与 [内核版本文件](${base}/${versions.files[2]})。以上对应待编译源码，尚不代表本仓库已发布固件或路由器运行版本；SNAPSHOT 表示开发版本，具体来源以提交为准。\n${end}`;
  return normalized.slice(0, normalized.indexOf(start)) + block + normalized.slice(normalized.indexOf(end) + end.length);
}

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
  const migration = (policy.migration_sources || []).some(s => s.branch === source.location && s.commit === source.revision);
  ensure(legacy || migration || policy.allowed_branches.includes(source.location), 'Current source branch is not approved.');
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
  let candidate;
  if (policy.update_mode === 'branch-head') {
    ensure(policy.tracking_branch === 'main' && policy.allowed_branches.length === 1 && policy.allowed_branches[0] === 'main', 'Branch tracking must stay on approved NSS main.');
    const head = await get(`/repos/${policy.source_repository}/branches/${policy.tracking_branch}`);
    ensure(SHA.test(head.commit?.sha || ''), 'Invalid source branch response.');
    candidate = { repository: policy.source_repository, branch: policy.tracking_branch, commit: head.commit.sha,
      selection: 'branch-head', source_url: `https://github.com/${policy.source_repository}/commit/${head.commit.sha}` };
  } else {
    ensure(!policy.update_mode || policy.update_mode === 'release', 'Unknown source update mode.');
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
  candidate = parseRelease(releases[0], policy);
  if (provenance) ensure(Date.parse(candidate.published_at) >= Date.parse(provenance.source.published_at), 'Upstream publication moved backwards.');
  }
  if (source.location === candidate.branch && source.revision === candidate.commit) {
    const versions = provenance?.versions || await resolveVersions(get, candidate);
    const record = { ...provenance, versions };
    const readme = await readFile(join(root, 'README.md'), 'utf8');
    const readmeText = renderVersionReadme(readme, provenance.source, versions);
    return { changed: !provenance.versions || readmeText !== normalize(readme),
      reason: 'Source commit unchanged; feed and plugin locks retained.', source: provenance.source,
      lockText: normalize(lockText), record, readmeText };
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
  if (policy.update_mode === 'branch-head') {
    const target = await sourceFile(get, policy.source_repository, candidate.commit, 'target/linux/qualcommax/Makefile');
    const defaults = [...normalize(target).replace(/#[^\n]*/g, '').replace(/\\\n/g, ' ').matchAll(/^DEFAULT_PACKAGES\s*\+=([^\n]*)/gm)]
      .flatMap(match => match[1].trim().split(/\s+/));
    ensure(Array.isArray(policy.required_target_packages) && policy.required_target_packages.includes('kmod-qca-nss-drv') && policy.required_target_packages.includes('kmod-qca-nss-ecm') && policy.required_target_packages.includes('kmod-qca-nss-dp'), 'Missing NSS source policy.');
    for (const name of policy.required_target_packages) ensure(defaults.includes(name), `Required NSS target default missing: ${name}`);
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
  record.versions = await resolveVersions(get, candidate);
  const readmeText = renderVersionReadme(await readFile(join(root, 'README.md'), 'utf8'), candidate, record.versions);
  return { changed: nextLock !== normalize(lockText), source: candidate, lockText: nextLock, record, readmeText };
}

export async function applyPlan(root, plan) {
  if (!plan.changed) return;
  // All network requests and validation finish before writing tracked files.
  await mkdir(join(root, 'sources'), { recursive: true });
  await writeFile(join(root, 'build.lock.tsv'), plan.lockText, 'utf8');
  await writeFile(join(root, 'sources/upstream.json'), formatJson(plan.record), 'utf8');
  await writeFile(join(root, 'README.md'), plan.readmeText, 'utf8');
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
  delete report.readmeText;
  const out = join(root, 'artifacts/source-update');
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'report.json'), formatJson({ dry_run: dryRun, ...report }));
  if (plan.changed) await writeFile(join(out, 'proposed.build.lock.tsv'), plan.lockText);
  if (plan.changed) await writeFile(join(out, 'proposed.README.md'), plan.readmeText);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT,
    `changed=${plan.changed && !dryRun}\nsource_commit=${plan.source.commit}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
    `### Athena source update\n\n- Dry run: ${dryRun}\n- Changed: ${plan.changed}\n- Upstream: [${plan.source.release_tag || plan.source.branch}](${plan.source.release_url || plan.source.source_url})\n- Source: \`${plan.source.commit}\`\n- Firmware: not compiled; use Build Firmware manually.\n`);
  console.log(formatJson({ dry_run: dryRun, changed: plan.changed, source: plan.source }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`Source operation stopped: ${error.message}`); process.exitCode = 1; });
}
