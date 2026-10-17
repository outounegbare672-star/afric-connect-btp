BEGIN;

CREATE TABLE IF NOT EXISTS public.service_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('equipment_rental', 'material_sale')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 5 AND 120),
  category text NOT NULL CHECK (char_length(category) BETWEEN 2 AND 60),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  country text NOT NULL CHECK (
    country IN (
      'Bénin', 'Burkina Faso', 'Côte d''Ivoire', 'Guinée-Bissau',
      'Mali', 'Niger', 'Sénégal', 'Togo'
    )
  ),
  city text NOT NULL CHECK (char_length(city) BETWEEN 2 AND 100),
  price numeric(14, 2) NOT NULL CHECK (price > 0),
  price_unit text NOT NULL CHECK (
    price_unit IN ('jour', 'semaine', 'mois', 'tonne', 'm³', 'sac', 'kg', 'barre', 'pièce')
  ),
  quantity_available numeric(14, 2) NOT NULL CHECK (quantity_available > 0),
  item_condition text NOT NULL DEFAULT '',
  delivery_available boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'suspended')),
  owner_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_listing_price_unit_matches_kind CHECK (
    (kind = 'equipment_rental' AND price_unit IN ('jour', 'semaine', 'mois'))
    OR
    (kind = 'material_sale' AND price_unit IN ('tonne', 'm³', 'sac', 'kg', 'barre', 'pièce'))
  ),
  CONSTRAINT service_listing_condition_matches_kind CHECK (
    (kind = 'equipment_rental' AND item_condition IN ('', 'Neuf', 'Très bon état', 'Bon état', 'État correct'))
    OR
    (kind = 'material_sale' AND item_condition IN ('', 'Neuf'))
  )
);

CREATE TABLE IF NOT EXISTS public.service_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.service_listings (id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  quantity numeric(14, 2) NOT NULL CHECK (quantity > 0),
  needed_from date,
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 1500),
  contact_shared boolean NOT NULL DEFAULT false CHECK (contact_shared),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_inquiry_unique_request UNIQUE (listing_id, requester_id)
);

CREATE INDEX IF NOT EXISTS service_listings_public_search_idx
  ON public.service_listings (kind, country, city, category, created_at DESC)
  WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS service_listings_owner_created_idx
  ON public.service_listings (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS service_inquiries_listing_status_idx
  ON public.service_inquiries (listing_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS service_inquiries_requester_created_idx
  ON public.service_inquiries (requester_id, created_at DESC);

ALTER TABLE public.service_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_inquiries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.service_listings, public.service_inquiries
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.service_listings TO anon, authenticated;
GRANT INSERT ON public.service_listings TO authenticated;
GRANT SELECT, INSERT ON public.service_inquiries TO authenticated;
GRANT UPDATE (status) ON public.service_inquiries TO authenticated;
GRANT ALL ON public.service_listings, public.service_inquiries TO service_role;

DROP POLICY IF EXISTS service_listings_public_read ON public.service_listings;
CREATE POLICY service_listings_public_read
  ON public.service_listings FOR SELECT TO anon, authenticated
  USING (status = 'approved' OR owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS service_listings_insert_owner ON public.service_listings;
CREATE POLICY service_listings_insert_owner
  ON public.service_listings FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND status = 'approved'
  );

DROP POLICY IF EXISTS service_inquiries_read_participant ON public.service_inquiries;
CREATE POLICY service_inquiries_read_participant
  ON public.service_inquiries FOR SELECT TO authenticated
  USING (
    requester_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.service_listings listing
      WHERE listing.id = listing_id
        AND listing.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS service_inquiries_insert_requester ON public.service_inquiries;
CREATE POLICY service_inquiries_insert_requester
  ON public.service_inquiries FOR INSERT TO authenticated
  WITH CHECK (
    requester_id = (SELECT auth.uid())
    AND status = 'new'
    AND contact_shared
    AND EXISTS (
      SELECT 1
      FROM public.service_listings listing
      WHERE listing.id = listing_id
        AND listing.status = 'approved'
        AND listing.owner_id <> (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS service_inquiries_update_owner ON public.service_inquiries;
CREATE POLICY service_inquiries_update_owner
  ON public.service_inquiries FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.service_listings listing
      WHERE listing.id = listing_id
        AND listing.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    status IN ('new', 'contacted', 'closed')
    AND EXISTS (
      SELECT 1
      FROM public.service_listings listing
      WHERE listing.id = listing_id
        AND listing.owner_id = (SELECT auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.guard_afric_connect_service_inquiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.listing_id <> OLD.listing_id
    OR NEW.requester_id <> OLD.requester_id
    OR NEW.quantity <> OLD.quantity
    OR NEW.needed_from IS DISTINCT FROM OLD.needed_from
    OR NEW.message <> OLD.message
    OR NEW.contact_shared <> OLD.contact_shared
    OR NEW.created_at <> OLD.created_at
    OR NOT (
      NEW.status = OLD.status
      OR (OLD.status = 'new' AND NEW.status IN ('contacted', 'closed'))
      OR (OLD.status = 'contacted' AND NEW.status = 'closed')
    )
  THEN
    RAISE EXCEPTION 'Modification de demande non autorisée'
      USING ERRCODE = '42501';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_afric_connect_service_inquiry
  ON public.service_inquiries;
CREATE TRIGGER guard_afric_connect_service_inquiry
  BEFORE UPDATE ON public.service_inquiries
  FOR EACH ROW EXECUTE FUNCTION public.guard_afric_connect_service_inquiry();

COMMIT;
