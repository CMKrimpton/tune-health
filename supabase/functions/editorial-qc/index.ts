import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { addOverheadCost, calcCost } from "../_shared/db.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── Types ────────────────────────────────────────────────────────

interface QCIssue {
  slug: string;
  field: "title" | "description" | "illustration" | "tags" | "metadata";
  severity: "high" | "medium" | "low";
  type: string;
  current: string;
  suggested: string;
  reason: string;
}

interface QCReport {
  issues: QCIssue[];
  summary: {
    total_issues: number;
    high: number;
    medium: number;
    low: number;
    patterns: string[];
    overall_grade: string;
    editorial_notes: string;
  };
}

interface FixResult {
  slug: string;
  field: string;
  status: "applied" | "skipped" | "error";
  old_value?: string;
  new_value?: string;
  error?: string;
}

// ─── Claude Prompt ────────────────────────────────────────────────

const QC_SYSTEM_PROMPT = `You are the editor-in-chief of "alumi news", a premium health and wellness editorial publication. You are conducting a holistic editorial review of the ENTIRE article collection — not individual articles in isolation, but how they work TOGETHER as a magazine lineup.

Your editorial standards:
- Voice: Evidence over allegiance. Aggressively neutral. Smart friend who reads the studies.
- Style: 60% exceptional journalism, 20% Bill Maher, 15% Christopher Hitchens, 15% Sam Harris.
- Headlines must be compelling, varied, and differentiated when seen side-by-side.

## What You're Evaluating

### Headlines (title field)
- **Structural variety**: Too many titles following the same pattern is deadly. "The X of Y", "The X That Y", "Your X Is Y" — if more than 3-4 share a structure, flag them.
- **Reader magnetism**: Would someone stop scrolling for this? Does it create curiosity, tension, or provocation?
- **Differentiation**: When shown as a list, can a reader distinguish each article? Or do they blur together?
- **Length enforcement**: Target 5-8 words, hard cap 10. Flag ANY title over 10 words as an automatic fix. Most titles should land at 5-8 words — if the collection skews 9-10, that's a problem even if no individual title breaks the cap.
- **Accuracy**: Does the title honestly represent the content without clickbait?

### Section Headings (h2) — spot-check across articles
- Headings should state findings, name failures, or imply consequences — not label topics
- **4–8 words per heading. Flag any heading over 8 words — it needs editing**
- Flag colon constructions ("X: the honest version"), list headings ("Salt, fluids, time"), meta-commentary ("One distinction that actually matters")
- Headings within an article should trace its argument in sequence, not list its subjects
- If multiple articles share the same heading patterns (all questions, all "The X that Y"), flag the pattern

### Descriptions (description field)
- Should SELL the article, not just summarize it.
- Must complement the title, not repeat it.
- Should create a "need to read" feeling.
- Each must be distinct — no two descriptions should feel interchangeable.

### Illustration Status
- Flag any article with no heroImage (missing illustration).
- Flag any heroImage URL that looks broken or is an Unsplash stock photo URL.

### Metadata Quality
- Tags: Are they consistent? Useful for navigation?
- Category: Properly assigned?
- Featured: Are the right articles featured?

## Output Format

Return ONLY valid JSON matching this exact structure:

{
  "issues": [
    {
      "slug": "article-slug",
      "field": "title",
      "severity": "high",
      "type": "variety",
      "current": "The current title",
      "suggested": "A better title",
      "reason": "Why this change improves the collection"
    }
  ],
  "summary": {
    "total_issues": 12,
    "high": 4,
    "medium": 5,
    "low": 3,
    "patterns": ["22/39 titles start with 'The' — needs dramatic reduction", "..."],
    "overall_grade": "B-",
    "editorial_notes": "One paragraph of holistic editorial feedback about the collection."
  }
}

## Rules
- Only flag real problems. Don't nitpick articles that are genuinely good.
- For title suggestions: maintain the editorial voice. Provocative, smart, evidence-based.
- Severity guide: high = actively hurts the publication, medium = noticeable quality gap, low = minor polish.
- Focus on the WORST offenders first. Not every article needs changes.
- Suggest concrete, specific replacements — not vague feedback.
- Title rewrites should preserve the article's actual content/topic. Don't change what the article is about.
- Keep suggestions within the brand voice: direct, slightly irreverent, evidence-based.
- If a title is genuinely great, don't change it just for variety — note it as a strength.`;

