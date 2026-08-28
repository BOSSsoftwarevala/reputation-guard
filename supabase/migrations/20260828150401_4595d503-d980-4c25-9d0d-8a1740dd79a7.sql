-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin','manager','analyst');
CREATE TYPE public.violation_category AS ENUM ('spam','fake_content','off_topic','conflict_of_interest','harassment','abuse','threats','extortion','personal_information','promotional','other','none');
CREATE TYPE public.review_priority AS ENUM ('high','medium','review_required','normal');
CREATE TYPE public.case_status AS ENUM ('new','reviewing','evidence_ready','reported','appeal','resolved','rejected');
CREATE TYPE public.scan_status AS ENUM ('unscanned','queued','scanning','scanned','failed');
CREATE TYPE public.job_status AS ENUM ('running','paused','completed','failed');

-- UTILITY
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_read" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_write_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ROLES
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_read" ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- BUSINESSES
CREATE TABLE public.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  name TEXT NOT NULL,
  industry TEXT,
  website TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.businesses TO authenticated;
GRANT ALL ON public.businesses TO service_role;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.business_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role public.app_role NOT NULL DEFAULT 'analyst',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_members TO authenticated;
GRANT ALL ON public.business_members TO service_role;
ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_business_access(_business_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = _business_id AND b.owner_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.business_members m WHERE m.business_id = _business_id AND m.user_id = auth.uid());
$$;

CREATE POLICY "businesses_read" ON public.businesses FOR SELECT TO authenticated USING (public.has_business_access(id));
CREATE POLICY "businesses_insert" ON public.businesses FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "businesses_update" ON public.businesses FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "businesses_delete" ON public.businesses FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE TRIGGER businesses_updated BEFORE UPDATE ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "members_read" ON public.business_members FOR SELECT TO authenticated USING (public.has_business_access(business_id));
CREATE POLICY "members_manage" ON public.business_members FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid()));

-- LOCATIONS
CREATE TABLE public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  country TEXT,
  google_place_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX locations_business_idx ON public.locations(business_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.locations TO authenticated;
GRANT ALL ON public.locations TO service_role;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "locations_all" ON public.locations FOR ALL TO authenticated
  USING (public.has_business_access(business_id)) WITH CHECK (public.has_business_access(business_id));
CREATE TRIGGER locations_updated BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- REVIEWS
CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  source_review_id TEXT,
  reviewer_name TEXT NOT NULL DEFAULT 'Anonymous',
  reviewer_profile_url TEXT,
  rating SMALLINT NOT NULL DEFAULT 5,
  review_text TEXT NOT NULL DEFAULT '',
  review_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  scan_status public.scan_status NOT NULL DEFAULT 'unscanned',
  violation_category public.violation_category,
  ai_confidence NUMERIC(5,2),
  ai_explanation TEXT,
  ai_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommended_action TEXT,
  is_legitimate_negative BOOLEAN NOT NULL DEFAULT false,
  priority public.review_priority NOT NULL DEFAULT 'normal',
  scanned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, source_review_id)
);
CREATE INDEX reviews_business_idx ON public.reviews(business_id);
CREATE INDEX reviews_priority_idx ON public.reviews(business_id, priority);
CREATE INDEX reviews_scan_idx ON public.reviews(business_id, scan_status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviews_all" ON public.reviews FOR ALL TO authenticated
  USING (public.has_business_access(business_id)) WITH CHECK (public.has_business_access(business_id));
CREATE TRIGGER reviews_updated BEFORE UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- CASES
CREATE TABLE public.removal_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  review_id UUID NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  case_number SERIAL,
  violation_category public.violation_category NOT NULL DEFAULT 'other',
  status public.case_status NOT NULL DEFAULT 'new',
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  assigned_to UUID,
  created_by UUID NOT NULL,
  reported_at TIMESTAMPTZ,
  appealed_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (review_id)
);
CREATE INDEX cases_business_idx ON public.removal_cases(business_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.removal_cases TO authenticated;
GRANT ALL ON public.removal_cases TO service_role;
ALTER TABLE public.removal_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cases_all" ON public.removal_cases FOR ALL TO authenticated
  USING (public.has_business_access(business_id)) WITH CHECK (public.has_business_access(business_id));
CREATE TRIGGER cases_updated BEFORE UPDATE ON public.removal_cases FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.case_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.removal_cases(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  actor_id UUID,
  event_type TEXT NOT NULL,
  message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX case_events_case_idx ON public.case_events(case_id);
GRANT SELECT, INSERT ON public.case_events TO authenticated;
GRANT ALL ON public.case_events TO service_role;
ALTER TABLE public.case_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "case_events_read" ON public.case_events FOR SELECT TO authenticated USING (public.has_business_access(business_id));
CREATE POLICY "case_events_insert" ON public.case_events FOR INSERT TO authenticated WITH CHECK (public.has_business_access(business_id));

-- NOTIFICATIONS
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON public.notifications(user_id, is_read);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_own" ON public.notifications FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- SCAN JOBS
CREATE TABLE public.scan_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  status public.job_status NOT NULL DEFAULT 'running',
  total_reviews INTEGER NOT NULL DEFAULT 0,
  processed_reviews INTEGER NOT NULL DEFAULT 0,
  flagged_reviews INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX scan_jobs_business_idx ON public.scan_jobs(business_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scan_jobs TO authenticated;
GRANT ALL ON public.scan_jobs TO service_role;
ALTER TABLE public.scan_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scan_jobs_all" ON public.scan_jobs FOR ALL TO authenticated
  USING (public.has_business_access(business_id)) WITH CHECK (public.has_business_access(business_id));
CREATE TRIGGER scan_jobs_updated BEFORE UPDATE ON public.scan_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();