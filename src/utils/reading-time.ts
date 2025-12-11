/**
 * Calculate reading time for article content
 * Average reading speed: 200-250 words per minute
 */

const WORDS_PER_MINUTE = 220;

export function calculateReadingTime(content: string): number {
  // Strip HTML tags
  const text = content.replace(/<[^>]*>/g, '');

  // Count words
  const words = text.trim().split(/\s+/).length;

  // Calculate reading time in minutes, rounded up
  return Math.ceil(words / WORDS_PER_MINUTE);
}

export function formatReadingTime(minutes: number): string {
  return `${minutes} min read`;
}

export function getWordCount(content: string): number {
  const text = content.replace(/<[^>]*>/g, '');
  return text.trim().split(/\s+/).length;
}