// ─── Helpers ──────────────────────────────────────────────────────

function supabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Main Handler ─────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "audit") {
      return await handleAudit();
    }

    if (action === "fix") {
      return await handleFix(body);
    }

    if (action === "audit-and-fix") {
      return await handleAuditAndFix(body);
    }

    return json(
      {
        error: "Invalid action. Use 'audit', 'fix', or 'audit-and-fix'.",
        usage: {
          audit: "Run editorial QC audit on all articles. Returns report.",
          fix: "Apply fixes from a report. Pass { report } or it runs audit first. Options: { min_severity: 'high'|'medium'|'low', dry_run: true }",
          "audit-and-fix":
            "Combined: audit then auto-fix. Options: { min_severity, dry_run }",
        },
      },
      400
    );
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

// ─── AUDIT: Claude reviews the full collection ────────────────────

async function runAudit(): Promise<QCReport> {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const db = supabase();
  const { data: articles, error } = await db
    .from("articles")
    .select(
      "slug, title, description, category, tags, keywords, featured, hero_image, read_time, publish_date, status"
    )
    .order("publish_date", { ascending: false });

  if (error) throw error;
  if (!articles || articles.length === 0)
    throw new Error("No articles found in database");

  // Build the article lineup for Claude to review
  const lineup = articles.map((a, i) => ({
    "#": i + 1,
    slug: a.slug,
    title: a.title,
    description: a.description,
    category: a.category,
    tags: a.tags,
    featured: a.featured,
    has_illustration: !!a.hero_image,
    hero_image_url: a.hero_image || null,
    read_time: a.read_time,
    status: a.status,
  }));

  const userPrompt = `Review this complete article lineup for alumi news (${articles.length} articles). Analyze them HOLISTICALLY — how they work as a collection, not in isolation.

FULL ARTICLE LINEUP:
${JSON.stringify(lineup, null, 2)}

Conduct your editorial review and return ONLY the JSON report. No markdown, no explanation — just the JSON object.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      temperature: 0.3,
      system: QC_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text;
  if (!content) throw new Error("No content returned from Claude");

  // Log cost
  const apiUsage = data.usage;
  if (apiUsage) {
    const model = "claude-sonnet-4-20250514";
    const costUsd = calcCost(model, apiUsage.input_tokens || 0, apiUsage.output_tokens || 0);
    await addOverheadCost(db, {
      model, stage: "editorial-qc",
      inputTokens: apiUsage.input_tokens || 0,
      outputTokens: apiUsage.output_tokens || 0,
      costUsd,
    });
  }

  // Parse JSON
  const jsonStr = content
    .replace(/^```json?\n?/, "")
    .replace(/\n?```$/, "")
    .trim();
  const report: QCReport = JSON.parse(jsonStr);

  return report;
}

async function handleAudit(): Promise<Response> {
  const report = await runAudit();
  return json({
    success: true,
    report,
    message: `Editorial QC complete: ${report.summary.total_issues} issues found (${report.summary.high} high, ${report.summary.medium} medium, ${report.summary.low} low). Grade: ${report.summary.overall_grade}`,
  });
}

// ─── FIX: Apply changes from a QC report ──────────────────────────

async function applyFixes(
  report: QCReport,
  minSeverity: string = "high",
  dryRun: boolean = false
): Promise<FixResult[]> {
  const db = supabase();
  const results: FixResult[] = [];

  const severityOrder = { high: 3, medium: 2, low: 1 };
  const minLevel =
    severityOrder[minSeverity as keyof typeof severityOrder] || 3;

  // Filter issues by severity threshold
  const issuesToFix = report.issues.filter(
    (issue) =>
      severityOrder[issue.severity as keyof typeof severityOrder] >= minLevel
  );

  for (const issue of issuesToFix) {
    if (issue.field === "illustration" && !issue.suggested) {
      // Missing illustration — trigger generation
      if (dryRun) {
        results.push({
          slug: issue.slug,
          field: "illustration",
          status: "skipped",
          old_value: issue.current,
          new_value: "[would generate illustration]",
        });
        continue;
      }

      try {
        const edgeFnUrl = Deno.env.get("SUPABASE_URL")!;
        const res = await fetch(
          `${edgeFnUrl}/functions/v1/generate-illustration`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "generate",
              slug: issue.slug,
            }),
          }
        );

        if (res.ok) {
          const data = await res.json();
          results.push({
            slug: issue.slug,
            field: "illustration",
            status: "applied",
            old_value: issue.current,
            new_value: data.imageUrl,
          });
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      } catch (err) {
        results.push({
          slug: issue.slug,
          field: "illustration",
          status: "error",
          error: (err as Error).message,
        });
      }
      continue;
    }

    // Title or description update
    if (issue.field === "title" || issue.field === "description") {
      if (!issue.suggested || issue.suggested === issue.current) {
        results.push({
          slug: issue.slug,
          field: issue.field,
          status: "skipped",
          old_value: issue.current,
          new_value: issue.suggested,
        });
        continue;
      }

      if (dryRun) {
        results.push({
          slug: issue.slug,
          field: issue.field,
          status: "skipped",
          old_value: issue.current,
          new_value: issue.suggested,
        });
        continue;
      }

      try {
        const updateData: Record<string, string> = {};
        updateData[issue.field] = issue.suggested;

        const { error } = await db
          .from("articles")
          .update(updateData)
          .eq("slug", issue.slug);

        if (error) throw error;

        results.push({
          slug: issue.slug,
          field: issue.field,
          status: "applied",
          old_value: issue.current,
          new_value: issue.suggested,
        });
      } catch (err) {
        results.push({
          slug: issue.slug,
          field: issue.field,
          status: "error",
          old_value: issue.current,
          new_value: issue.suggested,
          error: (err as Error).message,
        });
      }
    }

    // Tags or metadata update
    if (issue.field === "tags" || issue.field === "metadata") {
      // Log but don't auto-fix metadata — these need human review
      results.push({
        slug: issue.slug,
        field: issue.field,
        status: "skipped",
        old_value: issue.current,
        new_value: issue.suggested,
      });
    }
  }

  return results;
}

async function handleFix(body: Record<string, unknown>): Promise<Response> {
  const minSeverity = (body.min_severity as string) || "high";
  const dryRun = body.dry_run === true;

  // If report provided, use it; otherwise run audit first
  let report: QCReport;
  if (body.report) {
    report = body.report as QCReport;
  } else {
    report = await runAudit();
  }

  const results = await applyFixes(report, minSeverity, dryRun);
  const applied = results.filter((r) => r.status === "applied").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errored = results.filter((r) => r.status === "error").length;

  return json({
    success: true,
    dry_run: dryRun,
    min_severity: minSeverity,
    message: dryRun
      ? `Dry run complete: ${results.length} changes would be made (${applied} applicable, ${skipped} skipped, ${errored} errors)`
      : `Fixes applied: ${applied} changes made, ${skipped} skipped, ${errored} errors`,
    applied,
    skipped,
    errored,
    results,
    report,
  });
}

// ─── AUDIT AND FIX: Combined flow ─────────────────────────────────

async function handleAuditAndFix(
  body: Record<string, unknown>
): Promise<Response> {
  const minSeverity = (body.min_severity as string) || "high";
  const dryRun = body.dry_run === true;

  // Step 1: Audit
  const report = await runAudit();

  // Step 2: Apply fixes
  const results = await applyFixes(report, minSeverity, dryRun);
  const applied = results.filter((r) => r.status === "applied").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errored = results.filter((r) => r.status === "error").length;

  return json({
    success: true,
    dry_run: dryRun,
    min_severity: minSeverity,
    message: `QC ${dryRun ? "(dry run)" : ""}: ${report.summary.total_issues} issues found, ${applied} fixes applied. Grade: ${report.summary.overall_grade}`,
    grade: report.summary.overall_grade,
    editorial_notes: report.summary.editorial_notes,
    patterns: report.summary.patterns,
    applied,
    skipped,
    errored,
    fix_results: results,
    full_report: report,
  });
}
