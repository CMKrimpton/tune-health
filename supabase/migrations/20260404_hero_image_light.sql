-- Add light-mode hero image column for theme-aware illustration pairs
ALTER TABLE articles ADD COLUMN IF NOT EXISTS hero_image_light text;
