-- ============================================================
-- EDULINK · 0003 — Row-Level Security & tenant isolation
--
-- Policy matrix:
--   SUPERADMIN                         -> unrestricted
--   TEACHER / SCHOOLADMIN              -> records whose school_id = own JWT school_id
--   PARENT                             -> records tied via FK to own parent_id
--   CLINIC_USER / DSD_USER             -> dsd_clinic_cases in own district_zone AND learner consent TRUE
--
-- Helpers are SECURITY DEFINER (owner = postgres, RLS-bypassing) so policy
-- expressions can read the caller's profile without recursion.
-- ============================================================

-- ------------------------------------------------------------------
-- Tenant context helpers
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT role::text FROM public.users WHERE user_id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.app_school_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT school_id FROM public.users WHERE user_id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.app_parent_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT parent_id FROM public.parents WHERE user_id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.app_district_zone()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT district_zone FROM public.users WHERE user_id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT COALESCE((SELECT role FROM public.users WHERE user_id = auth.uid()) = 'SUPERADMIN', FALSE) $$;

-- staff roles bound to a school tenant
CREATE OR REPLACE FUNCTION public.is_school_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT COALESCE((SELECT role FROM public.users WHERE user_id = auth.uid()) IN ('TEACHER','SCHOOLADMIN'), FALSE) $$;

-- clinic / DSD agency roles
CREATE OR REPLACE FUNCTION public.is_agency_user()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT COALESCE((SELECT role FROM public.users WHERE user_id = auth.uid()) IN ('CLINIC_USER','DSD_USER'), FALSE) $$;

-- Consent guard used by agency policies: case must sit in the caller's zone
-- and the learner's POPIA consent must be TRUE.
CREATE OR REPLACE FUNCTION public.case_visible_to_agency(p_case dsd_clinic_cases)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$
    SELECT p_case.district_zone = public.app_district_zone()
       AND EXISTS (
            SELECT 1 FROM public.learners l
            WHERE l.learner_id = p_case.learner_id AND l.parent_consent_popia = TRUE
       )
$$;

-- ============================================================
-- ENABLE RLS ON ALL LAYERS
-- ============================================================
ALTER TABLE public.schools             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parents             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learners            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classrooms          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roster_links        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dsd_clinic_cases    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_lockouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_notifications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_imports        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_reveal_log  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.address_reveal_log  ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- schools
-- ============================================================
CREATE POLICY schools_superadmin_all     ON public.schools FOR ALL      TO authenticated USING (public.is_superadmin());
CREATE POLICY schools_staff_read_own     ON public.schools FOR SELECT  TO authenticated USING (school_id = public.app_school_id());
CREATE POLICY schools_parent_read_own    ON public.schools FOR SELECT  TO authenticated USING (
    public.app_role() = 'PARENT'
    AND school_id IN (
        SELECT l.school_id FROM public.learners l WHERE l.parent_id = public.app_parent_id()
    )
);

-- ============================================================
-- users (contact data — POPIA critical)
-- ============================================================
CREATE POLICY users_superadmin_all   ON public.users FOR ALL     TO authenticated USING (public.is_superadmin());
CREATE POLICY users_read_same_school ON public.users FOR SELECT TO authenticated USING (
    school_id = public.app_school_id() OR user_id = auth.uid()
);
CREATE POLICY users_insert_self ON public.users FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());
CREATE POLICY users_update_same_school ON public.users FOR UPDATE TO authenticated
USING (school_id = public.app_school_id() OR user_id = auth.uid())
WITH CHECK (
    (school_id = public.app_school_id() OR user_id = auth.uid())
    AND (role = public.app_role() OR public.is_superadmin())  -- no cross-role write
);
CREATE POLICY users_delete_same_school ON public.users FOR DELETE TO authenticated
USING (school_id = public.app_school_id() AND public.is_school_staff());

-- ============================================================
-- parents
-- ============================================================
CREATE POLICY parents_superadmin_all ON public.parents FOR ALL TO authenticated USING (public.is_superadmin());
CREATE POLICY parents_read_self      ON public.parents FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY parents_read_school_roster ON public.parents FOR SELECT TO authenticated USING (
    public.is_school_staff()
    AND parent_id IN (
        SELECT l.parent_id FROM public.learners l WHERE l.school_id = public.app_school_id()
    )
);
CREATE POLICY parents_insert_self ON public.parents FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());
CREATE POLICY parents_update_own_basic ON public.parents FOR UPDATE TO authenticated
USING (user_id = auth.uid());

