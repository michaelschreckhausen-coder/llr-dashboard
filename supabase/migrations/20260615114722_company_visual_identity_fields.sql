-- Company Brand visuelle Identität: Favicons + strukturierte Markenfarben
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS favicon_paths text[];
ALTER TABLE public.brand_voices ADD COLUMN IF NOT EXISTS brand_colors  jsonb;
