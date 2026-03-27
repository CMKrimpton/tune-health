import { supabase } from "./db.ts";

const STOP_WORDS = new Set([
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
    text.toLowerCase().split(/[\s\-:,\u2014\u2013.'"?!()]+/).filter(w => w.length > 3 && !STOP_WORDS.has(w))
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

/** Build fingerprints from existing articles + queued topics for dedup checking */
export async function buildFingerprints(db: ReturnType<typeof supabase>): Promise<Set<string>[]> {
  const { data: existingArticles } = await db
    .from("articles")
    .select("title, slug, keywords, tags, description")
    .eq("status", "published");

  const { data: queuedItems } = await db
    .from("topic_queue")
    .select("topic")
    .in("status", ["queued", "assigned", "in_progress"]);

  const fingerprints: Set<string>[] = [];

  for (const a of (existingArticles || []) as Array<{ title: string; slug: string; keywords: string[] | null; tags: string[] | null; description: string | null }>) {
    fingerprints.push(extractFingerprint(
      [a.title, (a.slug || "").replace(/-/g, " "), ...(a.keywords || []), ...(a.tags || []), a.description || ""].join(" ")
    ));
  }

  for (const q of (queuedItems || []) as Array<{ topic: string }>) {
    fingerprints.push(extractFingerprint(q.topic));
  }

  return fingerprints;
}
