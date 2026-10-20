import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export function releaseName(createdAt) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(createdAt) || !Number.isFinite(Date.parse(createdAt))) {
    throw new Error('Invalid workflow creation time.');
  }
  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date(createdAt));
  const part = type => date.find(p => p.type === type).value;
  return `Athena-ImmortalWrt-${part('year')}${part('month')}${part('day')}`;
}

export function checkExistingRelease(release, repository, runId, sha) {
  const marker = `构建任务：https://github.com/${repository}/actions/runs/${runId}`;
  if (release && (release.target_commitish !== sha || !(release.body || '').split('\n').map(s => s.trim()).includes(marker))) {
    throw new Error('A different build already owns this date tag; preserve it and use a later date.');
  }
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  const sha = process.env.GITHUB_SHA;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '') || !/^\d+$/.test(runId || '') || !/^[0-9a-f]{40}$/.test(sha || '')) {
    throw new Error('Missing or invalid workflow identity.');
  }
  const get = async (path, missingAllowed = false) => {
    const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${process.env.GH_TOKEN}` },
      signal: AbortSignal.timeout(20000)
    });
    if (missingAllowed && response.status === 404) return null;
    if (!response.ok) throw new Error(`Release identity request failed (${response.status}).`);
    return response.json();
  };
  const run = await get(`actions/runs/${runId}`);
  const tag = releaseName(run.created_at);
  checkExistingRelease(await get(`releases/tags/${tag}`, true), repository, runId, sha);
  // A manually created tag must not be moved by a new release either.
  const ref = await get(`git/ref/tags/${tag}`, true);
  if (ref && ref.object?.sha !== sha) throw new Error('Existing date tag points elsewhere; stop without overwriting it.');
  await appendFile(process.env.GITHUB_OUTPUT, `tag=${tag}\n`);
  console.log(`Release name: ${tag} (workflow creation date in Asia/Shanghai)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
