CREATE TYPE public.response_status AS ENUM ('draft','approved','sent');

CREATE TABLE public.review_responses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  review_id uuid not null references public.reviews(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  tone text not null default 'professional',
  draft_text text not null,
  status public.response_status not null default 'draft',
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  sent_at timestamptz,
  sent_by uuid references auth.users(id),
  sent_channel text,
  posted_to_google boolean not null default false,
  google_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE INDEX review_responses_review_idx ON public.review_responses(review_id, created_at DESC);
CREATE INDEX review_responses_business_status_idx ON public.review_responses(business_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_responses TO authenticated;
GRANT ALL ON public.review_responses TO service_role;

ALTER TABLE public.review_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "review_responses_all" ON public.review_responses FOR ALL TO authenticated
  USING (public.has_business_access(business_id))
  WITH CHECK (public.has_business_access(business_id));

CREATE TRIGGER review_responses_updated_at BEFORE UPDATE ON public.review_responses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();