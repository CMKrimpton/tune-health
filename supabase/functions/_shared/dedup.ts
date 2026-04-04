import { supabase } from "./db.ts";

// STOP WORDS: Only true function words and generic filler.
// NEVER add health/science domain words here — they ARE the semantic signal
// that distinguishes "sleep apnea treatment" from "insomnia therapy".
// Previous version removed "health", "study", "brain", "treatment", "diet", "food",
// "drugs", "clinical", "patients", etc. — gutting fingerprints for a health publication.
const STOP_WORDS = new Set([
  // Articles, prepositions, conjunctions, pronouns
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "her", "was",
  "one", "our", "out", "how", "why", "now", "may", "its", "has", "his", "who",
  "got", "let", "say", "too", "use", "way", "did", "get", "had", "him", "own",
  "yet", "any", "few", "much", "per", "try", "ago", "far",
  "that", "this", "with", "from", "have", "been", "your", "what", "when", "just",
  "more", "most", "than", "also", "about", "into", "does", "will", "could", "would",
  "should", "every", "their", "these", "those", "some", "other", "only", "first",
  // Contractions
  "aren", "aren't", "isn", "isn't", "don", "don't", "won", "won't", "didn",
  // Generic verbs/adjectives that don't distinguish topics
  "shows", "found", "actually", "really", "might", "here",
  "worse", "better", "making", "causing", "doing", "getting", "being", "having",
  // Generic editorial framing words (appear in every topic regardless of subject)
  "reveal", "exposed", "hidden", "behind", "truth", "silent", "quietly",
  "nobody", "everyone", "knows", "knew", "told", "telling",
]);

/** Extract subject words from text, filtering stop words and short words.
 *  Also generates bigrams for compound health terms (e.g. "seed oils", "back pain"). */
export function extractFingerprint(text: string): Set<string> {
  const words = text.toLowerCase().split(/[\s\-:,\u2014\u2013.'"?!()]+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w));
  const result = new Set(words);
  // Add bigrams to catch compound terms like "seed oils", "back pain", "sleep apnea"
  for (let i = 0; i < words.length - 1; i++) {
    result.add(`${words[i]}_${words[i + 1]}`);
  }
  return result;
}

/** Check if a topic is a duplicate of any existing fingerprint.
 *  Bidirectional: 35% overlap in EITHER direction + 3 matching subject words.
 *  Bigrams boost matching for compound health terms. */
export function isDuplicate(topic: string, fingerprints: Set<string>[]): boolean {
  const words = extractFingerprint(topic);
  if (words.size === 0) return false;
  for (const fp of fingerprints) {
    if (fp.size === 0) continue;
    const overlap = [...words].filter(w => fp.has(w)).length;
    const reverse = [...fp].filter(w => words.has(w)).length;
    // Use the smaller set's perspective — prevents large fingerprints from diluting match %
    const smallSize = Math.min(words.size, fp.size);
    const maxOverlap = Math.max(overlap / words.size, reverse / fp.size);
    // Also check from the smaller set's perspective for short topics
    const smallPct = smallSize > 0 ? Math.max(overlap, reverse) / smallSize : 0;
    if ((maxOverlap >= 0.35 || smallPct >= 0.50) && overlap >= 3) return true;
  }
  return false;
}

/** Build fingerprints from existing articles + queued topics + in-progress pipeline articles for dedup checking */
export async function buildFingerprints(db: ReturnType<typeof supabase>): Promise<Set<string>[]> {
  const { data: existingArticles } = await db
    .from("articles")
    .select("title, slug, keywords, tags, description")
    .eq("status", "published");

  // All queue items regardless of status — includes completed AND skipped
  // so scouts can't re-suggest topics that were already produced or deliberately rejected
  const { data: queuedItems } = await db
    .from("topic_queue")
    .select("topic");

  // All pipeline articles — active, failed, and published
  // Failed/killed topics must stay in dedup so scouts don't re-suggest them
  const { data: pipelineArticles } = await db
    .from("daily_article_log")
    .select("topic, title");

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
