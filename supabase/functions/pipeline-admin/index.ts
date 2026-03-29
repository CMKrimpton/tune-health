import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { supabase, calcCost, dispatchStage } from "../_shared/db.ts";
import { rotateFeatured } from "../_shared/featured.ts";
import { getCategoryGradient, MODELS } from "../_shared/constants.ts";
import { verifyPubMedCitations } from "../_shared/pubmed.ts";
import type { ApiUsage } from "../_shared/types.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const db = supabase();

  try {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const action = (body.action as string) || "";

    // ------ ROTATE FEATURED — standalone, works even when crons are paused ------
    if (action === "rotate-featured") {
      const newFeatured = await rotateFeatured(db);
      return json({
        success: true,
        newFeatured,
        message: newFeatured
          ? `Featured rotated to: ${newFeatured}`
          : "No rotation needed (current featured is still fresh or no eligible articles)",
      });
    }

    // ------ STATUS ------
    if (action === "status") {
      // Housekeeping: clean up queue items whose topics have already been written
      const { data: publishedSlugs } = await db.from("articles").select("title").eq("status", "published");
      if (publishedSlugs && publishedSlugs.length > 0) {
        const publishedTitles = publishedSlugs.map((a: { title: string }) => a.title.toLowerCase());
        const { data: queuedItems } = await db.from("topic_queue").select("id, topic").eq("status", "queued");
        if (queuedItems) {
          for (const q of queuedItems as Array<{ id: string; topic: string }>) {
            const topicWords = q.topic.toLowerCase().split(/\s+/).filter(w => w.length > 4);
            const isWritten = publishedTitles.some(title => {
              const matchCount = topicWords.filter(w => title.includes(w)).length;
              return matchCount >= Math.ceil(topicWords.length * 0.5);
            });
            if (isWritten) {
              await db.from("topic_queue").update({ status: "completed" }).eq("id", q.id);
            }
          }
        }
      }

      // Housekeeping: fix queue items stuck at in_progress.
      // Uses queue_id column (reliable) with _queueId in research_data as fallback.
      const { data: stuckQueue } = await db.from("topic_queue").select("id").eq("status", "in_progress");
      if (stuckQueue && stuckQueue.length > 0) {
        const stuckIds = (stuckQueue as Array<{ id: string }>).map(sq => sq.id);
        // Find pipeline logs that reference these queue IDs via the column
        const { data: logs } = await db
          .from("daily_article_log")
          .select("status, queue_id, research_data")
          .eq("source", "queue")
          .in("status", ["published", "failed"])
          .order("created_at", { ascending: false })
          .limit(50);
        if (logs) {
          for (const log of logs as Array<{ status: string; queue_id: string | null; research_data: Record<string, unknown> | null }>) {
            const qId = log.queue_id || (log.research_data?._queueId as string | undefined);
            if (qId && stuckIds.includes(qId)) {
              await db.from("topic_queue").update({
                status: log.status === "published" ? "completed" : "queued",
              }).eq("id", qId);
            }
          }
        }
        // Fallback: any queue item stuck in_progress for >30min with no matching log is likely orphaned
        await db.from("topic_queue")
          .update({ status: "queued" })
          .eq("status", "in_progress")
          .lt("updated_at", new Date(Date.now() - 30 * 60 * 1000).toISOString());
      }

      // Fetch recent activity (all statuses) + ensure published articles aren't lost
      const { data: recentLogs } = await db
        .from("daily_article_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);

      // Also fetch recent published articles separately (may be outside the 30 window)
      const { data: publishedLogs } = await db
        .from("daily_article_log")
        .select("*")
        .eq("status", "published")
        .order("completed_at", { ascending: false })
        .limit(15);

      // Merge: recent activity + published (deduplicated by id)
      const seenIds = new Set<string>();
      const data: typeof recentLogs = [];
      for (const log of [...(recentLogs || []), ...(publishedLogs || [])]) {
        if (!seenIds.has(log.id)) {
          seenIds.add(log.id);
          data.push(log);
        }
      }

      const { count: articleCount } = await db
        .from("articles")
        .select("*", { count: "exact", head: true });

      const { data: queue } = await db
        .from("topic_queue")
        .select("*")
        .in("status", ["queued", "assigned", "in_progress"])
        .order("expedite", { ascending: false })
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true });

      // Calculate total spend across all logs
      const { data: costData } = await db
        .from("daily_article_log")
        .select("cost_usd");
      const totalCost = (costData || []).reduce((sum: number, row: { cost_usd: number | string | null }) =>
        sum + (parseFloat(String(row.cost_usd ?? "0")) || 0), 0);

      return json({ logs: data || [], articleCount, queue: queue || [], totalCost: Math.round(totalCost * 100) / 100 });
    }

    // ------ READER QUESTIONS — mine user chat data for article ideas ------
    if (action === "reader-questions") {
      // Query user questions from alumi Health AI assistant (same Supabase project)
      // Find questions asked by 2+ different users
      const { data: userQuestions } = await db
        .from("chat_messages")
        .select("content, session_id, created_at")
        .eq("role", "user")
        .gte("created_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()) // last 90 days
        .order("created_at", { ascending: false })
        .limit(500);

      if (!userQuestions || userQuestions.length === 0) {
        return json({ questions: [], message: "No user questions found in the last 90 days." });
      }

      // Get session → user mapping to count unique users
      const sessionIds = [...new Set(userQuestions.map((q: { session_id: string }) => q.session_id))];
      const { data: sessions } = await db
        .from("chat_sessions")
        .select("id, user_id")
        .in("id", sessionIds.slice(0, 200));

      const sessionToUser: Record<string, string> = {};
      for (const s of (sessions || []) as Array<{ id: string; user_id: string }>) {
        sessionToUser[s.id] = s.user_id;
      }

      // Group similar questions by keyword extraction
      const STOP = new Set(["what", "how", "does", "can", "the", "is", "are", "do", "my", "i", "me", "a", "an", "it", "this", "that", "have", "has", "was", "were", "will", "would", "could", "should", "about", "with", "from", "for", "and", "or", "but", "not", "any", "your", "you", "why", "when", "which", "there", "been", "just", "more", "some", "than", "also", "very", "much", "into", "each", "other"]);

      function extractKeywords(text: string): string[] {
        return text.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/)
          .filter(w => w.length > 3 && !STOP.has(w));
      }

      // Build question clusters
      interface QuestionCluster {
        representative: string;
        keywords: Set<string>;
        userIds: Set<string>;
        count: number;
        examples: string[];
      }

      const clusters: QuestionCluster[] = [];

      for (const q of userQuestions as Array<{ content: string; session_id: string }>) {
        const text = q.content.trim();
        if (text.length < 15 || text.length > 500) continue; // skip too short/long
        const kw = extractKeywords(text);
        if (kw.length < 2) continue;
        const userId = sessionToUser[q.session_id] || q.session_id;

        // Find matching cluster (40%+ keyword overlap)
        let matched = false;
        for (const cluster of clusters) {
          const overlap = kw.filter(w => cluster.keywords.has(w)).length;
          const pct = overlap / Math.min(kw.length, cluster.keywords.size);
          if (pct >= 0.4 && overlap >= 2) {
            cluster.userIds.add(userId);
            cluster.count++;
            if (cluster.examples.length < 3) cluster.examples.push(text.slice(0, 150));
            for (const w of kw) cluster.keywords.add(w);
            matched = true;
            break;
          }
        }

        if (!matched) {
          clusters.push({
            representative: text.slice(0, 200),
            keywords: new Set(kw),
            userIds: new Set([userId]),
            count: 1,
            examples: [text.slice(0, 150)],
          });
        }
      }

      // Filter: 2+ unique users asked similar questions
      const popular = clusters
        .filter(c => c.userIds.size >= 2)
        .sort((a, b) => b.userIds.size - a.userIds.size)
        .slice(0, 20)
        .map(c => ({
          topic: c.representative,
          uniqueUsers: c.userIds.size,
          totalAsks: c.count,
          examples: c.examples,
          keywords: [...c.keywords].slice(0, 10),
        }));

      return json({
        questions: popular,
        totalAnalyzed: userQuestions.length,
        clustersFound: clusters.length,
        popularCount: popular.length,
        message: `Found ${popular.length} questions asked by 2+ users (from ${userQuestions.length} messages, ${clusters.length} unique topics).`,
      });
    }

    // ------ TOPIC QUEUE ACTIONS ------
    if (action === "queue-topic") {
      const topic = body.topic as string | undefined;
      if (!topic) return json({ error: "topic is required" }, 400);
      const { data: queueEntry, error: qErr } = await db
        .from("topic_queue")
        .insert({ topic, category: (body.category as string) || null, priority: (body.priority as number) || 50, expedite: body.expedite || false, notes: (body.notes as string) || null })
        .select("id")
        .single();
      if (qErr) return json({ error: "Failed to queue topic", detail: qErr.message }, 500);
      return json({ success: true, queueId: queueEntry.id, message: `Topic queued: "${topic}"` });
    }

    if (action === "list-queue") {
      const { data: queue } = await db
        .from("topic_queue")
        .select("*")
        .order("priority", { ascending: false })
        .order("created_at", { ascending: true });
      return json({ queue: queue || [] });
    }

    if (action === "update-queue") {
      const queueId = body.queueId as string | undefined;
      if (!queueId) return json({ error: "queueId is required" }, 400);
      const updates: Record<string, unknown> = {};
      if (body.topic) updates.topic = body.topic;
      if (body.category) updates.category = body.category;
      if (body.priority != null) updates.priority = body.priority;
      if (body.status) updates.status = body.status;
      const { error: uErr } = await db.from("topic_queue").update(updates).eq("id", queueId);
      if (uErr) return json({ error: "Failed to update queue", detail: uErr.message }, 500);
      return json({ success: true, queueId });
    }

    if (action === "delete-queue") {
      const queueId = body.queueId as string | undefined;
      if (!queueId) return json({ error: "queueId is required" }, 400);
      await db.from("topic_queue").delete().eq("id", queueId);
      return json({ success: true, queueId });
    }

    // ------ BACKFILL COSTS — estimate costs for pre-tracking articles ------
    if (action === "backfill-costs") {
      // Estimated token counts per stage (based on pipeline prompts + typical responses)
      // Format: [inputTokens, outputTokens, model]
      const STAGE_ESTIMATES: Record<string, [number, number, string]> = {
        "scout-gemini":    [1200, 3000, MODELS.SCOUT_GEMINI],
        "scout-structure": [5000, 2500, MODELS.EDITOR_PRIMARY],
        "editor-brief":    [6000, 1800, MODELS.EDITOR_PRIMARY],
        "write":           [8000, 6500, MODELS.EDITOR_PRIMARY],
        "independence":    [5500, 1200, MODELS.INDEPENDENCE],
        "qc":              [4500, 1000, MODELS.QC_PRIMARY],
      };

      // Which stages completed based on final status
      const STAGES_BY_STATUS: Record<string, string[]> = {
        "published":          ["scout-gemini", "scout-structure", "editor-brief", "write", "independence", "qc"],
        "publishing":         ["scout-gemini", "scout-structure", "editor-brief", "write", "independence", "qc"],
        "editor_qc":          ["scout-gemini", "scout-structure", "editor-brief", "write", "independence"],
        "independence_done":  ["scout-gemini", "scout-structure", "editor-brief", "write", "independence"],
        "independence_review":["scout-gemini", "scout-structure", "editor-brief", "write"],
        "written":            ["scout-gemini", "scout-structure", "editor-brief", "write"],
        "writing":            ["scout-gemini", "scout-structure", "editor-brief"],
        "editor_approved":    ["scout-gemini", "scout-structure", "editor-brief"],
        "editor_reviewing":   ["scout-gemini", "scout-structure"],
        "research_done":      ["scout-gemini", "scout-structure"],
        "searching":          ["scout-gemini"],
        "started":            [],
      };

      // For failed articles, estimate based on the error message to guess last completed stage
      function guessStagesForFailed(error: string | null, researchData: Record<string, unknown> | null): string[] {
        if (!researchData && !error) return ["scout-gemini"];
        if (researchData?._independenceReview) return ["scout-gemini", "scout-structure", "editor-brief", "write", "independence"];
        if (researchData?._article) return ["scout-gemini", "scout-structure", "editor-brief", "write"];
        if (researchData?._editorBrief) return ["scout-gemini", "scout-structure", "editor-brief"];
        if (researchData?.candidates || researchData?.topic) return ["scout-gemini", "scout-structure"];
        // API limit errors = at least one call was attempted
        if (error?.includes("Claude API") || error?.includes("SPENDING_LIMIT")) return ["scout-gemini"];
        return [];
      }

      const { data: allLogs } = await db
        .from("daily_article_log")
        .select("id, status, error, research_data, cost_usd, source")
        .or("cost_usd.is.null,cost_usd.eq.0");

      if (!allLogs || allLogs.length === 0) {
        return json({ message: "No logs need backfilling", updated: 0 });
      }

      let updated = 0;
      let totalEstimated = 0;

      for (const log of allLogs as Array<{ id: string; status: string; error: string | null; research_data: Record<string, unknown> | null; cost_usd: number | null; source: string | null }>) {
        let stages: string[];
        if (log.status === "failed") {
          stages = guessStagesForFailed(log.error, log.research_data);
        } else {
          stages = STAGES_BY_STATUS[log.status] || [];
        }

        // Queue-sourced articles skip gemini (directed research uses claude with web search instead)
        const fromQueue = log.source === "queue" || log.research_data?._fromQueue;
        if (fromQueue) {
          stages = stages.filter(s => s !== "scout-gemini").map(s =>
            s === "scout-structure" ? "editor-brief" : s // queue uses one claude call for research, roughly editor-brief cost
          );
          // Add the directed research call (claude with web search, ~= write cost)
          if (stages.length > 0) stages = ["write", ...stages.slice(1)];
        }

        let cost = 0;
        const usageEntries: ApiUsage[] = [];
        for (const stage of stages) {
          const est = STAGE_ESTIMATES[stage];
          if (!est) continue;
          const [input, output, m] = est;
          const stageCost = calcCost(m, input, output);
          cost += stageCost;
          usageEntries.push({ model: m, stage, inputTokens: input, outputTokens: output, costUsd: Math.round(stageCost * 10000) / 10000 });
        }

        if (cost > 0) {
          await db.from("daily_article_log").update({
            cost_usd: Math.round(cost * 10000) / 10000,
            token_usage: usageEntries,
          }).eq("id", log.id);
          updated++;
          totalEstimated += cost;
        }
      }

      return json({
        message: `Backfilled cost estimates for ${updated} log entries`,
        updated,
        totalEstimated: Math.round(totalEstimated * 100) / 100,
        note: "These are estimates based on typical token counts per stage. Actual costs may vary ±20%.",
      });
    }

    // ------ BACKFILL CITATIONS — re-verify all published articles ------
    if (action === "backfill-citations") {
      const { data: logs } = await db
        .from("daily_article_log")
        .select("id, topic, research_data")
        .eq("status", "published")
        .not("research_data", "is", null);

      if (!logs || logs.length === 0) {
        return json({ message: "No published articles with research data", updated: 0 });
      }

      let updated = 0;
      let totalVerified = 0;
      let totalFailed = 0;
      let totalSkipped = 0;
      const errors: string[] = [];

      for (const log of logs as Array<{ id: string; topic: string; research_data: Record<string, unknown> }>) {
        const rd = log.research_data;
        const studies = (rd.studies as Array<{ title?: string; journal?: string; year?: string; doi?: string }>) || [];
        if (studies.length === 0) continue;

        try {
          const result = await verifyPubMedCitations(studies);
          totalVerified += result.verified;
          totalFailed += result.failed;
          totalSkipped += result.skipped;

          await db.from("daily_article_log").update({
            research_data: { ...rd, _pubmedVerification: result },
          }).eq("id", log.id);
          updated++;
          console.log(`[backfill-citations] ${log.topic?.slice(0, 40)}: ${result.verified}/${result.total} verified`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "unknown";
          errors.push(`${log.id}: ${msg}`);
          console.log(`[backfill-citations] Error for ${log.id}: ${msg}`);
        }

        // Rate limit: 1 article per 3 seconds (each article makes ~5-15 API calls)
        await new Promise(r => setTimeout(r, 3000));
      }

      return json({
        message: `Re-verified citations for ${updated} published articles`,
        updated,
        totalVerified,
        totalFailed,
        totalSkipped,
        errors: errors.length > 0 ? errors : undefined,
      });
    }

    // ------ KILL — admin force-kills a pipeline entry ------
    if (action === "kill-article") {
      const logId = body.logId as string | undefined;
      if (!logId) return json({ error: "logId is required" }, 400);
      await db.from("daily_article_log").update({
        status: "failed",
        error: "Admin killed: " + ((body.reason as string) || "Manually stopped by admin"),
        completed_at: new Date().toISOString(),
      }).eq("id", logId);
      // Also archive the article if it exists
      const { data: logEntry } = await db.from("daily_article_log").select("slug").eq("id", logId).maybeSingle();
      if (logEntry?.slug) {
        await db.from("articles").update({ status: "archived", draft: true }).eq("slug", logEntry.slug);
      }
      return json({ success: true, message: "Article killed" });
    }

    // ------ RETRY — resume a failed run from its last good checkpoint ------
    if (action === "retry") {
      const logId = body.logId as string | undefined;
      if (!logId) return json({ error: "logId is required for retry action" }, 400);

      const { data: logEntry, error: logError } = await db
        .from("daily_article_log")
        .select("*")
        .eq("id", logId)
        .maybeSingle();

      if (logError || !logEntry) {
        return json({ error: "Log entry not found", detail: logError?.message }, 404);
      }

      const research = (logEntry.research_data as Record<string, unknown>) || {};
      let resumeStatus: string;

      if (research._independenceReview && research._article) {
        // Independence review done — resume at QC + Publish
        resumeStatus = "independence_done";
      } else if (research._article) {
        // Article was written — resume at Independence Review
        resumeStatus = "written";
      } else if (research._editorBrief) {
        // Editor brief exists — resume at Write
        resumeStatus = "editor_approved";
      } else if (research.topic || research.keyFindings || research.candidates) {
        // Research data exists — resume at Editor Brief
        resumeStatus = "research_done";
      } else {
        // Nothing salvageable — restart from scratch
        resumeStatus = "started";
      }

      await db
        .from("daily_article_log")
        .update({
          status: resumeStatus,
          error: null,
          stage_started_at: new Date().toISOString(),
        })
        .eq("id", logId);

      return json({
        success: true,
        logId,
        previousStatus: logEntry.status,
        resumeStatus,
        message: `Reset to "${resumeStatus}" — next invocation will resume from this checkpoint.`,
      });
    }

    // ------ CRON LOGS — query pg_cron execution history ------
    if (action === "cron-logs") {
      const { data: cronLogs, error: cronErr } = await db.rpc("get_cron_logs");
      if (cronErr) {
        // Fallback: query directly
        const { data: jobs } = await db.from("cron.job_run_details" as string).select("jobname, status, return_message, start_time").order("start_time", { ascending: false }).limit(10);
        return json({ logs: jobs || [], error: cronErr?.message });
      }
      return json({ logs: cronLogs });
    }

    // ------ SUBMIT-ARTICLE — user wrote article with Opus, resume pipeline from "written" ------
    if (action === "submit-article") {
      const logId = body.logId as string;
      let articleHtml = body.articleHtml as string;
      const writerTitle = (body.title as string)?.trim() || null;
      const writerDescription = (body.description as string)?.trim() || null;
      if (!logId || !articleHtml) {
        return json({ error: "logId and articleHtml are required" }, 400);
      }

      // Safety net: if Opus returned a full HTML page, extract just the article body
      if (articleHtml.includes("<!DOCTYPE") || articleHtml.includes("<html")) {
        console.log("[Admin] submit-article: stripping full HTML page wrapper — extracting body sections");
        const sectionStart = articleHtml.indexOf("<section");
        if (sectionStart > 0) {
          // Find the last </section> or </div> that's part of the article (before </body>)
          const bodyEnd = articleHtml.indexOf("</body>");
          const contentEnd = bodyEnd > 0 ? bodyEnd : articleHtml.length;
          let extracted = articleHtml.slice(sectionStart, contentEnd).trim();
          // Strip any trailing wrapper divs
          extracted = extracted.replace(/\s*<\/div>\s*(<\/div>\s*)*$/g, "").trim();
          if (extracted.length > 500) {
            articleHtml = extracted;
          }
        }
      }

      // Fetch the log entry to get editorial brief data
      const { data: logEntry } = await db
        .from("daily_article_log")
        .select("slug, title, research_data, status")
        .eq("id", logId)
        .maybeSingle();

      if (!logEntry) return json({ error: "Log entry not found" }, 404);
      if (logEntry.status !== "editor_approved") {
        return json({ error: `Article is in status "${logEntry.status}", expected "editor_approved"` }, 400);
      }

      const researchData = (logEntry.research_data as Record<string, unknown>) || {};
      const editorBrief = (researchData._editorBrief as Record<string, unknown>) || {};
      const slug = logEntry.slug || (editorBrief.slug as string);
      // Writer's title wins over editor's headline — the writer knows the piece best
      const title = writerTitle || logEntry.title || (editorBrief.headline as string);

      if (!slug) return json({ error: "No slug found in log entry" }, 400);

      // Parse TOC from the HTML (extract h2 sections)
      const tocMatches = [...articleHtml.matchAll(/<section[^>]*id="([^"]+)"[^>]*>[\s\S]*?<h2[^>]*>([^<]+)<\/h2>/gi)];
      const toc = tocMatches.map(m => ({ id: m[1], title: m[2].trim() }));

      // Estimate read time from word count
      const plainText = articleHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const wordCount = plainText.split(/\s+/).length;
      const readTime = Math.ceil(wordCount / 220);

      // Build article metadata from editor brief
      const category = (editorBrief.categoryOverride as string) || (researchData.category as string) || "Clinical Evidence";
      const gradient = getCategoryGradient(category);
      const metadata = {
        title,
        slug,
        description: writerDescription || (editorBrief.description as string) || "",
        category,
        tags: (researchData.tags as string[]) || [],
        keywords: (researchData.keywords as string[]) || [],
        gradient,
      };

      // Save article to articles table as draft
      const { error: upsertErr } = await db.from("articles").upsert({
        slug,
        title: metadata.title,
        description: metadata.description,
        category: metadata.category,
        tags: metadata.tags,
        keywords: metadata.keywords,
        gradient_from: gradient.from,
        gradient_to: gradient.to,
        featured: false,
        draft: true,
        coming_soon: false,
        read_time: readTime,
        publish_date: new Date().toISOString().split("T")[0],
        article_html: articleHtml,
        toc,
        source_text: `[Human + Opus — ${new Date().toISOString().split("T")[0]}]`,
        status: "draft",
      }, { onConflict: "slug" });

      if (upsertErr) return json({ error: `Failed to save article: ${upsertErr.message}` }, 500);

      // Update pipeline log: set status to "written" with the article data
      // This resumes the pipeline — next cron tick will dispatch independence review
      const { error: logErr } = await db.from("daily_article_log").update({
        slug,
        title: metadata.title,
        status: "written",
        model_used: "human-opus",
        stage_started_at: new Date().toISOString(),
        research_data: {
          ...researchData,
          _article: {
            metadata,
            html: articleHtml,
            toc,
            readTime,
          },
          _writtenBy: "human-opus",
        },
      }).eq("id", logId);

      if (logErr) return json({ error: `Failed to update log: ${logErr.message}` }, 500);

      // Log $0 cost for human write stage (makes token_usage timeline complete)
      await db.from("daily_article_log").update({
        cost_usd: (await db.from("daily_article_log").select("cost_usd").eq("id", logId).maybeSingle()).data?.cost_usd || 0,
        token_usage: [
          ...((await db.from("daily_article_log").select("token_usage").eq("id", logId).maybeSingle()).data?.token_usage as Array<unknown> || []),
          { model: "human-opus", stage: "write", inputTokens: 0, outputTokens: 0, costUsd: 0 },
        ],
      }).eq("id", logId);

      // Chain-dispatch: fire independence review immediately (no cron wait)
      await dispatchStage("stage-independence", logId);
      console.log(`[Admin] Article submitted for "${slug}" — dispatched stage-independence directly`);
      return json({ success: true, slug, status: "written", message: "Article saved. Independence review dispatched immediately." });
    }

    // ------ SUBMIT-NEW-ARTICLE — create pipeline log + feed into independence review ------
    // Used by /admin/new ArticleEditor when generating articles outside the pipeline.
    // Creates a fresh pipeline log entry and dispatches to independence review.
    if (action === "submit-new-article") {
      const articleHtml = body.articleHtml as string;
      const title = (body.title as string)?.trim();
      const slug = (body.slug as string)?.trim();
      const description = (body.description as string)?.trim() || "";
      const category = (body.category as string)?.trim() || "Clinical Evidence";
      const tags = (body.tags as string[]) || [];
      const keywords = (body.keywords as string[]) || [];

      if (!articleHtml || !title || !slug) {
        return json({ error: "articleHtml, title, and slug are required" }, 400);
      }

      // Parse TOC from the HTML
      const tocMatches = [...articleHtml.matchAll(/<section[^>]*id="([^"]+)"[^>]*>[\s\S]*?<h2[^>]*>([^<]+)<\/h2>/gi)];
      const toc = tocMatches.map(m => ({ id: m[1], title: m[2].trim() }));

      const plainText = articleHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const wordCount = plainText.split(/\s+/).length;
      const readTime = Math.ceil(wordCount / 220);

      const gradient = getCategoryGradient(category);
      const metadata = { title, slug, description, category, tags, keywords, gradient };

      // 1. Create pipeline log entry in "written" status
      const { data: logEntry, error: logInsertErr } = await db.from("daily_article_log").insert({
        topic: title,
        slug,
        title,
        status: "written",
        model_used: "admin-editor",
        source: "admin-editor",
        stage_started_at: new Date().toISOString(),
        research_data: {
          topic: title,
          category,
          tags,
          keywords,
          _article: { metadata, html: articleHtml, toc, readTime },
          _writtenBy: "admin-editor",
        },
        token_usage: [
          { model: "admin-editor", stage: "write", inputTokens: 0, outputTokens: 0, costUsd: 0 },
        ],
        cost_usd: 0,
      }).select("id").single();

      if (logInsertErr || !logEntry) {
        return json({ error: `Failed to create pipeline log: ${logInsertErr?.message}` }, 500);
      }

      const logId = logEntry.id;

      // 2. Upsert article to articles table as draft (link to pipeline log)
      const { error: upsertErr } = await db.from("articles").upsert({
        slug,
        title,
        description,
        category,
        tags,
        keywords,
        gradient_from: gradient.from,
        gradient_to: gradient.to,
        featured: false,
        draft: true,
        coming_soon: false,
        read_time: readTime,
        publish_date: new Date().toISOString().split("T")[0],
        article_html: articleHtml,
        toc,
        source_text: `[Admin Editor — ${new Date().toISOString().split("T")[0]}]`,
        status: "draft",
        pipeline_log_id: logId,
      }, { onConflict: "slug" });

      if (upsertErr) return json({ error: `Failed to save article: ${upsertErr.message}` }, 500);

      // 3. Chain-dispatch independence review immediately
      await dispatchStage("stage-independence", logId);
      console.log(`[Admin] New article "${slug}" submitted via editor — dispatched stage-independence`);
      return json({ success: true, slug, logId, status: "written", message: "Article entered pipeline. Independence review dispatched." });
    }

    // ------ PARSE-PDF — extract text from a base64-encoded PDF ------
    if (action === "parse-pdf") {
      const pdfBase64 = body.pdfBase64 as string;
      if (!pdfBase64) return json({ error: "pdfBase64 is required" }, 400);
      try {
        const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
        // Use pdf.js via CDN in Deno
        const pdfjsLib = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.9.155/build/pdf.min.mjs");
        const pdf = await pdfjsLib.getDocument({ data: pdfBytes, useSystemFonts: true }).promise;
        const pages: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          pages.push(content.items.map((item: Record<string, unknown>) => (item.str as string) || '').join(' '));
        }
        return json({ text: pages.join('\n\n') });
      } catch (err: unknown) {
        return json({ error: `PDF parse failed: ${err instanceof Error ? err.message : 'unknown'}` }, 500);
      }
    }

    // ------ FETCH-URL — fetch a web page and return text content ------
    if (action === "fetch-url") {
      const url = (body.url as string)?.trim();
      if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
        return json({ error: "Valid URL required" }, 400);
      }
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; alumi-news-admin/1.0)" },
          redirect: "follow",
        });
        if (!res.ok) return json({ error: `Fetch failed: HTTP ${res.status}` }, 502);
        const html = await res.text();
        // Strip scripts, styles, nav, footer, header — keep article body text
        const cleaned = html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<nav[\s\S]*?<\/nav>/gi, '')
          .replace(/<footer[\s\S]*?<\/footer>/gi, '')
          .replace(/<header[\s\S]*?<\/header>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\s+/g, ' ')
          .trim();
        return json({ text: cleaned.slice(0, 100000) });
      } catch (err: unknown) {
        return json({ error: `Fetch failed: ${err instanceof Error ? err.message : 'unknown'}` }, 502);
      }
    }

    // ------ GET-BRIEF — fetch formatted editorial brief for Claude ------
    if (action === "get-brief") {
      const logId = body.logId as string;
      if (!logId) return json({ error: "logId is required" }, 400);

      const { data: logEntry } = await db
        .from("daily_article_log")
        .select("slug, title, research_data, status")
        .eq("id", logId)
        .maybeSingle();

      if (!logEntry) return json({ error: "Log entry not found" }, 404);

      const researchData = (logEntry.research_data as Record<string, unknown>) || {};
      const editorBrief = (researchData._editorBrief as Record<string, unknown>) || {};
      const brief = (editorBrief.brief as Record<string, unknown>) || {};

      // Format a clean brief that can be pasted directly into Claude Opus
      const claudePrompt = `You are writing for alumi news — "Evidence. Wherever it leads."

Write in the style of exceptional, effortless long-form journalism — The Atlantic, Vanity Fair, The New York Times Magazine, The Wall Street Journal — with tonal enrichments from oratory greats like Bill Maher, Christopher Hitchens, and Sam Harris. The writing should feel like the best magazine feature you've ever read: authoritative without being academic, personal without being confessional, sharp without being cruel.

## YOUR ASSIGNMENT
Working headline (improve if you can — max 10 words, one sentence, no two-part kickers): ${editorBrief.headline || logEntry.title}
Angle: ${editorBrief.angle || "Follow the research"}
${editorBrief.description ? `Description (improve if you can): ${editorBrief.description}` : ""}
${editorBrief.archetype ? `Form: ${editorBrief.archetype}` : ""}

### Editorial Direction
${brief.tone ? `Tone: ${brief.tone}` : ""}
${brief.openWith ? `Open with: ${brief.openWith}` : ""}
${((brief.emphasize as string[]) || []).length > 0 ? `Key points:\n${((brief.emphasize as string[]) || []).map((e: string) => `- ${e}`).join("\n")}` : ""}
${((brief.avoid as string[]) || []).length > 0 ? `Avoid:\n${((brief.avoid as string[]) || []).map((a: string) => `- ${a}`).join("\n")}` : ""}
${((brief.dogmaWarnings as string[]) || []).length > 0 ? `Dogma warnings:\n${((brief.dogmaWarnings as string[]) || []).map((w: string) => `- ${w}`).join("\n")}` : ""}
${brief.closingDirection ? `Closing: ${brief.closingDirection}` : ""}

## RESEARCH
Topic: ${researchData.topic || ""}

Key findings:
${((researchData.keyFindings as string[]) || []).map((f: string, i: number) => `${i + 1}. ${f}`).join("\n")}

Studies:
${((researchData.studies as Array<{ title: string; journal: string; year: string; finding: string }>) || []).map((s) => `- "${s.title}" (${s.journal}, ${s.year}): ${s.finding}`).join("\n")}

${researchData.mechanism ? `Mechanism: ${researchData.mechanism}` : ""}

${((researchData.counterArguments as string[]) || []).length > 0 ? `Counter-arguments:\n${((researchData.counterArguments as string[]) || []).map((c: string) => `- ${c}`).join("\n")}` : ""}

## PRINCIPLES
- Follow the money. Name who profits.
- Take positions. This is journalism, not Wikipedia.
- Zero fabrication. Only cite studies from the research above.
- When the evidence is clear, say so. When it's not, say that too.
- Section headings (h2): do NOT start most with "The". Max 1-2 can. Use questions, imperatives, provocations instead.

## HTML FORMAT
<section id="introduction" class="reveal">
  <p>Opening paragraph (no h2 — CSS drop cap applies automatically).</p>
</section>

<section id="section-slug" class="reveal">
  <h2>Section Title</h2>
  <p>Content...</p>
</section>

Pull quotes: <aside class="pull-quote reveal"><p>"Quote text."</p></aside>

End with a Sources section listing every study cited.
End with: <div class="mt-12 p-6 bg-stone-100 dark:bg-stone-800 rounded-xl border-l-4 border-primary-500 reveal"><p class="text-sm text-stone-600 dark:text-stone-400 leading-relaxed"><strong>Disclaimer:</strong> This article is for informational purposes only and does not constitute medical advice.</p></div>`;

      return json({
        success: true,
        logId,
        status: logEntry.status,
        headline: editorBrief.headline || logEntry.title,
        slug: editorBrief.slug || logEntry.slug,
        claudePrompt,
        editorBrief,
        researchData: {
          topic: researchData.topic,
          keyFindings: researchData.keyFindings,
          studies: researchData.studies,
          counterArguments: researchData.counterArguments,
          mechanism: researchData.mechanism,
        },
      });
    }

    // ------ PRODUCE-TOPIC — directly start research for a specific queue topic (bypasses daily cap) ------
    if (action === "produce-topic") {
      const queueId = body.queueId as string;
      if (!queueId) return json({ error: "queueId is required" }, 400);

      const { data: topic } = await db.from("topic_queue").select("id, topic, source").eq("id", queueId).maybeSingle();
      if (!topic) return json({ error: "Queue item not found" }, 404);

      // Mark queue item as in_progress
      await db.from("topic_queue").update({ status: "in_progress" }).eq("id", queueId);

      // Create log entry — queue_id stored as a proper column (not in research_data where it gets overwritten)
      const { data: logEntry } = await db.from("daily_article_log").insert({
        run_date: new Date().toISOString().split("T")[0],
        status: "started",
        topic: topic.topic,
        source: "queue",
        stage_started_at: new Date().toISOString(),
        queue_id: queueId,
        research_data: { _fromQueue: true, _queueSource: topic.source || "manual" },
      }).select("id").single();

      if (!logEntry) return json({ error: "Failed to create log entry" }, 500);

      // Dispatch research directly via pg_net (bypasses daily cap)
      await dispatchStage("stage-research", logEntry.id);

      console.log(`[Admin] Produce-topic: "${topic.topic}" — dispatched stage-research directly (bypasses cap)`);
      return json({
        success: true,
        logId: logEntry.id,
        topic: topic.topic,
        message: `Research dispatched for "${topic.topic}". Pipeline will process through editor brief then pause for your writing.`,
      });
    }

    // ------ PRODUCE — manual trigger → calls dispatch_pipeline_stage() via SQL ------
    if (action === "produce") {
      console.log("[Admin] Manual produce trigger — calling dispatch_pipeline_stage()");

      const { error: dispatchErr } = await db.rpc("dispatch_pipeline_stage");
      if (dispatchErr) {
        return json({ error: `dispatch_pipeline_stage failed: ${dispatchErr.message}` }, 500);
      }
      return json({ success: true, action: "produce", message: "dispatch_pipeline_stage() called — next stage dispatched via pg_net" });
    }

    // ------ SCOUT — manual trigger → calls pipeline-scout via HTTP ------
    if (action === "scout") {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const scoutModel = (body.scoutModel as string) || "gemini";

      const url = `${supabaseUrl}/functions/v1/pipeline-scout`;
      console.log(`[Admin] Manual scout trigger (${scoutModel}) — calling pipeline-scout`);

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ scoutModel }),
      });

      const result = await res.json();
      return json({ success: true, action: "scout", scoutModel, result });
    }

    // ------ PINGER-STATUS — recent signals for dashboard ------
    if (action === "pinger-status") {
      const { data: signals } = await db
        .from("pinger_signals")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      const { data: promoted } = await db
        .from("pinger_signals")
        .select("id")
        .eq("promoted_to_queue", true)
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      return json({
        signals: signals || [],
        promotedLast24h: promoted?.length || 0,
        totalSignals: signals?.length || 0,
      });
    }

    return json({ error: `Unknown action: "${action}"` }, 400);
  } catch (err: unknown) {
    return json({
      error: "An internal error occurred",
      detail: err instanceof Error ? err.message : "Unknown error",
    }, 500);
  }
});
