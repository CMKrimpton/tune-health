-- Add narration_url column for ElevenLabs TTS intro narrations
ALTER TABLE articles ADD COLUMN IF NOT EXISTS narration_url text;

-- Create storage bucket for narration MP3 files
INSERT INTO storage.buckets (id, name, public)
VALUES ('article-narrations', 'article-narrations', true)
ON CONFLICT (id) DO NOTHING;
