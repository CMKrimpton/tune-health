import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface PublishRequest {
  slug: string;
  astroContent: string;
  metadata: Record<string, unknown>;
  commitMessage: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const adminToken = (Deno.env.get("ADMIN_TOKEN") || "").trim();
    const authHeader = req.headers.get("authorization")?.replace("Bearer ", "") || "";
    if (!adminToken || authHeader !== adminToken) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { slug, astroContent, metadata, commitMessage }: PublishRequest = await req.json();

    if (!slug || !astroContent || !metadata) {
      return new Response(
        JSON.stringify({ error: "slug, astroContent, and metadata are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const githubToken = Deno.env.get("GITHUB_TOKEN");
    const githubRepo = Deno.env.get("GITHUB_REPO"); // format: "owner/repo"

    if (!githubToken || !githubRepo) {
      return new Response(
        JSON.stringify({ error: "GITHUB_TOKEN and GITHUB_REPO must be configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const branch = "main";
    const apiBase = `https://api.github.com/repos/${githubRepo}`;
    const headers = {
      "Authorization": `Bearer ${githubToken}`,
      "Accept": "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    };

    // 1. Get the current commit SHA for the branch
    const refRes = await fetch(`${apiBase}/git/refs/heads/${branch}`, { headers });
    if (!refRes.ok) throw new Error(`Failed to get branch ref: ${refRes.status}`);
    const refData = await refRes.json();
    const currentCommitSha = refData.object.sha;

    // 2. Get the current commit to find the tree SHA
    const commitRes = await fetch(`${apiBase}/git/commits/${currentCommitSha}`, { headers });
    if (!commitRes.ok) throw new Error(`Failed to get commit: ${commitRes.status}`);
    const commitData = await commitRes.json();
    const baseTreeSha = commitData.tree.sha;

    // 3. Create blobs for files that need updating
    const jsonContent = JSON.stringify(metadata, null, 2) + "\n";
    const jsonBlob = await createBlob(apiBase, headers, jsonContent);

    const treeItems: Array<{ path: string; mode: string; type: string; sha: string }> = [
      {
        path: `src/content/articles/${slug}.json`,
        mode: "100644",
        type: "blob",
        sha: jsonBlob,
      },
    ];

    // Only include .astro file if content was provided (null = metadata-only update)
    if (astroContent) {
      const astroBlob = await createBlob(apiBase, headers, astroContent);
      treeItems.push({
        path: `src/pages/articles/${slug}.astro`,
        mode: "100644",
        type: "blob",
        sha: astroBlob,
      });
    }

    // 4. Create a new tree
    const treeRes = await fetch(`${apiBase}/git/trees`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeItems,
      }),
    });
    if (!treeRes.ok) throw new Error(`Failed to create tree: ${treeRes.status}`);
    const treeData = await treeRes.json();

    // 5. Create the commit
    const newCommitRes = await fetch(`${apiBase}/git/commits`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: commitMessage || `feat: Add '${slug}' article`,
        tree: treeData.sha,
        parents: [currentCommitSha],
      }),
    });
    if (!newCommitRes.ok) throw new Error(`Failed to create commit: ${newCommitRes.status}`);
    const newCommitData = await newCommitRes.json();

    // 6. Update the branch reference
    const updateRefRes = await fetch(`${apiBase}/git/refs/heads/${branch}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        sha: newCommitData.sha,
      }),
    });
    if (!updateRefRes.ok) throw new Error(`Failed to update ref: ${updateRefRes.status}`);

    return new Response(
      JSON.stringify({
        success: true,
        commitSha: newCommitData.sha,
        commitUrl: newCommitData.html_url,
        articleUrl: `/articles/${slug}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    return new Response(
      JSON.stringify({ error: "An internal error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function createBlob(apiBase: string, headers: Record<string, string>, content: string): Promise<string> {
  // Use utf-8 encoding — btoa+unescape double-encodes non-ASCII chars in Deno
  const res = await fetch(`${apiBase}/git/blobs`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      content,
      encoding: "utf-8",
    }),
  });
  if (!res.ok) throw new Error(`Failed to create blob: ${res.status}`);
  const data = await res.json();
  return data.sha;
}