-- ============================================================
-- learners (minor-child profiles)
-- ============================================================
CREATE POLICY learners_superadmin_all ON public.learners FOR ALL TO authenticated USING (public.is_superadmin());
CREATE POLICY learners_staff_all_own_school ON public.learners FOR ALL TO authenticated USING (
    public.is_school_staff() AND school_id = public.app_school_id()
);
CREATE POLICY learners_parent_read_write ON public.learners FOR SELECT TO authenticated USING (
    public.app_role() = 'PARENT' AND parent_id = public.app_parent_id()
);
CREATE POLICY learners_parent_update_consent ON public.learners FOR UPDATE TO authenticated USING (
    public.app_role() = 'PARENT' AND parent_id = public.app_parent_id()
);
CREATE POLICY learners_agency_read_consented ON public.learners FOR SELECT TO authenticated USING (
    public.is_agency_user()
    AND parent_consent_popia = TRUE
    AND learner_id IN (
        SELECT c.learner_id FROM public.dsd_clinic_cases c
        WHERE c.district_zone = public.app_district_zone()
    )
);

-- ============================================================
-- classrooms
-- ============================================================
CREATE POLICY classrooms_superadmin_all ON public.classrooms FOR ALL TO authenticated USING (public.is_superadmin());
CREATE POLICY classrooms_read_school ON public.classrooms FOR SELECT TO authenticated USING (
    school_id = public.app_school_id()
);
CREATE POLICY classrooms_parent_read_roster ON public.classrooms FOR SELECT TO authenticated USING (
    public.app_role() = 'PARENT'
    AND class_id IN (
        SELECT r.class_id FROM public.roster_links r
        JOIN public.learners l ON l.learner_id = r.learner_id
        WHERE l.parent_id = public.app_parent_id()
    )
);
CREATE POLICY classrooms_admin_write ON public.classrooms FOR INSERT TO authenticated WITH CHECK (
    public.app_role() = 'SCHOOLADMIN' AND school_id = public.app_school_id()
);
CREATE POLICY classrooms_admin_update ON public.classrooms FOR UPDATE TO authenticated USING (
    public.app_role() = 'SCHOOLADMIN' AND school_id = public.app_school_id()
) WITH CHECK (school_id = public.app_school_id());
CREATE POLICY classrooms_admin_delete ON public.classrooms FOR DELETE TO authenticated USING (
    public.app_role() = 'SCHOOLADMIN' AND school_id = public.app_school_id()
);
CREATE POLICY classrooms_teacher_write_own ON public.classrooms FOR ALL TO authenticated USING (
    public.app_role() = 'TEACHER' AND teacher_id = auth.uid() AND school_id = public.app_school_id()
) WITH CHECK (teacher_id = auth.uid() AND school_id = public.app_school_id());

-- ============================================================
-- roster_links
-- ============================================================
CREATE POLICY roster_superadmin_all ON public.roster_links FOR ALL TO authenticated USING (public.is_superadmin());
CREATE POLICY roster_read_school ON public.roster_links FOR SELECT TO authenticated USING (
    public.is_school_staff()
    AND class_id IN (SELECT class_id FROM public.classrooms WHERE school_id = public.app_school_id())
);
CREATE POLICY roster_parent_read_child ON public.roster_links FOR SELECT TO authenticated USING (
    public.app_role() = 'PARENT'
    AND learner_id IN (SELECT learner_id FROM public.learners WHERE parent_id = public.app_parent_id())
);
CREATE POLICY roster_admin_write ON public.roster_links FOR ALL TO authenticated USING (
    public.app_role() = 'SCHOOLADMIN'
    AND class_id IN (SELECT class_id FROM public.classrooms WHERE school_id = public.app_school_id())
) WITH CHECK (
    class_id IN (SELECT class_id FROM public.classrooms WHERE school_id = public.app_school_id())
);
CREATE POLICY roster_teacher_write_own_class ON public.roster_links FOR ALL TO authenticated USING (
    public.app_role() = 'TEACHER'
    AND class_id IN (SELECT class_id FROM public.classrooms WHERE teacher_id = auth.uid())
) WITH CHECK (
    class_id IN (SELECT class_id FROM public.classrooms WHERE teacher_id = auth.uid())
);

