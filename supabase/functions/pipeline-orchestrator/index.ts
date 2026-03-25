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
    // Uses STALE_MS as the window — anything older than that was already reset in Step 1
    const concurrencyWindow = new Date(Date.now() - STALE_MS).toISOString();
    const { data: activeRuns } = await db
      .from("daily_article_log")
      .select("id, status")
      .in("status", ACTIVE)
      .gte("stage_started_at", concurrencyWindow);

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

        // Dispatch stage function via HTTP with a SHORT timeout (5s).
        // The stage is a SEPARATE Supabase Edge Function invocation — it continues
        // running even after the orchestrator disconnects. We just need the HTTP
        // request to be sent and acknowledged. The 5s timeout is enough for the stage
        // to receive the request and start processing. Its actual work (API calls etc.)
        // happens on the stage's own ~150s invocation timeout.
        // Deno kills fire-and-forget fetches on handler exit, so we MUST await.
        const url = `${supabaseUrl}/functions/v1/${functionName}`;
        console.log(`[Orchestrator] Dispatching ${functionName} for log ${logId} (status: ${status})`);

        try {
          const stageRes = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ logId }),
            signal: AbortSignal.timeout(5000), // 5s — just enough to send the request
          });
          // If stage responds within 5s (unlikely for API-heavy stages), capture result
          const stageResult = await stageRes.json().catch(() => null);
          return json({ dispatched: functionName, logId, status, stageResult });
        } catch {
          // Timeout is expected — the stage is running on its own invocation
          return json({ dispatched: functionName, logId, status, note: "Stage dispatched (running independently)" });
        }
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

    // Dispatch stage-research with short timeout.
    // Stage-research is a separate invocation — continues running after disconnect.
    // Next cron tick: orchestrator sees research_done → dispatches stage-editor.
    // If editor kills, stage-editor re-queues the topic itself.
    const researchUrl = `${supabaseUrl}/functions/v1/stage-research`;
    console.log(`[Orchestrator] Starting new topic: "${topic.topic}" — dispatching stage-research for log ${logEntry.id}`);

    try {
      await fetch(researchUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ logId: logEntry.id, topic: topic.topic, source: topic.source, queueId: topic.id }),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Timeout expected — stage-research continues on its own invocation
    }

    return json({ dispatched: "stage-research", logId: logEntry.id, topic: topic.topic });
  } catch (err: unknown) {
    return json({
      error: "An internal error occurred",
      detail: err instanceof Error ? err.message : "Unknown error",
    }, 500);
  }
});
