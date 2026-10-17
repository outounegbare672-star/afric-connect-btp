BEGIN;

ALTER TABLE public.marketplace_offers
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT '';
ALTER TABLE public.marketplace_offers
  DROP CONSTRAINT IF EXISTS marketplace_offers_country_uemoa;
ALTER TABLE public.marketplace_offers
  ADD CONSTRAINT marketplace_offers_country_uemoa
  CHECK (
    country = '' OR country IN (
      'Bénin', 'Burkina Faso', 'Côte d''Ivoire', 'Guinée-Bissau',
      'Mali', 'Niger', 'Sénégal', 'Togo'
    )
  );

ALTER TABLE public.marketplace_applications
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.marketplace_applications
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.marketplace_applications
  DROP CONSTRAINT IF EXISTS marketplace_applications_status_check;
ALTER TABLE public.marketplace_applications
  ADD CONSTRAINT marketplace_applications_status_check
  CHECK (status IN ('pending', 'accepted', 'rejected', 'completed'));

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  countries text[] NOT NULL DEFAULT '{}',
  expertise text[] NOT NULL DEFAULT '{}',
  email_enabled boolean NOT NULL DEFAULT false,
  whatsapp_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_countries_uemoa CHECK (
    countries <@ ARRAY[
      'Bénin', 'Burkina Faso', 'Côte d''Ivoire', 'Guinée-Bissau',
      'Mali', 'Niger', 'Sénégal', 'Togo'
    ]::text[]
  )
);

