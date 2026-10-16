BEGIN;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL,
  phone text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'professional')),
  verified boolean NOT NULL DEFAULT false,
  expertise text NOT NULL DEFAULT '',
  rate text NOT NULL DEFAULT '',
  bio text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_country_uemoa CHECK (
    country = '' OR country IN (
      'Bénin', 'Burkina Faso', 'Côte d''Ivoire', 'Guinée-Bissau',
      'Mali', 'Niger', 'Sénégal', 'Togo'
    )
  )
);

CREATE TABLE IF NOT EXISTS public.marketplace_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL,
  city text NOT NULL,
  budget bigint NOT NULL CHECK (budget > 0),
  deadline text NOT NULL DEFAULT 'À définir',
  urgency text NOT NULL DEFAULT 'Moyen',
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'pending', 'suspended')),
  owner_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  applications_count integer NOT NULL DEFAULT 0 CHECK (applications_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketplace_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.marketplace_offers (id) ON DELETE CASCADE,
  applicant_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  message text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_applications_once UNIQUE (offer_id, applicant_id)
);

CREATE INDEX IF NOT EXISTS marketplace_offers_status_created_idx
  ON public.marketplace_offers (status, created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_offers_owner_idx
  ON public.marketplace_offers (owner_id);
CREATE INDEX IF NOT EXISTS marketplace_applications_applicant_idx
  ON public.marketplace_applications (applicant_id);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_applications ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  existing_policy record;
BEGIN
  FOR existing_policy IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('profiles', 'marketplace_offers', 'marketplace_applications', 'users')
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      existing_policy.policyname,
      existing_policy.schemaname,
      existing_policy.tablename
    );
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS marketplace_offers_read_approved_or_owner ON public.marketplace_offers;
CREATE POLICY marketplace_offers_read_approved_or_owner
  ON public.marketplace_offers FOR SELECT TO anon, authenticated
  USING (status = 'approved' OR owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS marketplace_offers_insert_owner ON public.marketplace_offers;
CREATE POLICY marketplace_offers_insert_owner
  ON public.marketplace_offers FOR INSERT TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS marketplace_applications_read_participant ON public.marketplace_applications;
CREATE POLICY marketplace_applications_read_participant
  ON public.marketplace_applications FOR SELECT TO authenticated
  USING (
    applicant_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.marketplace_offers offer
      WHERE offer.id = offer_id AND offer.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS marketplace_applications_insert_self ON public.marketplace_applications;
CREATE POLICY marketplace_applications_insert_self
  ON public.marketplace_applications FOR INSERT TO authenticated
  WITH CHECK (
    applicant_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.marketplace_offers offer
      WHERE offer.id = offer_id
        AND offer.status = 'approved'
        AND offer.owner_id <> (SELECT auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.create_afric_connect_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, phone, country, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'phone', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'country', ''),
    CASE
      WHEN NEW.raw_user_meta_data ->> 'role' IN ('client', 'professional')
      THEN NEW.raw_user_meta_data ->> 'role'
      ELSE 'client'
    END
  )
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_afric_connect ON auth.users;
CREATE TRIGGER on_auth_user_created_afric_connect
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_afric_connect_profile();

CREATE OR REPLACE FUNCTION public.increment_afric_connect_application_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.marketplace_offers
  SET applications_count = applications_count + 1
  WHERE id = NEW.offer_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_afric_connect_application_created ON public.marketplace_applications;
CREATE TRIGGER on_afric_connect_application_created
  AFTER INSERT ON public.marketplace_applications
  FOR EACH ROW EXECUTE FUNCTION public.increment_afric_connect_application_count();

DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.users ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON TABLE public.users FROM PUBLIC, anon, authenticated';
  END IF;
END;
$$;

DROP POLICY IF EXISTS profiles_public_professionals ON public.profiles;
DROP POLICY IF EXISTS profiles_insert_self ON public.profiles;
DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
DROP POLICY IF EXISTS profiles_read_self ON public.profiles;
CREATE POLICY profiles_read_self
  ON public.profiles FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

CREATE OR REPLACE VIEW public.marketplace_professionals
WITH (security_barrier = true)
AS
  SELECT id, full_name, country, role, verified, expertise, rate, bio, created_at
  FROM public.profiles
  WHERE role = 'professional';

REVOKE ALL ON public.profiles, public.marketplace_offers, public.marketplace_applications
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.marketplace_professionals TO anon, authenticated;
GRANT SELECT ON public.marketplace_offers TO anon, authenticated;
GRANT INSERT ON public.marketplace_offers TO authenticated;
GRANT SELECT, INSERT ON public.marketplace_applications TO authenticated;
GRANT ALL ON public.profiles, public.marketplace_offers, public.marketplace_applications TO service_role;

COMMIT;
