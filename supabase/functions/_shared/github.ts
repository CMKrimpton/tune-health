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
    // Use utf-8 encoding — the GitHub API handles it natively.
    // The old btoa(unescape(encodeURIComponent())) pattern double-encoded
    // non-ASCII characters (em dashes, smart quotes, accented letters)
    // in Deno's runtime, producing mojibake like â€" instead of —.
    const res = await fetch(`${apiBase}/git/blobs`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        content,
        encoding: "utf-8",
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

/**
 * Read an article's JSON metadata from GitHub (the deployed source of truth).
 * Returns the parsed JSON object, or null on failure (never throws).
 */
export async function readGitHubJson(
  slug: string,
): Promise<Record<string, unknown> | null> {
  const githubToken = (Deno.env.get("GITHUB_TOKEN") || "").trim();
  const githubRepo = (Deno.env.get("GITHUB_REPO") || "").trim();
  if (!githubToken || !githubRepo) return null;

  const jsonPath = `src/content/articles/${slug}.json`;
  const apiBase = `https://api.github.com/repos/${githubRepo}`;
  const headers = {
    Authorization: `Bearer ${githubToken}`,
    Accept: "application/vnd.github.v3+json",
  };

  try {
    const fileRes = await fetch(`${apiBase}/contents/${jsonPath}?ref=main`, { headers });
    if (!fileRes.ok) return null;
    const fileData = await fileRes.json();

    // UTF-8-safe Base64 decode
    const raw = atob(fileData.content.replace(/\n/g, ""));
    const rawBytes = Uint8Array.from(raw, c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(rawBytes));
  } catch {
    return null;
  }
}

/**
 * Update fields in an existing GitHub JSON file (e.g. add heroImage, narrationUrl).
 * Fetches the current file, merges new fields, commits, and triggers Vercel rebuild.
 * Returns true on success, false on failure (never throws — callers log warnings).
 */
export async function updateGitHubJson(
  slug: string,
  fields: Record<string, unknown>,
  commitMessage: string,
): Promise<boolean> {
  const githubToken = (Deno.env.get("GITHUB_TOKEN") || "").trim();
  const githubRepo = (Deno.env.get("GITHUB_REPO") || "").trim();
  if (!githubToken || !githubRepo) return false;

  const jsonPath = `src/content/articles/${slug}.json`;
  const apiBase = `https://api.github.com/repos/${githubRepo}`;
  const headers = {
    Authorization: `Bearer ${githubToken}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
  };

  try {
    // Fetch current JSON from GitHub
    const fileRes = await fetch(`${apiBase}/contents/${jsonPath}?ref=main`, { headers });
    if (!fileRes.ok) {
      console.warn(`[GitHub] Could not fetch ${jsonPath}: ${fileRes.status}`);
      return false;
    }
    const fileData = await fileRes.json();

    // UTF-8-safe Base64 decode
    const raw = atob(fileData.content.replace(/\n/g, ""));
    const rawBytes = Uint8Array.from(raw, c => c.charCodeAt(0));
    const existing = JSON.parse(new TextDecoder().decode(rawBytes));

    // Merge new fields
    Object.assign(existing, fields);

    // UTF-8-safe Base64 encode
    const encoded = new TextEncoder().encode(JSON.stringify(existing, null, 2) + "\n");
    let bin = "";
    for (const b of encoded) bin += String.fromCharCode(b);
    const content = btoa(bin);

    // Commit
    const updateRes = await fetch(`${apiBase}/contents/${jsonPath}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: commitMessage,
        content,
        sha: fileData.sha,
        branch: "main",
      }),
    });

    if (!updateRes.ok) {
      console.warn(`[GitHub] Failed to update ${jsonPath}: ${updateRes.status}`);
      return false;
    }

    // Trigger Vercel rebuild
    const deployHook = Deno.env.get("VERCEL_DEPLOY_HOOK");
    if (deployHook) {
      fetch(deployHook, { method: "POST" }).catch(() => {});
    }

    console.log(`[GitHub] Updated ${jsonPath}: ${commitMessage}`);
    return true;
  } catch (err) {
    console.warn(`[GitHub] updateGitHubJson failed for ${slug}: ${err instanceof Error ? err.message : "unknown"}`);
    return false;
  }
}
