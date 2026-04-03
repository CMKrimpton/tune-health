import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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
    // Auth check
    const adminToken = (Deno.env.get("ADMIN_TOKEN") || "").trim();
    const authHeader = req.headers.get("authorization")?.replace("Bearer ", "") || "";
    if (!adminToken || authHeader !== adminToken) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    // ─── Full cleanup: database + storage ───
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const cleanup: string[] = [];

    // 6. Delete from articles table
    const { error: dbErr } = await db.from("articles").delete().eq("slug", slug);
    if (dbErr) {
      console.error(`[delete-article] DB delete failed for "${slug}":`, dbErr.message);
      cleanup.push(`DB delete failed: ${dbErr.message}`);
    } else {
      cleanup.push("articles row deleted");
    }

    // 7. Clean up pipeline logs (mark as deleted, preserve for audit)
    const { error: logErr } = await db
      .from("daily_article_log")
      .update({ status: "failed", error: `Deleted via admin editor` })
      .eq("slug", slug)
      .neq("status", "failed");
    if (!logErr) cleanup.push("pipeline logs marked deleted");

    // 8. Delete illustrations from storage
    const illustrationFiles = [
      `illustrations/${slug}.png`,
      `illustrations/${slug}-light.png`,
    ];
    const { error: illErr } = await db.storage
      .from("article-illustrations")
      .remove(illustrationFiles);
    if (!illErr) cleanup.push("illustrations deleted");

    // 9. Delete narration from storage
    const { error: narErr } = await db.storage
      .from("article-narrations")
      .remove([`narrations/${slug}.mp3`]);
    if (!narErr) cleanup.push("narration deleted");

    console.log(`[delete-article] "${slug}" fully cleaned up:`, cleanup.join(", "));

    return new Response(
      JSON.stringify({ success: true, commitSha: newCommitData.sha, cleanup }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("[delete-article] Error:", err);
    return new Response(
      JSON.stringify({ error: "An internal error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
