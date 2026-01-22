-- Add instagram field to participants table
ALTER TABLE public.participants 
ADD COLUMN instagram text DEFAULT NULL;