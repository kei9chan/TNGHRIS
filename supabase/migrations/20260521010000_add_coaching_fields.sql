-- Migration to add time, medium, and meeting_link to coaching_sessions

ALTER TABLE public.coaching_sessions
ADD COLUMN time TEXT,
ADD COLUMN medium TEXT,
ADD COLUMN meeting_link TEXT;
