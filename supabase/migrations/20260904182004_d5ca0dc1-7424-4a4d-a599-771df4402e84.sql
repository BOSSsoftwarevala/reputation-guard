CREATE OR REPLACE FUNCTION public.business_report(_business_id uuid, _since timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        'legitimate_negative', count(*) FILTER (WHERE is_legitimate_negative),
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
    'priority_distribution', (
      SELECT COALESCE(jsonb_object_agg(priority::text, c), '{}'::jsonb) FROM (
        SELECT priority, count(*) AS c FROM public.reviews
        WHERE business_id = _business_id AND (_since IS NULL OR review_date >= _since)
        GROUP BY priority
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
        ORDER BY 1 DESC
        LIMIT 24
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
$function$;

REVOKE ALL ON FUNCTION public.business_report(uuid, timestamp with time zone) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_report(uuid, timestamp with time zone) TO authenticated, service_role;