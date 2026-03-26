export async function publishToGitHub(
  slug: string,
  astroContent: string,
  metadata: Record<string, unknown>,
): Promise<{ commitSha: string; commitUrl: string }> {
  const githubToken = (Deno.env.get("GITHUB_TOKEN") || "").trim();
  const githubRepo = (Deno.env.get("GITHUB_REPO") || "").trim();
  if (!githubToken || !githubRepo) {
    throw new Error("GITHUB_TOKEN and GITHUB_REPO must be configured");
  }

  const branch = "main";
  const apiBase = `https://api.github.com/repos/${githubRepo}`;
  const headers = {
    Authorization: `Bearer ${githubToken}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
  };

  async function createBlob(content: string): Promise<string> {
    const res = await fetch(`${apiBase}/git/blobs`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        content: btoa(unescape(encodeURIComponent(content))),
        encoding: "base64",
      }),
    });
    if (!res.ok) throw new Error(`Failed to create blob: ${res.status}`);
    return (await res.json()).sha;
  }

  const jsonContent = JSON.stringify(metadata, null, 2) + "\n";
  const [jsonBlob, astroBlob] = await Promise.all([
    createBlob(jsonContent),
    createBlob(astroContent),
  ]);

  // Retry loop handles 422 "ref update" race conditions when concurrent
  // pipeline runs commit at nearly the same time. On 422, re-fetch the
  // latest ref SHA, rebuild tree+commit with the new parent, and retry.
  const MAX_COMMIT_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_COMMIT_RETRIES; attempt++) {
    const refRes = await fetch(`${apiBase}/git/refs/heads/${branch}`, { headers });
    if (!refRes.ok) throw new Error(`Failed to get branch ref: ${refRes.status}`);
    const currentCommitSha = (await refRes.json()).object.sha;

    const commitRes = await fetch(`${apiBase}/git/commits/${currentCommitSha}`, { headers });
    if (!commitRes.ok) throw new Error(`Failed to get commit: ${commitRes.status}`);
    const baseTreeSha = (await commitRes.json()).tree.sha;

    const treeRes = await fetch(`${apiBase}/git/trees`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: [
          { path: `src/content/articles/${slug}.json`, mode: "100644", type: "blob", sha: jsonBlob },
          { path: `src/pages/articles/${slug}.astro`, mode: "100644", type: "blob", sha: astroBlob },
        ],
      }),
    });
    if (!treeRes.ok) throw new Error(`Failed to create tree: ${treeRes.status}`);
    const treeData = await treeRes.json();

    const newCommitRes = await fetch(`${apiBase}/git/commits`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: `feat: Publish article — '${slug}'`,
        tree: treeData.sha,
        parents: [currentCommitSha],
      }),
    });
    // 422 on commit creation = stale parent SHA (another commit landed)
    if (!newCommitRes.ok) {
      if (newCommitRes.status === 422 && attempt < MAX_COMMIT_RETRIES) {
        console.log(`[GitHub] Commit creation 422 (attempt ${attempt}/${MAX_COMMIT_RETRIES}) — stale parent. Retrying with fresh ref...`);
        continue;
      }
      throw new Error(`Failed to create commit: ${newCommitRes.status}`);
    }
    const newCommitData = await newCommitRes.json();

    const updateRefRes = await fetch(`${apiBase}/git/refs/heads/${branch}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ sha: newCommitData.sha }),
    });

    if (updateRefRes.ok) {
      return { commitSha: newCommitData.sha, commitUrl: newCommitData.html_url };
    }

    // 422 on ref update = another commit advanced HEAD between our fetch and patch
    if (updateRefRes.status === 422 && attempt < MAX_COMMIT_RETRIES) {
      console.log(`[GitHub] Ref update 422 (attempt ${attempt}/${MAX_COMMIT_RETRIES}) — another commit landed. Retrying with fresh ref...`);
      continue;
    }

    throw new Error(`Failed to update ref: ${updateRefRes.status}`);
  }

  throw new Error("Failed to publish after max retries");
}
