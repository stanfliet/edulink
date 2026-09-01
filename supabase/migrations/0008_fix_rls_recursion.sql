-- ============================================================
-- EDULINK · 0008 — Fix RLS infinite recursion (42P17)
--
-- Live symptom: any query touching `learners` (directly or via a
-- policy subquery, e.g. SELECT on schools/users/…) returns
--   {"code":"42P17","message":"infinite recursion detected in
--    policy for relation \"learners\""}
--
-- Root cause: two RLS-mediated reference cycles between tables —
--   learners            (learners_agency_read_consented)
--     → subquery on dsd_clinic_cases  (RLS re-check)
--         → dsd_clinic_cases (cases_parent_read_child)
--             → subquery on learners  (RLS re-check) → …
--   classrooms          (classrooms_parent_read_roster)
--     → subquery on roster_links      (RLS re-check)
--         → roster_links (roster_read_school / roster_admin_write /
--                         roster_teacher_write_own_class)
--             → subquery on classrooms (RLS re-check) → …
--
-- PostgreSQL plans every policy USING expression that can be true
-- for the caller; STABLE helper calls cannot be constant-folded, so
-- the planner enters the cycle regardless of role and aborts.
--
-- Fix: route the cross-table lookups that close each cycle through
-- SECURITY DEFINER helpers (owner = postgres, RLS-bypassing, and
-- never inlined by the planner). Policy subqueries then never
-- re-enter another table's RLS checks, so no cycle remains.
-- ============================================================

-- ------------------------------------------------------------------
-- Helpers (SECURITY DEFINER · search_path locked · no PUBLIC exec)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.learner_has_consented_case_in_zone(
    p_learner uuid,
    p_zone    text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT EXISTS (
    SELECT 1 FROM public.dsd_clinic_cases c
    WHERE c.learner_id = p_learner AND c.district_zone = p_zone
) $$;

CREATE OR REPLACE FUNCTION public.learner_belongs_to_parent(
    p_learner uuid,
    p_parent  uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT EXISTS (
    SELECT 1 FROM public.learners l
    WHERE l.learner_id = p_learner AND l.parent_id = p_parent
) $$;

CREATE OR REPLACE FUNCTION public.parent_has_class(
    p_parent uuid,
    p_class  uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT EXISTS (
    SELECT 1 FROM public.roster_links r
    JOIN public.learners l ON l.learner_id = r.learner_id
    WHERE r.class_id = p_class AND l.parent_id = p_parent
) $$;

CREATE OR REPLACE FUNCTION public.class_belongs_to_school(
    p_class  uuid,
    p_school uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT EXISTS (
    SELECT 1 FROM public.classrooms c
    WHERE c.class_id = p_class AND c.school_id = p_school
) $$;

CREATE OR REPLACE FUNCTION public.class_belongs_to_teacher(
    p_class    uuid,
    p_teacher  uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT EXISTS (
    SELECT 1 FROM public.classrooms c
    WHERE c.class_id = p_class AND c.teacher_id = p_teacher
) $$;

REVOKE ALL ON FUNCTION public.learner_has_consented_case_in_zone(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.learner_belongs_to_parent(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.parent_has_class(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.class_belongs_to_school(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.class_belongs_to_teacher(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.learner_has_consented_case_in_zone(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.learner_belongs_to_parent(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.parent_has_class(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.class_belongs_to_school(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.class_belongs_to_teacher(uuid, uuid) TO authenticated;

-- ------------------------------------------------------------------
-- learners → dsd_clinic_cases  (break cycle edge)
-- ------------------------------------------------------------------
DROP POLICY IF EXISTS learners_agency_read_consented ON public.learners;
CREATE POLICY learners_agency_read_consented ON public.learners FOR SELECT TO authenticated USING (
    public.is_agency_user()
    AND parent_consent_popia = TRUE
    AND public.learner_has_consented_case_in_zone(learner_id, public.app_district_zone())
);

-- ------------------------------------------------------------------
-- dsd_clinic_cases → learners  (single direction, no cycle after the
-- above, but kept SD for consistency + to avoid future regressions)
-- ------------------------------------------------------------------
DROP POLICY IF EXISTS cases_parent_read_child ON public.dsd_clinic_cases;
CREATE POLICY cases_parent_read_child ON public.dsd_clinic_cases FOR SELECT TO authenticated USING (
    public.app_role() = 'PARENT'
    AND public.learner_belongs_to_parent(learner_id, public.app_parent_id())
);

-- ------------------------------------------------------------------
-- classrooms → roster_links / learners  (break cycle edge)
-- ------------------------------------------------------------------
DROP POLICY IF EXISTS classrooms_parent_read_roster ON public.classrooms;
CREATE POLICY classrooms_parent_read_roster ON public.classrooms FOR SELECT TO authenticated USING (
    public.app_role() = 'PARENT'
    AND public.parent_has_class(public.app_parent_id(), class_id)
);

-- ------------------------------------------------------------------
-- roster_links → classrooms  (single direction after the above)
-- ------------------------------------------------------------------
DROP POLICY IF EXISTS roster_read_school ON public.roster_links;
CREATE POLICY roster_read_school ON public.roster_links FOR SELECT TO authenticated USING (
    public.is_school_staff()
    AND public.class_belongs_to_school(class_id, public.app_school_id())
);

DROP POLICY IF EXISTS roster_admin_write ON public.roster_links;
CREATE POLICY roster_admin_write ON public.roster_links FOR ALL TO authenticated USING (
    public.app_role() = 'SCHOOLADMIN'
    AND public.class_belongs_to_school(class_id, public.app_school_id())
) WITH CHECK (
    public.class_belongs_to_school(class_id, public.app_school_id())
);

DROP POLICY IF EXISTS roster_teacher_write_own_class ON public.roster_links;
CREATE POLICY roster_teacher_write_own_class ON public.roster_links FOR ALL TO authenticated USING (
    public.app_role() = 'TEACHER'
    AND public.class_belongs_to_teacher(class_id, auth.uid())
) WITH CHECK (
    public.class_belongs_to_teacher(class_id, auth.uid())
);
