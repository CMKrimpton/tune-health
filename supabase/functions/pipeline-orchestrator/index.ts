import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { supabase } from "../_shared/db.ts";
import { ACTIVE, STALE_MS, MAX_CONCURRENT } from "../_shared/constants.ts";

// Map article status → which stage function to call next
const STAGE_MAP: Record<string, string> = {
  "voice_rewrite_done":    "stage-publish",
  "qc_approved":           "stage-publish",
  "voice_rewrite_pending": "stage-voice-rewrite",
  "independence_done":     "stage-qc",
  "written":               "stage-independence",
  "editor_approved":       "stage-write",
  "research_done":         "stage-editor",
};

// Priority order — finish later stages before starting earlier ones
const STATUS_PRIORITY = [
  "voice_rewrite_done",
  "qc_approved",
  "voice_rewrite_pending",
  "independence_done",
  "written",
  "editor_approved",
  "research_done",
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const db = supabase();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    // Step 1: Clean up stale runs (>2min in active status) → reset to checkpoint
    const staleThreshold = new Date(Date.now() - STALE_MS).toISOString();
    const { data: staleRuns } = await db
      .from("daily_article_log")
      .select("id, status, research_data")
      .in("status", ACTIVE)
      .lt("stage_started_at", staleThreshold);

    if (staleRuns && staleRuns.length > 0) {
      for (const stale of staleRuns) {
        const staleId = (stale as { id: string }).id;
        const research = ((stale as { research_data: Record<string, unknown> | null }).research_data) || {};

        // Self-healing: determine the best resumption checkpoint from saved data
        let resumeStatus: string | null = null;
        if (research._voiceRewriteCompleted && research._article) {
          resumeStatus = "voice_rewrite_done";
        } else if (research._voiceRewriteRequested && !research._voiceRewriteCompleted && research._article) {
          resumeStatus = "voice_rewrite_pending";
        } else if (research._independenceReview && research._article) {
          resumeStatus = "independence_done";
        } else if (research._article) {
          resumeStatus = "written";
        } else if (research._editorBrief) {
          resumeStatus = "editor_approved";
        } else if (research.topic || research.keyFindings || research.candidates) {
          resumeStatus = "research_done";
        }

        if (resumeStatus) {
          // Timeout with salvageable data — reset to checkpoint instead of failing
          await db
            .from("daily_article_log")
            .update({
              status: resumeStatus,
              error: null,
              stage_started_at: new Date().toISOString(),
            })
            .eq("id", staleId);
          console.log(`[Orchestrator] Reset stale ${(stale as { status: string }).status} → ${resumeStatus} for log ${staleId}`);
        } else {
          // No salvageable data — mark as failed
          await db
            .from("daily_article_log")
            .update({ status: "failed", error: "Timed out (stale run — no checkpoint data)", completed_at: new Date().toISOString() })
            .eq("id", staleId);
        }
      }
    }

    // Step 2: Check concurrency — block if max stages running
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: activeRuns } = await db
      .from("daily_article_log")
      .select("id, status")
      .in("status", ACTIVE)
      .gte("stage_started_at", fiveMinAgo);

    if (activeRuns && activeRuns.length >= MAX_CONCURRENT) {
      return json({
        skipped: true,
        message: `${activeRuns.length} stages currently running (max ${MAX_CONCURRENT}). Waiting.`,
        active: activeRuns.map((r: Record<string, unknown>) => r.status),
      });
    }

    // Step 3: Find highest-priority article that needs work
    for (const status of STATUS_PRIORITY) {
      const { data: entries } = await db
        .from("daily_article_log")
        .select("id")
        .eq("status", status)
        .order("created_at", { ascending: true })
        .limit(1);

      if (entries && entries.length > 0) {
        const logId = (entries[0] as { id: string }).id;
        const functionName = STAGE_MAP[status];

        // Call the stage function via HTTP
        const url = `${supabaseUrl}/functions/v1/${functionName}`;
        console.log(`[Orchestrator] Dispatching ${functionName} for log ${logId} (status: ${status})`);

        const stageRes = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ logId }),
        });

        const stageResult = await stageRes.json();
        return json({ dispatched: functionName, logId, status, stageResult });
      }
    }

    // Step 4: Nothing in pipeline — pick from topic queue and start research
    const { data: topTopic } = await db
      .from("topic_queue")
      .select("id, topic, notes, category, source")
      .eq("status", "queued")
      .order("expedite", { ascending: false })
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(1);

    if (!topTopic || topTopic.length === 0) {
      return json({ skipped: true, message: "Queue empty. Run 'scout' to discover topics." });
    }

    const topic = topTopic[0] as { id: string; topic: string; notes: string | null; category: string | null; source: string | null };
    await db.from("topic_queue").update({ status: "in_progress" }).eq("id", topic.id);

    // Create log entry
    const today = new Date().toISOString().split("T")[0];
    const { data: logEntry } = await db
      .from("daily_article_log")
      .insert({ run_date: today, status: "started", topic: topic.topic, source: "queue", stage_started_at: new Date().toISOString() })
      .select("id")
      .single();

    if (!logEntry) throw new Error("Failed to create log entry");

    // Call stage-research
    const researchUrl = `${supabaseUrl}/functions/v1/stage-research`;
    console.log(`[Orchestrator] Starting new topic: "${topic.topic}" — calling stage-research for log ${logEntry.id}`);

    const researchRes = await fetch(researchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ logId: logEntry.id, topic: topic.topic, source: topic.source }),
    });

    const researchResult = await researchRes.json();

    // Check if research succeeded
    const { data: postResearchLog } = await db.from("daily_article_log").select("status").eq("id", logEntry.id).maybeSingle();

    if (postResearchLog?.status === "failed") {
      // Research failed — put topic back in queue
      await db.from("topic_queue").update({ status: "queued" }).eq("id", topic.id);
      return json({ success: false, stage: "research_failed", topic: topic.topic, researchResult });
    }

    // Research succeeded (status should be research_done) — immediately call stage-editor
    if (postResearchLog?.status === "research_done") {
      console.log(`[Orchestrator] Research done — immediately calling stage-editor for log ${logEntry.id}`);
      const editorUrl = `${supabaseUrl}/functions/v1/stage-editor`;
      const editorRes = await fetch(editorUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ logId: logEntry.id }),
      });

      const editorResult = await editorRes.json();

      // Check if editor killed the article
      const { data: postEditorLog } = await db.from("daily_article_log").select("status").eq("id", logEntry.id).maybeSingle();

      if (postEditorLog?.status === "failed") {
        // Editor killed it — put topic back in queue so it's not lost
        await db.from("topic_queue").update({ status: "queued" }).eq("id", topic.id);
        console.log(`[Orchestrator] Editor killed topic "${topic.topic}" — re-queued`);
        return json({ success: true, stage: "editor_killed", topic: topic.topic, editorResult, message: "Editor killed this topic. Re-queued for future consideration." });
      }

      // Editor approved — mark queue topic complete
      await db.from("topic_queue").update({ status: "completed" }).eq("id", topic.id);

      return json({
        success: true,
        dispatched: ["stage-research", "stage-editor"],
        logId: logEntry.id,
        topic: topic.topic,
        researchResult,
        editorResult,
        message: "Research + Editor done. Next cron invocation will start writing.",
      });
    }

    // Research returned unexpected status — mark queue topic back
    await db.from("topic_queue").update({ status: "queued" }).eq("id", topic.id);
    return json({ success: true, dispatched: "stage-research", logId: logEntry.id, topic: topic.topic, researchResult });
  } catch (err: unknown) {
    return json({
      error: "An internal error occurred",
      detail: err instanceof Error ? err.message : "Unknown error",
    }, 500);
  }
});