-- ============================================================
-- attendance_log
-- ============================================================
CREATE POLICY att_superadmin_all ON public.attendance_log FOR ALL TO authenticated USING (public.is_superadmin());
CREATE POLICY att_read_school ON public.attendance_log FOR SELECT TO authenticated USING (
    public.is_school_staff()
    AND class_id IN (SELECT class_id FROM public.classrooms WHERE school_id = public.app_school_id())
);
CREATE POLICY att_teacher_write_own_class ON public.attendance_log FOR ALL TO authenticated USING (
    public.app_role() = 'TEACHER'
    AND class_id IN (SELECT class_id FROM public.classrooms WHERE teacher_id = auth.uid())
) WITH CHECK (
    class_id IN (SELECT class_id FROM public.classrooms WHERE teacher_id = auth.uid())
);
CREATE POLICY att_admin_write_school ON public.attendance_log FOR ALL TO authenticated USING (
    public.app_role() = 'SCHOOLADMIN'
    AND class_id IN (SELECT class_id FROM public.classrooms WHERE school_id = public.app_school_id())
) WITH CHECK (
    class_id IN (SELECT class_id FROM public.classrooms WHERE school_id = public.app_school_id())
);
CREATE POLICY att_parent_read_child ON public.attendance_log FOR SELECT TO authenticated USING (
    public.app_role() = 'PARENT'
    AND learner_id IN (SELECT learner_id FROM public.learners WHERE parent_id = public.app_parent_id())
);
CREATE POLICY att_agency_read_consented ON public.attendance_log FOR SELECT TO authenticated USING (
    public.is_agency_user()
    AND learner_id IN (SELECT learner_id FROM public.learners WHERE parent_consent_popia = TRUE)
    AND learner_id IN (SELECT learner_id FROM public.dsd_clinic_cases WHERE district_zone = public.app_district_zone())
);

-- ============================================================
-- assignments / submissions / grades
-- ============================================================
CREATE POLICY asg_superadmin_all ON public.assignments FOR ALL TO authenticated USING (public.is_superadmin());
CREATE POLICY asg_read_school ON public.assignments FOR SELECT TO authenticated USING (
    public.is_school_staff()
    AND class_id IN (SELECT class_id FROM public.classrooms WHERE school_id = public.app_school_id())
);
CREATE POLICY asg_teacher_write_own ON public.assignments FOR ALL TO authenticated USING (
    public.app_role() = 'TEACHER'
    AND class_id IN (SELECT class_id FROM public.classrooms WHERE teacher_id = auth.uid())
) WITH CHECK (
    class_id IN (SELECT class_id FROM public.classrooms WHERE teacher_id = auth.uid())
);
CREATE POLICY asg_admin_write ON public.assignments FOR ALL TO authenticated USING (
    public.app_role() = 'SCHOOLADMIN'
    AND class_id IN (SELECT class_id FROM public.classrooms WHERE school_id = public.app_school_id())
) WITH CHECK (
    class_id IN (SELECT class_id FROM public.classrooms WHERE school_id = public.app_school_id())
);
CREATE POLICY asg_parent_read_child ON public.assignments FOR SELECT TO authenticated USING (
    public.app_role() = 'PARENT'
    AND class_id IN (
        SELECT r.class_id FROM public.roster_links r
        JOIN public.learners l ON l.learner_id = r.learner_id
        WHERE l.parent_id = public.app_parent_id()
    )
);

CREATE POLICY sub_superadmin_all ON public.submissions FOR ALL TO authenticated USING (public.is_superadmin());
CREATE POLICY sub_read_school ON public.submissions FOR SELECT TO authenticated USING (
    public.is_school_staff()
    AND assignment_id IN (
        SELECT a.assignment_id FROM public.assignments a
        JOIN public.classrooms c ON c.class_id = a.class_id
        WHERE c.school_id = public.app_school_id()
    )
);
CREATE POLICY sub_teacher_write_own ON public.submissions FOR ALL TO authenticated USING (
    public.app_role() = 'TEACHER'
    AND assignment_id IN (
        SELECT a.assignment_id FROM public.assignments a
        JOIN public.classrooms c ON c.class_id = a.class_id
        WHERE c.teacher_id = auth.uid()
    )
) WITH CHECK (
    assignment_id IN (
        SELECT a.assignment_id FROM public.assignments a
        JOIN public.classrooms c ON c.class_id = a.class_id
        WHERE c.teacher_id = auth.uid()
    )
);
CREATE POLICY sub_parent_read_child ON public.submissions FOR SELECT TO authenticated USING (
    public.app_role() = 'PARENT'
    AND learner_id IN (SELECT learner_id FROM public.learners WHERE parent_id = public.app_parent_id())
);

