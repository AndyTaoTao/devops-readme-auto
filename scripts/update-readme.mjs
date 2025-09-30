// scripts/update-readme.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const owner = process.env.GH_OWNER;
const repo = process.env.GH_REPO;
const token = process.env.GH_TOKEN;

if (!owner || !repo || !token) {
  console.error("Missing env: GH_OWNER/GH_REPO/GH_TOKEN");
  process.exit(1);
}

const api = 'https://api.github.com';

async function gh(path) {
  const res = await fetch(`${api}${path}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status}: ${body}`);
  }
  return res.json();
}

const fmtDate = iso => new Date(iso).toISOString().split('T')[0];

async function buildActivity() {
  const repoInfo = await gh(`/repos/${owner}/${repo}`);
  const branch = repoInfo.default_branch;

  const commits = await gh(`/repos/${owner}/${repo}/commits?sha=${branch}&per_page=5`);
  const prs = await gh(`/repos/${owner}/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=5`);
  const issues = await gh(`/repos/${owner}/${repo}/issues?state=all&sort=updated&direction=desc&per_page=5`);

  const commitItems = commits.map(c => `- **Commit:** ${c.sha.slice(0,7)} — ${c.commit.message.split('\n')[0]} (${fmtDate(c.commit.author?.date || c.commit.committer?.date)})`);
  const prItems = prs.map(pr => {
    const state = pr.state === 'closed' ? (pr.merged_at ? 'merged' : 'closed') : 'open';
    return `- **PR:** #${pr.number} ${pr.title} — ${state} (${fmtDate(pr.updated_at)})`;
  });
  const issueItems = issues.filter(i => !i.pull_request).map(i => `- **Issue:** #${i.number} ${i.title} — ${i.state} (${fmtDate(i.updated_at)})`);

  const lines = [
    `> Updated: ${new Date().toISOString()}`,
    ``,
    `### Commits`,
    ...commitItems,
    ``,
    `### Pull requests`,
    ...prItems,
    ``,
    `### Issues`,
    ...issueItems
  ];

  return lines.join('\n');
}

function replaceBetween(content, startMarker, endMarker, injected) {
  const s = content.indexOf(startMarker);
  const e = content.indexOf(endMarker);
  if (s === -1 || e === -1 || e < s) throw new Error("README markers not found or malformed.");
  return content.slice(0, s + startMarker.length) + "\n" + injected + "\n" + content.slice(e);
}

async function run() {
  const start = '<!--START_SECTION:activity-->';
  const end = '<!--END_SECTION:activity-->';
  const readme = readFileSync('README.md', 'utf8');
  const activity = await buildActivity();
  const updated = replaceBetween(readme, start, end, activity);

  if (updated.trim() === readme.trim()) {
    console.log("README activity section unchanged.");
    return;
  }
  writeFileSync('README.md', updated, 'utf8');
  console.log("README updated with recent activity.");
}

run().catch(err => {
  console.error(err.message);
  process.exit(1);
});
