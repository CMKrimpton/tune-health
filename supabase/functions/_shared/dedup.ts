import { supabase } from "./db.ts";

const STOP_WORDS = new Set([
  // 3-letter common words (now included since filter is >= 3)
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "her", "was",
  "one", "our", "out", "how", "why", "now", "may", "its", "has", "his", "who",
  "got", "let", "say", "too", "use", "way", "did", "get", "had", "him", "own",
  "yet", "any", "few", "much", "per", "try", "ago", "far",
  // 4+ letter common words
  "that", "this", "with", "from", "have", "been", "your", "what", "when", "just",
  "more", "most", "than", "also", "about", "into", "does", "will", "could", "would",
  "should", "every", "their", "these", "those", "some", "other", "only", "first",
  "health", "study", "research", "evidence", "science", "brain", "body", "human",
  "people", "patients", "treatment", "medical", "clinical", "risk", "effect",
  "effects", "years", "shows", "found", "actually", "problem", "really", "new",
  "industry", "funded", "drugs", "behind", "truth", "hidden", "might", "here",
  "aren", "aren't", "isn", "isn't", "don", "don't", "won", "won't", "didn",
  "link", "linked", "connection", "between", "reveal", "exposed", "crisis",
  "silent", "quietly", "nobody", "everyone", "knows", "knew", "told", "telling",
  "worse", "better", "making", "causing", "doing", "getting", "being", "having",
  "young", "adults", "millennials", "generation", "modern", "diet", "food",
]);

/** Extract subject words from text, filtering stop words and short words */
export function extractFingerprint(text: string): Set<string> {
  return new Set(
    text.toLowerCase().split(/[\s\-:,\u2014\u2013.'"?!()]+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w))
  );
}

/** Check if a topic is a duplicate of any existing fingerprint (25% overlap + 3 matching subject words) */
export function isDuplicate(topic: string, fingerprints: Set<string>[]): boolean {
  const words = extractFingerprint(topic);
  if (words.size === 0) return false;
  for (const fp of fingerprints) {
    if (fp.size === 0) continue;
    const overlap = [...words].filter(w => fp.has(w)).length;
    const reverse = [...fp].filter(w => words.has(w)).length;
    if (Math.max(overlap / words.size, reverse / fp.size) >= 0.25 && overlap >= 3) return true;
  }
  return false;
}

/** Build fingerprints from existing articles + queued topics + in-progress pipeline articles for dedup checking */
export async function buildFingerprints(db: ReturnType<typeof supabase>): Promise<Set<string>[]> {
  const { data: existingArticles } = await db
    .from("articles")
    .select("title, slug, keywords, tags, description")
    .eq("status", "published");

  // All queue items except skipped — includes completed so we don't re-suggest already-produced topics
  const { data: queuedItems } = await db
    .from("topic_queue")
    .select("topic")
    .in("status", ["queued", "assigned", "in_progress", "completed"]);

  // In-progress pipeline articles (not yet published, but already being worked on)
  const { data: pipelineArticles } = await db
    .from("daily_article_log")
    .select("topic, title")
    .in("status", ["searching", "research", "editor", "editor_approved", "writing", "independence", "qc", "voice_rewrite", "publishing", "in_progress"]);

  const fingerprints: Set<string>[] = [];

  for (const a of (existingArticles || []) as Array<{ title: string; slug: string; keywords: string[] | null; tags: string[] | null; description: string | null }>) {
    fingerprints.push(extractFingerprint(
      [a.title, (a.slug || "").replace(/-/g, " "), ...(a.keywords || []), ...(a.tags || []), a.description || ""].join(" ")
    ));
  }

  for (const q of (queuedItems || []) as Array<{ topic: string }>) {
    fingerprints.push(extractFingerprint(q.topic));
  }

  for (const p of (pipelineArticles || []) as Array<{ topic: string | null; title: string | null }>) {
    const text = [p.topic || "", p.title || ""].join(" ").trim();
    if (text) fingerprints.push(extractFingerprint(text));
  }

  // Dedup log: merged and manually-deleted topics from the last 90 days.
  // Each original topic gets its own fingerprint (not diluted into one merged record)
  // so scouts can't re-suggest the same angle after it's been consumed.
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: dedupLog } = await db
    .from("topic_dedup_log")
    .select("topic_text")
    .gte("created_at", cutoff);

  for (const entry of (dedupLog || []) as Array<{ topic_text: string }>) {
    if (entry.topic_text) fingerprints.push(extractFingerprint(entry.topic_text));
  }

  return fingerprints;
}
