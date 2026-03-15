import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { slug } = await req.json();

    if (!slug || typeof slug !== "string") {
      return new Response(
        JSON.stringify({ error: "slug is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const githubToken = Deno.env.get("GITHUB_TOKEN");
    const githubRepo = Deno.env.get("GITHUB_REPO");

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

    // 1. Get current commit SHA
    const refRes = await fetch(`${apiBase}/git/refs/heads/${branch}`, { headers });
    if (!refRes.ok) throw new Error(`Failed to get branch ref: ${refRes.status}`);
    const refData = await refRes.json();
    const currentCommitSha = refData.object.sha;

    // 2. Get current tree
    const commitRes = await fetch(`${apiBase}/git/commits/${currentCommitSha}`, { headers });
    if (!commitRes.ok) throw new Error(`Failed to get commit: ${commitRes.status}`);
    const commitData = await commitRes.json();
    const baseTreeSha = commitData.tree.sha;

    // 3. Create new tree WITHOUT the deleted files (sha: null deletes)
    const treeRes = await fetch(`${apiBase}/git/trees`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: [
          {
            path: `src/pages/articles/${slug}.astro`,
            mode: "100644",
            type: "blob",
            sha: null, // Delete
          },
          {
            path: `src/content/articles/${slug}.json`,
            mode: "100644",
            type: "blob",
            sha: null, // Delete
          },
        ],
      }),
    });
    if (!treeRes.ok) throw new Error(`Failed to create tree: ${treeRes.status}`);
    const treeData = await treeRes.json();

    // 4. Create commit
    const newCommitRes = await fetch(`${apiBase}/git/commits`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: `chore: Delete '${slug}' article`,
        tree: treeData.sha,
        parents: [currentCommitSha],
      }),
    });
    if (!newCommitRes.ok) throw new Error(`Failed to create commit: ${newCommitRes.status}`);
    const newCommitData = await newCommitRes.json();

    // 5. Update branch ref
    const updateRefRes = await fetch(`${apiBase}/git/refs/heads/${branch}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ sha: newCommitData.sha }),
    });
    if (!updateRefRes.ok) throw new Error(`Failed to update ref: ${updateRefRes.status}`);

    return new Response(
      JSON.stringify({ success: true, commitSha: newCommitData.sha }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
