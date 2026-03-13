-- SafeRoute Supabase SQL Schema
-- Paste this into your Supabase SQL Editor

-- 1. Create Tables

-- Trusted Contacts
CREATE TABLE IF NOT EXISTS public.trusted_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Journeys
CREATE TABLE IF NOT EXISTS public.journeys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    mode TEXT NOT NULL, -- walking, bus, train, bike_cab
    start_lat DOUBLE PRECISION NOT NULL,
    start_lng DOUBLE PRECISION NOT NULL,
    dest_lat DOUBLE PRECISION NOT NULL,
    dest_lng DOUBLE PRECISION NOT NULL,
    dest_name TEXT,
    status TEXT DEFAULT 'active', -- active, completed, cancelled, emergency
    risk_score_max INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Journey Locations (History)
CREATE TABLE IF NOT EXISTS public.journey_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journey_id UUID NOT NULL REFERENCES public.journeys(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    speed DOUBLE PRECISION,
    accuracy DOUBLE PRECISION,
    risk_score INTEGER,
    timestamp TIMESTAMPTZ DEFAULT now()
);

-- Risk Events
CREATE TABLE IF NOT EXISTS public.risk_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journey_id UUID REFERENCES public.journeys(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    risk_score INTEGER NOT NULL,
    reason TEXT,
    factors JSONB,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- SOS Alerts
CREATE TABLE IF NOT EXISTS public.sos_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    journey_id UUID REFERENCES public.journeys(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    trigger_reason TEXT, -- manual, voice, halt, etc.
    message TEXT,
    status TEXT DEFAULT 'active', -- active, resolved
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.trusted_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journey_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sos_alerts ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies

-- Trusted Contacts
CREATE POLICY "Users can manage their own contacts" ON public.trusted_contacts
    FOR ALL USING (auth.uid() = user_id);

-- Journeys
CREATE POLICY "Users can manage their own journeys" ON public.journeys
    FOR ALL USING (auth.uid() = user_id);

-- Journey Locations
CREATE POLICY "Users can manage their own journey locations" ON public.journey_locations
    FOR ALL USING (auth.uid() = user_id);

-- Risk Events
CREATE POLICY "Users can manage their own risk events" ON public.risk_events
    FOR ALL USING (auth.uid() = user_id);

-- SOS Alerts
CREATE POLICY "Users can manage their own SOS alerts" ON public.sos_alerts
    FOR ALL USING (auth.uid() = user_id);

-- 4. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_journeys_user ON public.journeys(user_id);
CREATE INDEX IF NOT EXISTS idx_journey_locs_journey ON public.journey_locations(journey_id);
CREATE INDEX IF NOT EXISTS idx_risk_events_journey ON public.risk_events(journey_id);
CREATE INDEX IF NOT EXISTS idx_sos_alerts_user ON public.sos_alerts(user_id);

-- 5. Storage Bucket (For Audio Recordings)
-- NOTE: Please run this in your Supabase SQL Editor if you haven't!
insert into storage.buckets (id, name, public) 
values ('sos_audio', 'sos_audio', true) 
on conflict (id) do nothing;

create policy "Allow public read on sos_audio" 
on storage.objects for select 
using ( bucket_id = 'sos_audio' );

create policy "Allow authenticated upload on sos_audio" 
on storage.objects for insert 
with check ( bucket_id = 'sos_audio' and auth.role() = 'authenticated' );