CREATE TABLE IF NOT EXISTS public.kyc_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('cni', 'passport', 'residence')),
  document_paths text[] NOT NULL CHECK (cardinality(document_paths) BETWEEN 1 AND 3),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  review_note text NOT NULL DEFAULT '',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS kyc_submissions_status_submitted_idx
  ON public.kyc_submissions (status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS kyc_submissions_user_submitted_idx
  ON public.kyc_submissions (user_id, submitted_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS kyc_one_pending_submission_per_user_idx
  ON public.kyc_submissions (user_id)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.project_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.marketplace_applications (id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_messages_application_created_idx
  ON public.project_messages (application_id, created_at);

CREATE TABLE IF NOT EXISTS public.project_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.marketplace_applications (id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  reviewee_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '' CHECK (char_length(comment) <= 1500),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_reviews_one_per_participant UNIQUE (application_id, reviewer_id),
  CONSTRAINT project_reviews_different_participants CHECK (reviewer_id <> reviewee_id)
);

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.marketplace_offers (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT notification_deliveries_once UNIQUE (offer_id, user_id, channel)
);

CREATE INDEX IF NOT EXISTS project_reviews_reviewee_created_idx
  ON public.project_reviews (reviewee_id, created_at DESC);
CREATE OR REPLACE VIEW public.marketplace_professional_ratings
WITH (security_barrier = true)
AS
  SELECT
    review.reviewee_id AS professional_id,
    round(avg(review.rating)::numeric, 1) AS average_rating,
    count(*)::integer AS review_count
  FROM public.project_reviews review
  JOIN public.profiles profile ON profile.id = review.reviewee_id
  WHERE profile.role = 'professional'
  GROUP BY review.reviewee_id;

REVOKE ALL ON public.marketplace_professional_ratings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.marketplace_professional_ratings TO anon, authenticated;

CREATE INDEX IF NOT EXISTS notification_deliveries_pending_idx
  ON public.notification_deliveries (status, created_at)
  WHERE status IN ('pending', 'failed');

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kyc_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_preferences_read_self ON public.notification_preferences;
CREATE POLICY notification_preferences_read_self
  ON public.notification_preferences FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS notification_preferences_insert_self ON public.notification_preferences;
CREATE POLICY notification_preferences_insert_self
  ON public.notification_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS notification_preferences_update_self ON public.notification_preferences;
CREATE POLICY notification_preferences_update_self
  ON public.notification_preferences FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS kyc_submissions_read_self ON public.kyc_submissions;
CREATE POLICY kyc_submissions_read_self
  ON public.kyc_submissions FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS kyc_submissions_insert_self ON public.kyc_submissions;
CREATE POLICY kyc_submissions_insert_self
  ON public.kyc_submissions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND status = 'pending'
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(document_paths) AS paths(document_path)
      WHERE document_path IS NULL
        OR split_part(document_path, '/', 1) <> (SELECT auth.uid())::text
    )
  );

CREATE OR REPLACE FUNCTION public.guard_afric_connect_application_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  offer_owner uuid;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT owner_id INTO offer_owner
  FROM public.marketplace_offers
  WHERE id = OLD.offer_id;

  IF auth.uid() IS DISTINCT FROM offer_owner
    OR NOT (
      (OLD.status = 'pending' AND NEW.status IN ('accepted', 'rejected'))
      OR (OLD.status = 'accepted' AND NEW.status = 'completed')
    )
  THEN
    RAISE EXCEPTION 'Transition de candidature non autorisée'
      USING ERRCODE = '42501';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_afric_connect_kyc(
  p_submission_id uuid,
  p_status text,
  p_review_note text
)
RETURNS TABLE(id uuid, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user uuid;
BEGIN
  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Statut KYC invalide' USING ERRCODE = '22023';
  END IF;

  SELECT user_id INTO target_user
  FROM public.kyc_submissions
  WHERE kyc_submissions.id = p_submission_id AND kyc_submissions.status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.kyc_submissions
  SET status = p_status,
      review_note = COALESCE(p_review_note, ''),
      reviewed_at = now()
  WHERE kyc_submissions.id = p_submission_id;

  UPDATE public.profiles
  SET verified = (p_status = 'approved')
  WHERE profiles.id = target_user;

  RETURN QUERY SELECT p_submission_id, p_status;
END;
$$;

REVOKE ALL ON FUNCTION public.review_afric_connect_kyc(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_afric_connect_kyc(uuid, text, text)
  TO service_role;

DROP TRIGGER IF EXISTS guard_afric_connect_application_status
  ON public.marketplace_applications;
CREATE TRIGGER guard_afric_connect_application_status
  BEFORE UPDATE OF status ON public.marketplace_applications
  FOR EACH ROW EXECUTE FUNCTION public.guard_afric_connect_application_status();

DROP POLICY IF EXISTS marketplace_applications_update_owner
  ON public.marketplace_applications;
CREATE POLICY marketplace_applications_update_owner
  ON public.marketplace_applications FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplace_offers offer
      WHERE offer.id = offer_id AND offer.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.marketplace_offers offer
      WHERE offer.id = offer_id AND offer.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS project_messages_read_participant ON public.project_messages;
CREATE POLICY project_messages_read_participant
  ON public.project_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.marketplace_applications application
      JOIN public.marketplace_offers offer ON offer.id = application.offer_id
      WHERE application.id = application_id
        AND application.status IN ('accepted', 'completed')
        AND (application.applicant_id = (SELECT auth.uid())
          OR offer.owner_id = (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS project_messages_insert_participant ON public.project_messages;
CREATE POLICY project_messages_insert_participant
  ON public.project_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.marketplace_applications application
      JOIN public.marketplace_offers offer ON offer.id = application.offer_id
      WHERE application.id = application_id
        AND application.status IN ('accepted', 'completed')
        AND (application.applicant_id = (SELECT auth.uid())
          OR offer.owner_id = (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS project_reviews_read_public ON public.project_reviews;
CREATE POLICY project_reviews_read_public
  ON public.project_reviews FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS project_reviews_insert_participant ON public.project_reviews;
CREATE POLICY project_reviews_insert_participant
  ON public.project_reviews FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.marketplace_applications application
      JOIN public.marketplace_offers offer ON offer.id = application.offer_id
      WHERE application.id = application_id
        AND application.status = 'completed'
        AND (
          (application.applicant_id = reviewer_id AND offer.owner_id = reviewee_id)
          OR (offer.owner_id = reviewer_id AND application.applicant_id = reviewee_id)
        )
    )
  );

REVOKE ALL ON public.notification_preferences, public.kyc_submissions,
  public.project_messages, public.project_reviews
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;
GRANT SELECT, INSERT ON public.kyc_submissions TO authenticated;
GRANT SELECT, INSERT ON public.project_messages TO authenticated;
GRANT SELECT, INSERT ON public.project_reviews TO anon, authenticated;
GRANT ALL ON public.notification_preferences, public.kyc_submissions,
  public.project_messages, public.project_reviews,
  public.notification_deliveries TO service_role;
GRANT SELECT, UPDATE (status) ON public.marketplace_applications TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'kyc-documents',
  'kyc-documents',
  false,
  4194304,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 4194304,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS kyc_documents_insert_own ON storage.objects;
CREATE POLICY kyc_documents_insert_own
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'kyc-documents'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS kyc_documents_read_own ON storage.objects;
CREATE POLICY kyc_documents_read_own
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'kyc-documents'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS kyc_documents_update_own ON storage.objects;

COMMIT;
