-- EDULINK · combined migrations 0001-0005 · run top-to-bottom in Supabase SQL Editor

-- ===== 0001_extensions.sql =====
-- ============================================================
-- EDULINK · 0001 — Extensions
-- Run order matters: 0001 -> 0002 -> 0003 -> 0004 -> 0005
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- gen_random_uuid() / uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- crypt(), gen_salt(), digests

-- ===== 0002_schema.sql =====
-- ============================================================
-- EDULINK · 0002 — Core DDL (spec tables + operational support tables)
-- Multi-Tenant School Management · LMS · Public Health Net · DSD
-- ============================================================

CREATE TABLE IF NOT EXISTS schools (
    school_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    emis_number VARCHAR(100) UNIQUE NOT NULL,
    province VARCHAR(100) DEFAULT 'Western Cape',
    commercial_status VARCHAR(50) DEFAULT 'ACTIVE',
    billing_type VARCHAR(50) DEFAULT 'R20_MONTHLY',
    next_billing_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- district_zone: added for CLINIC_USER / DSD_USER zone scoping (RLS requirement)
CREATE TABLE IF NOT EXISTS users (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    school_id UUID REFERENCES schools(school_id) ON DELETE CASCADE,
    role VARCHAR(50) CHECK (role IN ('SUPERADMIN', 'SCHOOLADMIN', 'TEACHER', 'PARENT', 'CLINIC_USER', 'DSD_USER')),
    full_name VARCHAR(255) NOT NULL,
    cell_number VARCHAR(50) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    district_zone VARCHAR(100) DEFAULT 'WESTERN_CAPE',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parents (
    parent_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    billing_status VARCHAR(50) DEFAULT 'UNPAID',
    yearly_expiry_date DATE,
    payment_reference VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS learners (
    learner_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES schools(school_id) ON DELETE CASCADE,
    parent_id UUID REFERENCES parents(parent_id) ON DELETE SET NULL,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    grade INT NOT NULL,
    class_section VARCHAR(10) NOT NULL,
    sa_sams_id VARCHAR(100),
    cemis_id VARCHAR(100),
    exempt_status BOOLEAN DEFAULT FALSE,
    chronic_tag VARCHAR(100) DEFAULT NULL,
    parent_consent_popia BOOLEAN DEFAULT FALSE,
    home_address TEXT
);

CREATE TABLE IF NOT EXISTS classrooms (
    class_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES schools(school_id) ON DELETE CASCADE,
    teacher_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    subject_name VARCHAR(255) NOT NULL,
    grade INT NOT NULL
);

CREATE TABLE IF NOT EXISTS roster_links (
    link_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID REFERENCES classrooms(class_id) ON DELETE CASCADE,
    learner_id UUID REFERENCES learners(learner_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attendance_log (
    attendance_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID REFERENCES classrooms(class_id) ON DELETE CASCADE,
    learner_id UUID REFERENCES learners(learner_id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(50) CHECK (status IN ('PRESENT', 'ABSENT', 'LATE')),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notification_sent BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS assignments (
    assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID REFERENCES classrooms(class_id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    max_points INT NOT NULL,
    due_date TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS submissions (
    submission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID REFERENCES assignments(assignment_id) ON DELETE CASCADE,
    learner_id UUID REFERENCES learners(learner_id) ON DELETE CASCADE,
    file_url TEXT,
    status VARCHAR(50) DEFAULT 'PENDING',
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grades (
    grade_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID REFERENCES submissions(submission_id) ON DELETE CASCADE,
    score_achieved INT NOT NULL,
    feedback_text TEXT,
    graded_by UUID REFERENCES users(user_id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dsd_clinic_cases (
    case_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES schools(school_id) ON DELETE CASCADE,
    learner_id UUID REFERENCES learners(learner_id) ON DELETE CASCADE,
    trigger_date DATE DEFAULT CURRENT_DATE,
    chronic_badge VARCHAR(100),
    caregiver_stability_index VARCHAR(100) DEFAULT 'PENDING',
    primary_risk_assessment VARCHAR(255) DEFAULT 'UNASSIGNED',
    form_22_filed BOOLEAN DEFAULT FALSE,
    case_notes TEXT,
    case_status VARCHAR(50) DEFAULT 'INBOUND_INTAKE',
    assigned_worker_id UUID REFERENCES users(user_id),
    resolved_at TIMESTAMP WITH TIME ZONE,
    district_zone VARCHAR(100) DEFAULT 'WESTERN_CAPE',
    push_notified_at TIMESTAMP WITH TIME ZONE
);

-- ============================================================
-- Operational support tables (outside the core spec tables)
-- ============================================================

CREATE TABLE IF NOT EXISTS attendance_lockouts (
    lockout_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES classrooms(class_id) ON DELETE CASCADE,
    school_id UUID NOT NULL REFERENCES schools(school_id) ON DELETE CASCADE,
    lockout_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT 'LOCKED' CHECK (status IN ('LOCKED', 'RELEASED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (class_id, lockout_date)
);

CREATE TABLE IF NOT EXISTS app_notifications (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES schools(school_id) ON DELETE CASCADE,
    learner_id UUID REFERENCES learners(learner_id) ON DELETE CASCADE,
    audience VARCHAR(20) DEFAULT 'SCHOOL' CHECK (audience IN ('SCHOOL', 'TEACHERS', 'PARENTS', 'ALL')),
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    link_url TEXT,
    created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS billing_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(20) DEFAULT 'PAYFAST',
    provider_payment_id VARCHAR(100) UNIQUE,
    entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('SCHOOL', 'PARENT')),
    entity_id UUID NOT NULL,
    amount_charged INT,
    status VARCHAR(50),
    raw_payload JSONB,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_imports (
    import_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES schools(school_id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    source_system VARCHAR(20) CHECK (source_system IN ('SA_SAMS', 'CEMIS')),
    rows_parsed INT DEFAULT 0,
    rows_created INT DEFAULT 0,
    rows_updated INT DEFAULT 0,
    errors JSONB,
    status VARCHAR(20) DEFAULT 'PROCESSING' CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED')),
    imported_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_reveal_log (
    reveal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    revealed_by UUID REFERENCES users(user_id) ON DELETE CASCADE,
    target_user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS address_reveal_log (
    reveal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    revealed_by UUID REFERENCES users(user_id) ON DELETE CASCADE,
    learner_id UUID REFERENCES learners(learner_id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- Indexes (tenant + hot-path lookups)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_users_school     ON users(school_id);
CREATE INDEX IF NOT EXISTS idx_users_role       ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_zone       ON users(district_zone);
CREATE INDEX IF NOT EXISTS idx_learners_school  ON learners(school_id);
CREATE INDEX IF NOT EXISTS idx_learners_parent  ON learners(parent_id);
CREATE INDEX IF NOT EXISTS idx_learners_sams    ON learners(sa_sams_id);
CREATE INDEX IF NOT EXISTS idx_learners_cemis   ON learners(cemis_id);
CREATE INDEX IF NOT EXISTS idx_learners_grade   ON learners(school_id, grade);
CREATE INDEX IF NOT EXISTS idx_classes_school   ON classrooms(school_id);
CREATE INDEX IF NOT EXISTS idx_classes_teacher  ON classrooms(teacher_id);
CREATE INDEX IF NOT EXISTS idx_roster_class     ON roster_links(class_id);
CREATE INDEX IF NOT EXISTS idx_roster_learner   ON roster_links(learner_id);
CREATE INDEX IF NOT EXISTS idx_att_class_date   ON attendance_log(class_id, date);
CREATE INDEX IF NOT EXISTS idx_att_learner_date ON attendance_log(learner_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_assign_class     ON assignments(class_id, due_date);
CREATE INDEX IF NOT EXISTS idx_subm_assign      ON submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_grades_subm      ON grades(submission_id);
CREATE INDEX IF NOT EXISTS idx_cases_zone       ON dsd_clinic_cases(district_zone, case_status);
CREATE INDEX IF NOT EXISTS idx_cases_learner    ON dsd_clinic_cases(learner_id);
CREATE INDEX IF NOT EXISTS idx_cases_status     ON dsd_clinic_cases(case_status);
CREATE INDEX IF NOT EXISTS idx_lockouts_active  ON attendance_lockouts(class_id, lockout_date) WHERE status = 'LOCKED';
CREATE INDEX IF NOT EXISTS idx_notif_school     ON app_notifications(school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_imports_school   ON data_imports(school_id, created_at DESC);

-- ============================================================
-- Storage bucket for SA-SAMS / CEMIS uploads (private)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('imports', 'imports', FALSE)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "imports_staff_upload_own_school"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'imports'
    AND (SELECT role FROM public.users WHERE user_id = auth.uid()) IN ('SCHOOLADMIN', 'TEACHER', 'SUPERADMIN')
    AND storage.foldername(name)[1] = (SELECT school_id::text FROM public.users WHERE user_id = auth.uid())
);

-- ===== 0003_rls.sql =====
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

-- ===== 0004_functions_triggers.sql =====
-- ============================================================
-- EDULINK · 0004 — Triggers, guards & RPCs
-- ============================================================

-- ------------------------------------------------------------------
-- updated_at maintenance
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_grades_updated_at ON public.grades;
CREATE TRIGGER trg_grades_updated_at BEFORE UPDATE ON public.grades
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------------
-- Auto-provision public.users row when an auth user is created.
-- Role / school / zone come from raw_user_meta_data so admins can
-- provision accounts through the Supabase Admin API or the seed script.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_role   text    := COALESCE(NEW.raw_user_meta_data->>'role', 'PARENT');
    v_school uuid    := NULLIF(NEW.raw_user_meta_data->>'school_id', '')::uuid;
    v_zone   text    := COALESCE(NEW.raw_user_meta_data->>'district_zone', 'WESTERN_CAPE');
    v_name   text    := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
    v_cell   text    := COALESCE(NEW.raw_user_meta_data->>'cell_number', '0000000000');
BEGIN
    IF EXISTS (SELECT 1 FROM public.users WHERE user_id = NEW.id) THEN
        RETURN NEW;
    END IF;
    INSERT INTO public.users (user_id, school_id, role, full_name, cell_number, email, district_zone)
    VALUES (NEW.id, v_school, v_role, v_name, v_cell, NEW.email, v_zone);

    IF v_role = 'PARENT' THEN
        INSERT INTO public.parents (user_id) VALUES (NEW.id);
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------------
-- Guard 1: no role escalation / role drift by non-superadmins
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_role_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_superadmin() THEN
        RAISE EXCEPTION 'Role changes are restricted to SUPERADMIN';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_users_role_guard ON public.users;
CREATE TRIGGER trg_users_role_guard BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.guard_role_changes();

-- ------------------------------------------------------------------
-- Guard 2: parents may only touch the POPIA consent flag on learners
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_parent_learner_edit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF public.app_role() = 'PARENT' AND NEW IS DISTINCT FROM OLD
       AND (NEW.parent_consent_popia IS DISTINCT FROM OLD.parent_consent_popia
            OR (NEW.parent_consent_popia = OLD.parent_consent_popia)) THEN
        -- allow only consent column changes for PARENT role
        IF NEW.first_name <> OLD.first_name OR NEW.last_name <> OLD.last_name
           OR NEW.grade <> OLD.grade OR NEW.class_section <> OLD.class_section
           OR NEW.school_id IS DISTINCT FROM OLD.school_id
           OR NEW.exempt_status IS DISTINCT FROM OLD.exempt_status
           OR NEW.chronic_tag IS DISTINCT FROM OLD.chronic_tag
           OR NEW.home_address IS DISTINCT FROM OLD.home_address THEN
            RAISE EXCEPTION 'Parents may only update POPIA consent for their children';
        END IF;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_learners_parent_guard ON public.learners;
CREATE TRIGGER trg_learners_parent_guard BEFORE UPDATE ON public.learners
FOR EACH ROW EXECUTE FUNCTION public.guard_parent_learner_edit();

-- ------------------------------------------------------------------
-- Guard 3: billing fields on parents are system-managed (PayFast webhook)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_parent_billing()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT public.is_superadmin()
       AND (NEW.billing_status IS DISTINCT FROM OLD.billing_status
            OR NEW.yearly_expiry_date IS DISTINCT FROM OLD.yearly_expiry_date
            OR NEW.payment_reference IS DISTINCT FROM OLD.payment_reference) THEN
        RAISE EXCEPTION 'Billing fields are system-managed via the PayFast webhook';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_parents_billing_guard ON public.parents;
CREATE TRIGGER trg_parents_billing_guard BEFORE UPDATE ON public.parents
FOR EACH ROW EXECUTE FUNCTION public.guard_parent_billing();

-- ------------------------------------------------------------------
-- Guard 4: a DSD/clinic case may never be opened without POPIA consent
-- (defence in depth behind the 72-hour tracker + edge function checks)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_case_consent()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_consent boolean;
BEGIN
    SELECT parent_consent_popia INTO v_consent
    FROM public.learners WHERE learner_id = NEW.learner_id;
    IF COALESCE(v_consent, FALSE) = FALSE THEN
        RAISE EXCEPTION 'Cannot open a case: parent_consent_popia is FALSE for learner %', NEW.learner_id;
    END IF;
    IF NEW.case_status IN ('RESOLVED', 'CLOSED') AND NEW.resolved_at IS NULL THEN
        NEW.resolved_at = NOW();
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cases_consent_guard ON public.dsd_clinic_cases;
CREATE TRIGGER trg_cases_consent_guard BEFORE INSERT OR UPDATE ON public.dsd_clinic_cases
FOR EACH ROW EXECUTE FUNCTION public.guard_case_consent();

-- ------------------------------------------------------------------
-- Guard 5: classroom teacher must belong to the same school tenant
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_classroom_teacher()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.teacher_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.users
            WHERE user_id = NEW.teacher_id AND school_id = NEW.school_id AND role = 'TEACHER'
        ) THEN
            RAISE EXCEPTION 'Teacher must belong to the same school and hold the TEACHER role';
        END IF;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_classrooms_teacher_guard ON public.classrooms;
CREATE TRIGGER trg_classrooms_teacher_guard BEFORE INSERT OR UPDATE ON public.classrooms
FOR EACH ROW EXECUTE FUNCTION public.guard_classroom_teacher();

-- ------------------------------------------------------------------
-- Lockout auto-release: submitting any attendance for a class+date
-- clears the watchdog lockout for that class+date.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_lockout_on_submit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE public.attendance_lockouts
    SET status = 'RELEASED'
    WHERE class_id = NEW.class_id AND lockout_date = NEW.date AND status = 'LOCKED';
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_attendance_release_lockout ON public.attendance_log;
CREATE TRIGGER trg_attendance_release_lockout
AFTER INSERT ON public.attendance_log
FOR EACH ROW EXECUTE FUNCTION public.release_lockout_on_submit();

-- ------------------------------------------------------------------
-- RPC: active lockouts for a teacher (consumed by the UI gate)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_teacher_active_lockouts(p_teacher_id uuid DEFAULT auth.uid())
RETURNS TABLE (class_id uuid, label text, subject_name text, grade int, lockout_date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT l.class_id,
           c.subject_name || ' · Grade ' || c.grade AS label,
           c.subject_name, c.grade, l.lockout_date
    FROM public.attendance_lockouts l
    JOIN public.classrooms c ON c.class_id = l.class_id
    WHERE c.teacher_id = p_teacher_id
      AND l.status = 'LOCKED'
      AND l.lockout_date >= CURRENT_DATE - 1
    ORDER BY l.lockout_date DESC
$$;

-- ------------------------------------------------------------------
-- RPC: access eligibility — application lockouts for past-due billing
-- (bypass entirely when exempt_status = TRUE)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_access_eligibility()
RETURNS TABLE (allowed boolean, reason text, exempt boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_role   text := public.app_role();
    v_school uuid := public.app_school_id();
    v_parent uuid := public.app_parent_id();
    v_status text;
    v_exempt boolean := FALSE;
BEGIN
    IF v_role IS NULL THEN
        RETURN QUERY SELECT FALSE, 'PROFILE_NOT_FOUND', FALSE;
        RETURN;
    END IF;

    IF v_role = 'SUPERADMIN' OR v_role IN ('CLINIC_USER', 'DSD_USER') THEN
        RETURN QUERY SELECT TRUE, 'OK', FALSE;
        RETURN;
    END IF;

    IF v_role IN ('TEACHER', 'SCHOOLADMIN') THEN
        SELECT commercial_status INTO v_status FROM public.schools WHERE school_id = v_school;
        IF v_status = 'SUSPENDED' THEN
            RETURN QUERY SELECT FALSE, 'SCHOOL_SUSPENDED', FALSE;
        END IF;
        RETURN QUERY SELECT TRUE, 'OK', FALSE;
        RETURN;
    END IF;

    IF v_role = 'PARENT' THEN
        SELECT billing_status INTO v_status FROM public.parents WHERE parent_id = v_parent;
        SELECT COALESCE(bool_and(l.exempt_status), FALSE) INTO v_exempt
        FROM public.learners l WHERE l.parent_id = v_parent;

        IF COALESCE(v_status, 'UNPAID') IN ('PAST_DUE', 'SUSPENDED') AND v_exempt THEN
            RETURN QUERY SELECT TRUE, 'EXEMPT_BYPASS', TRUE;
            RETURN;
        END IF;
        IF COALESCE(v_status, 'UNPAID') IN ('PAST_DUE', 'SUSPENDED') THEN
            RETURN QUERY SELECT FALSE, 'PARENT_PAYMENT_PAST_DUE', FALSE;
            RETURN;
        END IF;
        RETURN QUERY SELECT TRUE, 'OK', FALSE;
        RETURN;
    END IF;

    RETURN QUERY SELECT TRUE, 'OK', FALSE;
END $$;

-- ------------------------------------------------------------------
-- RPC: billing reconciliation for a school portfolio
-- R20 / month per active NON-EXEMPT learner.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_school_billing(p_school_id uuid)
RETURNS TABLE (school_id uuid, active_learners bigint, billed_amount int, commercial_status text, next_billing_date date)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_active bigint;
    v_amount int;
    v_next date;
BEGIN
    SELECT COUNT(*) INTO v_active
    FROM public.learners
    WHERE school_id = p_school_id AND exempt_status = FALSE;

    v_amount := v_active * 20;                       -- R20/month per active non-exempt learner
    v_next   := date_trunc('month', NOW() + interval '1 month')::date;

    UPDATE public.schools
    SET next_billing_date = v_next
    WHERE school_id = p_school_id;

    RETURN QUERY
    SELECT p_school_id, v_active, v_amount, commercial_status, next_billing_date
    FROM public.schools WHERE school_id = p_school_id;
END $$;

-- ------------------------------------------------------------------
-- RPC: mark a parent subscription paid (R100 / year)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_parent_subscription_paid(
    p_parent_id uuid, p_payment_reference text, p_amount int
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE public.parents
    SET billing_status     = 'PAID',
        payment_reference  = COALESCE(p_payment_reference, payment_reference),
        yearly_expiry_date = GREATEST(
            COALESCE(yearly_expiry_date, CURRENT_DATE),
            CURRENT_DATE
        ) + interval '1 year'
    WHERE parent_id = p_parent_id;
END $$;

-- ------------------------------------------------------------------
-- RPC: reveal a masked home address for a home visit.
-- CLINIC_USER / DSD_USER only, restricted to their zone + consent case,
-- every unlock is written to address_reveal_log (manual override logging).
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unlock_address_for_visit(
    p_learner_id uuid, p_reason text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_address text;
    v_zone    text := public.app_district_zone();
    v_ok      boolean;
BEGIN
    IF public.app_role() NOT IN ('CLINIC_USER', 'DSD_USER') THEN
        RAISE EXCEPTION 'Only CLINIC_USER / DSD_USER may unlock addresses';
    END IF;
    SELECT EXISTS (
        SELECT 1 FROM public.dsd_clinic_cases c
        WHERE c.learner_id = p_learner_id AND c.district_zone = v_zone
    ) INTO v_ok;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'No case in your district zone for this learner';
    END IF;
    SELECT home_address INTO v_address FROM public.learners WHERE learner_id = p_learner_id;

    INSERT INTO public.address_reveal_log (revealed_by, learner_id, reason)
    VALUES (auth.uid(), p_learner_id, COALESCE(NULLIF(p_reason, ''), 'home_visit'));

    RETURN COALESCE(v_address, 'NO_ADDRESS_ON_FILE');
END $$;

-- ------------------------------------------------------------------
-- RPC: reveal a contact number with logged override
-- (school staff for their own school; agency for consent cases in zone)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reveal_contact_number(
    p_target_user_id uuid, p_reason text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_cell text;
    v_ok   boolean;
    v_role text := public.app_role();
BEGIN
    IF v_role = 'PARENT' THEN
        RAISE EXCEPTION 'PARENT accounts may not reveal contact numbers';
    END IF;

    IF v_role IN ('TEACHER', 'SCHOOLADMIN') THEN
        SELECT EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.user_id = p_target_user_id AND u.school_id = public.app_school_id()
        ) INTO v_ok;
    ELSE
        SELECT EXISTS (
            SELECT 1 FROM public.users u
            JOIN public.learners l ON l.parent_id IN (SELECT parent_id FROM public.parents WHERE user_id = p_target_user_id)
            JOIN public.dsd_clinic_cases c ON c.learner_id = l.learner_id
            WHERE u.user_id = p_target_user_id AND c.district_zone = public.app_district_zone()
        ) INTO v_ok;
    END IF;

    IF NOT COALESCE(v_ok, FALSE) THEN
        RAISE EXCEPTION 'Target contact is outside your authorised scope';
    END IF;

    SELECT cell_number INTO v_cell FROM public.users WHERE user_id = p_target_user_id;

    INSERT INTO public.contact_reveal_log (revealed_by, target_user_id, reason)
    VALUES (auth.uid(), p_target_user_id, COALESCE(NULLIF(p_reason, ''), 'operational_need'));

    RETURN v_cell;
END $$;

-- ------------------------------------------------------------------
-- RPC: SuperAdmin network metrics (map, revenue, system health)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_network_metrics()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_metrics jsonb;
BEGIN
    IF NOT public.is_superadmin() THEN
        RAISE EXCEPTION 'SUPERADMIN only';
    END IF;

    SELECT jsonb_build_object(
        'totals', jsonb_build_object(
            'schools',        (SELECT COUNT(*) FROM public.schools),
            'learners',       (SELECT COUNT(*) FROM public.learners),
            'active_cases',   (SELECT COUNT(*) FROM public.dsd_clinic_cases WHERE case_status NOT IN ('RESOLVED','CLOSED')),
            'teachers',       (SELECT COUNT(*) FROM public.users WHERE role = 'TEACHER'),
            'parents',        (SELECT COUNT(*) FROM public.parents),
            'monthly_mrr',    (SELECT COALESCE(SUM((SELECT COUNT(*) FROM public.learners l WHERE l.school_id = s.school_id AND l.exempt_status = FALSE) * 20), 0) FROM public.schools s WHERE s.commercial_status = 'ACTIVE'),
            'parent_annual',  (SELECT COALESCE(SUM(100), 0) FROM public.parents WHERE billing_status = 'PAID'),
            'suspended',      (SELECT COUNT(*) FROM public.schools WHERE commercial_status = 'SUSPENDED'),
            'today_absences', (SELECT COUNT(*) FROM public.attendance_log WHERE date = CURRENT_DATE AND status = 'ABSENT')
        ),
        'revenue_series', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'month', to_char(m, 'Mon'),
                'mrr',   (SELECT COUNT(*) * 20 FROM public.learners l
                          JOIN public.schools sc ON sc.school_id = l.school_id
                          WHERE l.exempt_status = FALSE AND sc.next_billing_date >= m),
                'parent_income', (SELECT COUNT(*) * 100 FROM public.parents p
                                  WHERE p.yearly_expiry_date >= m)
            ) ORDER BY m)
            FROM generate_series(date_trunc('month', NOW()) - interval '11 months', date_trunc('month', NOW()), interval '1 month') m
        ), '[]'::jsonb),
        'province_distribution', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('province', province, 'schools', cnt))
            FROM (SELECT province, COUNT(*) cnt FROM public.schools GROUP BY province) s
        ), '[]'::jsonb)
    ) INTO v_metrics;

    RETURN v_metrics;
END $$;

-- ===== 0005_seed.sql =====
-- ============================================================
-- EDULINK · 0005 — Seed data (public tables only)
-- Auth identities are provisioned by scripts/seed-auth.mjs
-- (the on_auth_user_created trigger provisions users + parents).
-- Linked records (learners/roster/attendance/cases) are created
-- by scripts/seed-data.mjs after auth users exist.
-- ============================================================

INSERT INTO schools (school_id, name, emis_number, province, commercial_status, billing_type, next_billing_date) VALUES
('11111111-1111-1111-1111-111111111111', 'Paarl Cyber Academy',      'WC-EDULINK-001', 'Western Cape', 'ACTIVE',    'R20_MONTHLY', DATE '2026-09-01'),
('22222222-2222-2222-2222-222222222222', 'Stellenbosch Digital High','WC-EDULINK-002', 'Western Cape', 'ACTIVE',    'R20_MONTHLY', DATE '2026-09-01'),
('33333333-3333-3333-3333-333333333333', 'Cape Town North Technical','WC-EDULINK-003', 'Western Cape', 'SUSPENDED', 'R20_MONTHLY', DATE '2026-08-01')
ON CONFLICT (emis_number) DO NOTHING;

-- Classrooms (teacher_id assigned by seed-data.mjs once auth users exist)
INSERT INTO classrooms (class_id, school_id, teacher_id, subject_name, grade) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '11111111-1111-1111-1111-111111111111', NULL, 'Mathematics',             11),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '11111111-1111-1111-1111-111111111111', NULL, 'Physical Science',        11),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '11111111-1111-1111-1111-111111111111', NULL, 'English Home Language',   10),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', '11111111-1111-1111-1111-111111111111', NULL, 'Life Orientation',        10),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', '22222222-2222-2222-2222-222222222222', NULL, 'Accounting',              11),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', '22222222-2222-2222-2222-222222222222', NULL, 'Computer Applications Technology', 10),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', '22222222-2222-2222-2222-222222222222', NULL, 'Mathematics',             9)
ON CONFLICT (class_id) DO NOTHING;

-- Assignments (LMS)
INSERT INTO assignments (assignment_id, class_id, title, description, max_points, due_date) VALUES
('cccccccc-cccc-cccc-cccc-ccccccccccc1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Quadratic Functions Problem Set',  'Factorisation + the quadratic formula, showing all working.', 50, NOW() + INTERVAL '7 days'),
('cccccccc-cccc-cccc-cccc-ccccccccccc2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Newton''s Laws Practical Write-up', 'Formal experiment write-up with data table and conclusion.', 100, NOW() + INTERVAL '10 days'),
('cccccccc-cccc-cccc-cccc-ccccccccccc3', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'Poetry Anthology Analysis',         'Analyse two prescribed poems and compare their use of imagery.', 60, NOW() + INTERVAL '5 days'),
('cccccccc-cccc-cccc-cccc-ccccccccccc4', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'Ledger Postings Exercise',          'Post the March transactions to the general ledger.', 80, NOW() + INTERVAL '6 days')
ON CONFLICT (assignment_id) DO NOTHING;

-- Notice blasts (created_by NULL — system seeded; real posts carry a user id)
INSERT INTO app_notifications (school_id, audience, title, body, link_url) VALUES
('11111111-1111-1111-1111-111111111111', 'ALL',      'Winter Uniform Reminder',     'Winter uniform regulations take effect next Monday. Blazers required.', '/notices'),
('11111111-1111-1111-1111-111111111111', 'PARENTS',  'Parent Evening — 12 September','Term 3 parent-teacher evening at 17:30. Book your slot online.', '/notices'),
('22222222-2222-2222-2222-222222222222', 'TEACHERS', 'Marks Submission Deadline',   'Term 3 SNA marks are due to the academic office by Friday.', '/notices'),
('33333333-3333-3333-3333-333333333333', 'ALL',      'Billing Hold — Action Needed','Your school account is on hold. Contact the district office.', '/billing')
ON CONFLICT (notification_id) DO NOTHING;

-- Billing event sample (PayFast webhook trail)
INSERT INTO billing_events (event_id, provider, provider_payment_id, entity_type, entity_id, amount_charged, status, raw_payload) VALUES
('dddddddd-dddd-dddd-dddd-ddddddddddd1', 'PAYFAST', 'EDULINK-DEMO-0001', 'PARENT', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', 100, 'COMPLETE',
 '{"m_payment_id":"EDULINK-DEMO-0001","pf_payment_status":"COMPLETE","item_name":"EDULINK PARENT SUBSCRIPTION"}'::jsonb)
ON CONFLICT (provider_payment_id) DO NOTHING;

