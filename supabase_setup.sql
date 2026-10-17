-- ============================================================
-- LK Power Outage Tracker — Supabase setup
-- Run this once in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- 1. Enable PostGIS extension for spatial queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Create outage reports table
CREATE TABLE public.outage_reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    district TEXT NOT NULL,
    area_name TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    status TEXT CHECK (status IN ('outage', 'restored')) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Indices for fast geographic + recency queries
CREATE INDEX idx_outage_reports_coords ON public.outage_reports (latitude, longitude);
CREATE INDEX idx_outage_reports_created_at ON public.outage_reports (created_at DESC);

-- 4. Enable Row Level Security
ALTER TABLE public.outage_reports ENABLE ROW LEVEL SECURITY;

-- 5. RLS policies: anonymous read + insert only (no updates, no deletes)
CREATE POLICY "Allow public read access" ON public.outage_reports
    FOR SELECT USING (true);

CREATE POLICY "Allow public insert access" ON public.outage_reports
    FOR INSERT WITH CHECK (true);

-- 6. Enable realtime replication for outage_reports
ALTER PUBLICATION supabase_realtime ADD TABLE public.outage_reports;
