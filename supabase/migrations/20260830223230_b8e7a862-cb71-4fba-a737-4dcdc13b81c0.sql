CREATE TABLE public.google_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  connected_by uuid NOT NULL,
  google_email text,
  google_account_name text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  scope text,
  last_sync_at timestamptz,
  last_sync_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id)
);

GRANT ALL ON public.google_connections TO service_role;

ALTER TABLE public.google_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "google_connections_service_only" ON public.google_connections
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER google_connections_updated BEFORE UPDATE ON public.google_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS google_resource_name text,
  ADD COLUMN IF NOT EXISTS google_last_sync_at timestamptz;

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS google_review_name text,
  ADD COLUMN IF NOT EXISTS google_last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS removed_from_google_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_live_on_google boolean NOT NULL DEFAULT true;

CREATE TYPE public.removal_outcome AS ENUM ('pending', 'removed_by_google', 'still_live', 'no_result');

ALTER TABLE public.removal_cases
  ADD COLUMN IF NOT EXISTS outcome public.removal_outcome NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS outcome_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS google_removed_at timestamptz;

CREATE INDEX IF NOT EXISTS reviews_google_name_idx ON public.reviews (business_id, google_review_name);