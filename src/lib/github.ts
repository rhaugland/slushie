import { Octokit } from "@octokit/rest";

/** Create an Octokit instance for a specific user's token */
export function getOctokit(token: string): Octokit {
  return new Octokit({ auth: token });
}

/** Parse "org/repo" into owner + repo */
export function parseRepo(githubRepo: string): { owner: string; repo: string } {
  const [owner, repo] = githubRepo.split("/");
  if (!owner || !repo) throw new Error(`Invalid repo format: "${githubRepo}". Expected "org/repo".`);
  return { owner, repo };
}

/** Get or create a branch from a base branch */
export async function ensureBranch(token: string, githubRepo: string, branchName: string, baseBranch: string = "dev") {
  const octokit = getOctokit(token);
  const { owner, repo } = parseRepo(githubRepo);

  try {
    await octokit.rest.git.getRef({ owner, repo, ref: `heads/${branchName}` });
  } catch {
    const base = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${baseBranch}` });
    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: base.data.object.sha,
    });
  }
}

/** Push files to a branch via GitHub API (tree + commit) */
export async function pushFiles(
  token: string,
  githubRepo: string,
  branch: string,
  files: { path: string; content: string }[],
  message: string
) {
  const octokit = getOctokit(token);
  const { owner, repo } = parseRepo(githubRepo);

  const ref = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${branch}` });
  const parentSha = ref.data.object.sha;

  const parentCommit = await octokit.rest.git.getCommit({ owner, repo, commit_sha: parentSha });
  const baseTree = parentCommit.data.tree.sha;

  const tree = await Promise.all(
    files.map(async (file) => {
      const blob = await octokit.rest.git.createBlob({
        owner,
        repo,
        content: Buffer.from(file.content).toString("base64"),
        encoding: "base64",
      });
      return {
        path: file.path,
        mode: "100644" as const,
        type: "blob" as const,
        sha: blob.data.sha,
      };
    })
  );

  const newTree = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: baseTree,
    tree,
  });

  const commit = await octokit.rest.git.createCommit({
    owner,
    repo,
    message,
    tree: newTree.data.sha,
    parents: [parentSha],
  });

  await octokit.rest.git.updateRef({
    owner,
    repo,
    ref: `heads/${branch}`,
    sha: commit.data.sha,
  });

  return { sha: commit.data.sha };
}

/** Create a pull request */
export async function createPR(
  token: string,
  githubRepo: string,
  head: string,
  base: string,
  title: string,
  body: string
): Promise<{ number: number; url: string }> {
  const octokit = getOctokit(token);
  const { owner, repo } = parseRepo(githubRepo);

  const pr = await octokit.rest.pulls.create({
    owner,
    repo,
    title,
    body,
    head,
    base,
  });

  return { number: pr.data.number, url: pr.data.html_url };
}

/** Get deployment status from GitHub */
export async function getDeployments(token: string, githubRepo: string, environment?: string) {
  const octokit = getOctokit(token);
  const { owner, repo } = parseRepo(githubRepo);

  const params: any = { owner, repo, per_page: 10 };
  if (environment) params.environment = environment;

  const deployments = await octokit.rest.repos.listDeployments(params);

  const results = await Promise.all(
    deployments.data.slice(0, 5).map(async (dep) => {
      const statuses = await octokit.rest.repos.listDeploymentStatuses({
        owner,
        repo,
        deployment_id: dep.id,
        per_page: 1,
      });
      const latest = statuses.data[0];
      return {
        id: dep.id,
        environment: dep.environment,
        ref: dep.ref,
        sha: dep.sha.slice(0, 7),
        status: latest?.state ?? "unknown",
        url: latest?.environment_url ?? null,
        createdAt: dep.created_at,
        updatedAt: latest?.created_at ?? dep.created_at,
      };
    })
  );

  return results;
}

/** Get branches for a repo */
export async function getBranches(token: string, githubRepo: string) {
  const octokit = getOctokit(token);
  const { owner, repo } = parseRepo(githubRepo);

  const branches = await octokit.rest.repos.listBranches({ owner, repo, per_page: 100 });
  return branches.data.map((b) => ({
    name: b.name,
    sha: b.commit.sha.slice(0, 7),
    protected: b.protected,
  }));
}

/** Get open PRs for a repo */
export async function getOpenPRs(token: string, githubRepo: string) {
  const octokit = getOctokit(token);
  const { owner, repo } = parseRepo(githubRepo);

  const prs = await octokit.rest.pulls.list({ owner, repo, state: "open", per_page: 50 });
  return prs.data.map((pr) => ({
    number: pr.number,
    title: pr.title,
    head: pr.head.ref,
    base: pr.base.ref,
    url: pr.html_url,
    author: pr.user?.login,
    createdAt: pr.created_at,
  }));
}

/** Environment branches that should NOT become features */
export const ENV_BRANCHES = new Set(["main", "master", "dev", "develop", "staging", "production"]);

/** Get files changed on a branch compared to base */
export async function getBranchFiles(
  token: string,
  githubRepo: string,
  branch: string,
  baseBranch: string = "main"
): Promise<{ path: string; content: string }[]> {
  const octokit = getOctokit(token);
  const { owner, repo } = parseRepo(githubRepo);

  // Get the comparison
  const compare = await octokit.rest.repos.compareCommits({
    owner,
    repo,
    base: baseBranch,
    head: branch,
  });

  const files: { path: string; content: string }[] = [];

  for (const file of compare.data.files || []) {
    if (file.status === "removed") continue;
    if (!file.filename) continue;
    // Skip binary files, lock files, etc
    if (/\.(png|jpg|jpeg|gif|ico|woff|woff2|ttf|eot|lock)$/.test(file.filename)) continue;
    if (file.filename.startsWith("node_modules/")) continue;

    try {
      const content = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: file.filename,
        ref: branch,
      });

      if ("content" in content.data && content.data.type === "file") {
        files.push({
          path: file.filename,
          content: Buffer.from(content.data.content, "base64").toString("utf-8"),
        });
      }
    } catch {
      // Skip files we can't read
    }
  }

  return files;
}

/** Download entire repo as zip URL */
export function getArchiveUrl(githubRepo: string, branch: string): string {
  const { owner, repo } = parseRepo(githubRepo);
  return `https://api.github.com/repos/${owner}/${repo}/zipball/${branch}`;
}

/** Download archive as buffer */
export async function downloadArchive(token: string, githubRepo: string, branch: string): Promise<Buffer> {
  const octokit = getOctokit(token);
  const { owner, repo } = parseRepo(githubRepo);

  const res = await octokit.rest.repos.downloadZipballArchive({
    owner,
    repo,
    ref: branch,
  });

  return Buffer.from(res.data as ArrayBuffer);
}
