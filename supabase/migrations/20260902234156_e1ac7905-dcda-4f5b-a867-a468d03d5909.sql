-- Performance indexes
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE INDEX IF NOT EXISTS idx_reviews_business_date ON public.reviews (business_id, review_date DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_business_rating ON public.reviews (business_id, rating);
CREATE INDEX IF NOT EXISTS idx_reviews_business_priority ON public.reviews (business_id, priority);
CREATE INDEX IF NOT EXISTS idx_reviews_business_scan_status ON public.reviews (business_id, scan_status);
CREATE INDEX IF NOT EXISTS idx_reviews_business_category ON public.reviews (business_id, violation_category);
CREATE INDEX IF NOT EXISTS idx_reviews_business_location ON public.reviews (business_id, location_id);
CREATE INDEX IF NOT EXISTS idx_reviews_google_review_name ON public.reviews (google_review_name);
CREATE INDEX IF NOT EXISTS idx_reviews_text_trgm ON public.reviews USING gin (review_text extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer_trgm ON public.reviews USING gin (reviewer_name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_locations_business ON public.locations (business_id);
CREATE INDEX IF NOT EXISTS idx_cases_business_created ON public.removal_cases (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cases_business_status ON public.removal_cases (business_id, status);
CREATE INDEX IF NOT EXISTS idx_cases_business_outcome ON public.removal_cases (business_id, outcome);
CREATE INDEX IF NOT EXISTS idx_cases_review ON public.removal_cases (review_id);
CREATE INDEX IF NOT EXISTS idx_case_events_case ON public.case_events (case_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications (user_id, created_at DESC);

-- Appeal workflow fields
ALTER TABLE public.removal_cases
  ADD COLUMN IF NOT EXISTS appeal_reason text,
  ADD COLUMN IF NOT EXISTS appeal_round integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS google_reference_id text,
  ADD COLUMN IF NOT EXISTS last_appeal_at timestamp with time zone;

-- Evidence attachments
CREATE TABLE IF NOT EXISTS public.case_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.removal_cases(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  content_type text,
  size_bytes integer,
  caption text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_attachments TO authenticated;
GRANT ALL ON public.case_attachments TO service_role;

ALTER TABLE public.case_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "case_attachments_read" ON public.case_attachments
  FOR SELECT TO authenticated USING (public.has_business_access(business_id));
CREATE POLICY "case_attachments_insert" ON public.case_attachments
  FOR INSERT TO authenticated WITH CHECK (public.has_business_access(business_id) AND uploaded_by = auth.uid());
CREATE POLICY "case_attachments_update" ON public.case_attachments
  FOR UPDATE TO authenticated USING (public.has_business_access(business_id)) WITH CHECK (public.has_business_access(business_id));
CREATE POLICY "case_attachments_delete" ON public.case_attachments
  FOR DELETE TO authenticated USING (
    uploaded_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = case_attachments.business_id AND b.owner_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_case_attachments_case ON public.case_attachments (case_id, created_at);

-- Server-side analytics aggregation
CREATE OR REPLACE FUNCTION public.business_report(_business_id uuid, _since timestamp with time zone DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_business_access(_business_id) THEN
    RAISE EXCEPTION 'Access denied for this workspace';
  END IF;

  SELECT jsonb_build_object(
    'totals', (
      SELECT jsonb_build_object(
        'reviews', count(*),
        'avg_rating', COALESCE(round(avg(rating)::numeric, 2), 0),
        'negative', count(*) FILTER (WHERE rating <= 2),
        'scanned', count(*) FILTER (WHERE scan_status = 'scanned'),
        'unscanned', count(*) FILTER (WHERE scan_status IN ('unscanned','failed')),
        'flagged', count(*) FILTER (WHERE violation_category IS NOT NULL AND violation_category <> 'none'),
        'high_priority', count(*) FILTER (WHERE priority = 'high'),
        'removed', count(*) FILTER (WHERE removed_from_google_at IS NOT NULL)
      )
      FROM public.reviews r
      WHERE r.business_id = _business_id AND (_since IS NULL OR r.review_date >= _since)
    ),
    'rating_distribution', (
      SELECT COALESCE(jsonb_object_agg(rating::text, c), '{}'::jsonb) FROM (
        SELECT rating, count(*) AS c FROM public.reviews
        WHERE business_id = _business_id AND (_since IS NULL OR review_date >= _since)
        GROUP BY rating
      ) d
    ),
    'violation_distribution', (
      SELECT COALESCE(jsonb_object_agg(cat, c), '{}'::jsonb) FROM (
        SELECT COALESCE(violation_category::text, 'unscanned') AS cat, count(*) AS c
        FROM public.reviews
        WHERE business_id = _business_id AND (_since IS NULL OR review_date >= _since)
        GROUP BY 1
      ) d
    ),
    'monthly', (
      SELECT COALESCE(jsonb_agg(row_to_json(m) ORDER BY m.month), '[]'::jsonb) FROM (
        SELECT to_char(date_trunc('month', review_date), 'YYYY-MM') AS month,
               count(*) AS reviews,
               round(avg(rating)::numeric, 2) AS avg_rating,
               count(*) FILTER (WHERE rating <= 2) AS negative,
               count(*) FILTER (WHERE violation_category IS NOT NULL AND violation_category <> 'none') AS flagged
        FROM public.reviews
        WHERE business_id = _business_id AND (_since IS NULL OR review_date >= _since)
        GROUP BY 1
      ) m
    ),
    'cases', (
      SELECT jsonb_build_object(
        'total', count(*),
        'resolved', count(*) FILTER (WHERE status = 'resolved'),
        'rejected', count(*) FILTER (WHERE status = 'rejected'),
        'appeal', count(*) FILTER (WHERE status = 'appeal'),
        'reported', count(*) FILTER (WHERE status = 'reported'),
        'removed_by_google', count(*) FILTER (WHERE outcome = 'removed_by_google'),
        'still_live', count(*) FILTER (WHERE outcome = 'still_live'),
        'by_status', COALESCE((
          SELECT jsonb_object_agg(status::text, c) FROM (
            SELECT status, count(*) AS c FROM public.removal_cases
            WHERE business_id = _business_id AND (_since IS NULL OR created_at >= _since)
            GROUP BY status
          ) s
        ), '{}'::jsonb),
        'avg_days_to_resolve', COALESCE((
          SELECT round(avg(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 86400)::numeric, 1)
          FROM public.removal_cases
          WHERE business_id = _business_id AND resolved_at IS NOT NULL
            AND (_since IS NULL OR created_at >= _since)
        ), 0)
      )
      FROM public.removal_cases c
      WHERE c.business_id = _business_id AND (_since IS NULL OR c.created_at >= _since)
    ),
    'locations', (
      SELECT COALESCE(jsonb_agg(row_to_json(l) ORDER BY l.name), '[]'::jsonb) FROM (
        SELECT loc.id, loc.name,
               count(r.id) AS reviews,
               COALESCE(round(avg(r.rating)::numeric, 2), 0) AS avg_rating,
               count(r.id) FILTER (WHERE r.rating <= 2) AS negative,
               count(r.id) FILTER (WHERE r.violation_category IS NOT NULL AND r.violation_category <> 'none') AS flagged,
               (SELECT count(*) FROM public.removal_cases rc WHERE rc.location_id = loc.id AND (_since IS NULL OR rc.created_at >= _since)) AS cases,
               (SELECT count(*) FROM public.removal_cases rc WHERE rc.location_id = loc.id AND rc.status = 'resolved' AND (_since IS NULL OR rc.created_at >= _since)) AS resolved_cases
        FROM public.locations loc
        LEFT JOIN public.reviews r ON r.location_id = loc.id AND (_since IS NULL OR r.review_date >= _since)
        WHERE loc.business_id = _business_id
        GROUP BY loc.id, loc.name
      ) l
    )
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.business_report(uuid, timestamp with time zone) TO authenticated;