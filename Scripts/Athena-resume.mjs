import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { githubClient } from './Athena-sources.mjs';

export function validateResume(run, jobs, artifacts, repository, branch, requested) {
  if (!/^\d+$/.test(requested) || String(run.id) !== requested || run.status !== 'completed'
    || !['failure', 'success'].includes(run.conclusion) || run.event !== 'workflow_dispatch'
    || run.repository?.full_name !== repository || run.head_repository?.full_name !== repository
    || run.head_branch !== branch || run.path !== '.github/workflows/ATHENA.yml') {
    throw new Error('Checkpoint run must be a completed manual build in this repository and branch.');
  }
  if (!jobs.jobs?.some(j => j.name === 'toolchain / VIKINGYFY/immortalwrt / toolchain' && j.conclusion === 'success')) {
    throw new Error('Checkpoint run has no successful toolchain job.');
  }
  const name = `athena-b-checkpoint-toolchain-${requested}`;
  if (!artifacts.artifacts?.some(a => a.name === name && !a.expired && a.size_in_bytes > 0)) {
    throw new Error('Completed toolchain artifact is missing or expired.');
  }
}

async function main() {
  const requested = process.env.CHECKPOINT_RUN_ID || '';
  if (!/^\d+$/.test(requested) || requested === process.env.GITHUB_RUN_ID || process.env.PREVIEW !== 'false') {
    throw new Error('Cross-run recovery requires an explicit preceding run and a formal build.');
  }
  const repository = process.env.GITHUB_REPOSITORY;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '')) throw new Error('Invalid repository.');
  const get = githubClient();
  const prefix = `/repos/${repository}/actions/runs/${requested}`;
  const [run, jobs, artifacts] = await Promise.all([get(prefix), get(`${prefix}/jobs?per_page=100`), get(`${prefix}/artifacts?per_page=100`)]);
  validateResume(run, jobs, artifacts, repository, process.env.GITHUB_REF_NAME, requested);
  await appendFile(process.env.GITHUB_OUTPUT, `run_id=${requested}\n`);
  console.log(`Validated preceding toolchain run ${requested}; restore still requires matching input/config/source hashes and complete=true.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
