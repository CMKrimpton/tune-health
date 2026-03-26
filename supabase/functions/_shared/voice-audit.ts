import type { VoiceAudit } from "./types.ts";

export function auditVoiceQuality(html: string): VoiceAudit {
  // Strip HTML to plain text, preserving paragraph boundaries
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "")  // skip pull quotes
    .replace(/<div class="info-card[\s\S]*?<\/div>/gi, "")  // skip info cards
    .replace(/<div class="mt-12[\s\S]*?<\/div>/gi, "")  // skip disclaimer
    .replace(/<section id="sources"[\s\S]*?<\/section>/gi, "")  // skip sources
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Split into paragraphs (non-empty lines)
  const paragraphs = text
    .split(/\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 20);  // skip headings and short fragments

  // Count sentences per paragraph (rough: split on . ! ?)
  const sentenceCounts = paragraphs.map(p => {
    const sentences = p.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 5);
    return sentences.length;
  });

  const paragraphsOver3 = sentenceCounts.filter(c => c > 3).length;
  const longestParagraph = Math.max(...sentenceCounts, 0);

  // Count all sentences for short-sentence check
  const allSentences = paragraphs
    .flatMap(p => p.split(/(?<=[.!?])\s+/))
    .filter(s => s.trim().length > 3);
  const shortSentences = allSentences.filter(s => s.trim().split(/\s+/).length < 8);

  // "you" / "your" count
  const youCount = (text.match(/\byou\b|\byour\b|\byou're\b|\byou've\b|\byourself\b/gi) || []).length;

  // Word count
  const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;

  // Rhetorical questions (sentences ending in ? that aren't in headings)
  const rhetoricQuestions = allSentences.filter(s => s.trim().endsWith("?")).length;

  // Banned phrase scan (case-insensitive)
  const BANNED = [
    "let's explore", "let's dive in", "let's break this down", "let's unpack",
    "picture this", "think of your", "think of it as",
    "hidden in plain sight", "marvel of biology", "game-changer", "paradigm shift",
    "the honest answer is", "what is not in dispute", "in short",
    "what emerges from the research", "the research has produced",
    "this is not a theoretical construct",
    "it's important to note", "it's worth mentioning",
    "interestingly", "remarkably", "fascinatingly",
    "it turns out", "buckle up", "here's the thing",
    "moreover", "furthermore", "additionally",
    "the mechanism by which",
    "growing body of evidence", "the landscape is evolving",
    "imagine a", "imagine you",
  ];

  const textLower = text.toLowerCase();
  const foundBanned = BANNED.filter(phrase => textLower.includes(phrase));

  // Compute failures
  const failures: string[] = [];
  if (foundBanned.length > 0) {
    failures.push(`BANNED PHRASES found: ${foundBanned.map(p => `"${p}"`).join(", ")}`);
  }
  // Only flag if many paragraphs are dense — occasional 4-5 sentence paragraphs
  // are fine in quality journalism. The old strict 3-sentence max was for AI slop prevention.
  const denseParaRatio = paragraphs.length > 0 ? paragraphsOver3 / paragraphs.length : 0;
  if (denseParaRatio > 0.3) {
    failures.push(`${paragraphsOver3} of ${paragraphs.length} paragraphs exceed 3 sentences — too dense`);
  }
  // "you" count tracked but not enforced — Opus writes naturally engaging prose
  // without being told to spam "you". The old minimum-6 rule produced forced, directive writing.
  const shortPer3 = paragraphs.length > 0 ? (shortSentences.length / paragraphs.length) * 3 : 0;
  if (shortPer3 < 1 && paragraphs.length >= 3) {
    failures.push(`Short sentences (< 8 words): ${shortSentences.length} total = ${shortPer3.toFixed(1)} per 3 paragraphs — need at least 1 per 3`);
  }
  if (rhetoricQuestions > 2) {
    failures.push(`${rhetoricQuestions} rhetorical questions — max is 2`);
  }

  return {
    bannedPhrases: foundBanned,
    paragraphsOver3Sentences: paragraphsOver3,
    longestParagraphSentences: longestParagraph,
    youCount,
    wordCount,
    shortSentenceCount: shortSentences.length,
    totalParagraphs: paragraphs.length,
    shortSentenceRatio: `${shortPer3.toFixed(1)} per 3 paragraphs`,
    rhetoricQuestionCount: rhetoricQuestions,
    passed: failures.length === 0,
    failures,
  };
}