CREATE POLICY grd_superadmin_all ON public.grades FOR ALL TO authenticated USING (public.is_superadmin());
CREATE POLICY grd_read_school ON public.grades FOR SELECT TO authenticated USING (
    public.is_school_staff()
    AND submission_id IN (
        SELECT s.submission_id FROM public.submissions s
        JOIN public.assignments a ON a.assignment_id = s.assignment_id
        JOIN public.classrooms c ON c.class_id = a.class_id
        WHERE c.school_id = public.app_school_id()
    )
);
CREATE POLICY grd_teacher_write_own ON public.grades FOR ALL TO authenticated USING (
    public.app_role() = 'TEACHER'
    AND submission_id IN (
        SELECT s.submission_id FROM public.submissions s
        JOIN public.assignments a ON a.assignment_id = s.assignment_id
        JOIN public.classrooms c ON c.class_id = a.class_id
        WHERE c.teacher_id = auth.uid()
    )
) WITH CHECK (
    submission_id IN (
        SELECT s.submission_id FROM public.submissions s
        JOIN public.assignments a ON a.assignment_id = s.assignment_id
        JOIN public.classrooms c ON c.class_id = a.class_id
        WHERE c.teacher_id = auth.uid()
    )
);
CREATE POLICY grd_parent_read_child ON public.grades FOR SELECT TO authenticated USING (
    public.app_role() = 'PARENT'
    AND submission_id IN (
        SELECT s.submission_id FROM public.submissions s
        WHERE s.learner_id IN (SELECT learner_id FROM public.learners WHERE parent_id = public.app_parent_id())
    )
);

-- ============================================================
-- dsd_clinic_cases  (agency zone + POPIA consent gating)
-- ============================================================
CREATE POLICY cases_superadmin_all ON public.dsd_clinic_cases FOR ALL TO authenticated USING (public.is_superadmin());
CREATE POLICY cases_agency_zone_read ON public.dsd_clinic_cases FOR SELECT TO authenticated USING (
    public.is_agency_user() AND public.case_visible_to_agency(dsd_clinic_cases)
);
CREATE POLICY cases_agency_zone_insert ON public.dsd_clinic_cases FOR INSERT TO authenticated
WITH CHECK (
    public.is_agency_user() AND district_zone = public.app_district_zone()
);
CREATE POLICY cases_agency_zone_update ON public.dsd_clinic_cases FOR UPDATE TO authenticated
USING (public.is_agency_user() AND public.case_visible_to_agency(dsd_clinic_cases))
WITH CHECK (
    district_zone = public.app_district_zone()
);
CREATE POLICY cases_parent_read_child ON public.dsd_clinic_cases FOR SELECT TO authenticated USING (
    public.app_role() = 'PARENT'
    AND learner_id IN (SELECT learner_id FROM public.learners WHERE parent_id = public.app_parent_id())
);

-- ============================================================
-- attendance_lockouts (written by watchdog service role; read by staff)
-- ============================================================
CREATE POLICY lock_superadmin_all ON public.attendance_lockouts FOR ALL TO authenticated USING (public.is_superadmin());
CREATE POLICY lock_staff_read_school ON public.attendance_lockouts FOR SELECT TO authenticated USING (
    public.is_school_staff() AND school_id = public.app_school_id()
);

-- ============================================================
-- app_notifications
-- ============================================================
CREATE POLICY notif_superadmin_all ON public.app_notifications FOR ALL TO authenticated USING (public.is_superadmin());
CREATE POLICY notif_staff_read_write ON public.app_notifications FOR ALL TO authenticated USING (
    public.is_school_staff() AND school_id = public.app_school_id()
) WITH CHECK (school_id = public.app_school_id());
CREATE POLICY notif_parent_read ON public.app_notifications FOR SELECT TO authenticated USING (
    public.app_role() = 'PARENT'
    AND (
        school_id IN (SELECT l.school_id FROM public.learners l WHERE l.parent_id = public.app_parent_id())
        OR learner_id IN (SELECT learner_id FROM public.learners WHERE parent_id = public.app_parent_id())
    )
);

-- ============================================================
-- billing_events / data_imports / reveal logs — service-role & superadmin only
-- ============================================================
CREATE POLICY billing_superadmin_read ON public.billing_events FOR SELECT TO authenticated USING (public.is_superadmin());
CREATE POLICY imports_superadmin_all  ON public.data_imports FOR ALL TO authenticated USING (public.is_superadmin());
CREATE POLICY imports_staff_read_write ON public.data_imports FOR ALL TO authenticated USING (
    public.is_school_staff() AND school_id = public.app_school_id()
) WITH CHECK (school_id = public.app_school_id());
CREATE POLICY reveal_superadmin_read ON public.contact_reveal_log FOR SELECT TO authenticated USING (public.is_superadmin());
CREATE POLICY addr_superadmin_read ON public.address_reveal_log FOR SELECT TO authenticated USING (public.is_superadmin());
