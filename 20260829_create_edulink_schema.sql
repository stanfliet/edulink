-- 2026-08-29 EDULINK schema + RLS + helper functions
-- Enables uuid & crypto functions for production
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------
-- CORE TABLES
-- ------------------------
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

CREATE TABLE IF NOT EXISTS users (
    user_id UUID PRIMARY KEY, -- will reference auth.users(id) externally
    school_id UUID REFERENCES schools(school_id) ON DELETE CASCADE,
    role VARCHAR(50) CHECK (role IN ('SUPERADMIN', 'SCHOOLADMIN', 'TEACHER', 'PARENT', 'CLINIC_USER', 'DSD_USER')),
    full_name VARCHAR(255) NOT NULL,
    cell_number VARCHAR(50) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
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
    parent_consent_popia BOOLEAN DEFAULT FALSE
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
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- ------------------------
-- BILLING & LOCKS & AUDIT TABLES
-- ------------------------
CREATE TABLE IF NOT EXISTS billing_accounts (
    billing_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES schools(school_id) ON DELETE CASCADE,
    amount_due_cents BIGINT DEFAULT 0,
    past_due BOOLEAN DEFAULT FALSE,
    last_billed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
    invoice_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    billing_id UUID REFERENCES billing_accounts(billing_id) ON DELETE CASCADE,
    period_start DATE,
    period_end DATE,
    amount_cents BIGINT,
    paid BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    payfast_reference TEXT
);

CREATE TABLE IF NOT EXISTS ui_blockers (
    blocker_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES schools(school_id) ON DELETE CASCADE,
    class_id UUID REFERENCES classrooms(class_id),
    active BOOLEAN DEFAULT TRUE,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS unmask_audit (
    audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requested_by UUID REFERENCES users(user_id),
    target_user UUID REFERENCES users(user_id),
    target_parent UUID REFERENCES parents(parent_id),
    target_learner UUID REFERENCES learners(learner_id),
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ------------------------
-- INDEXES
-- ------------------------
CREATE INDEX IF NOT EXISTS idx_learners_school ON learners(school_id);
CREATE INDEX IF NOT EXISTS idx_users_school ON users(school_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date_class ON attendance_log(date, class_id);

-- ------------------------
-- VIEWS & MASKING HELPERS
-- ------------------------
-- Masking helper: masks last 6 digits (example). Frontend will request unmask endpoint which must call insert into unmask_audit.
CREATE OR REPLACE FUNCTION mask_phone(p_phone TEXT)
RETURNS TEXT LANGUAGE SQL IMMUTABLE AS $$
SELECT CASE
  WHEN p_phone IS NULL THEN NULL
  WHEN length(regexp_replace(p_phone, '\\D','','g')) < 4 THEN '****'
  ELSE regexp_replace(p_phone, '(\\d{0,3})(\\d{3,6})$', '\\1******')
END;
$$;

-- View for UI consumption that hides cell numbers by default
CREATE OR REPLACE VIEW v_users_masked AS
SELECT
  user_id,
  school_id,
  role,
  full_name,
  mask_phone(cell_number) AS cell_number_masked,
  email,
  created_at
FROM users;

-- ------------------------
-- RLS: ENABLE & POLICIES
-- ------------------------
-- Helper policy: ensure RLS is turned on for all relevant tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE learners ENABLE ROW LEVEL SECURITY;
ALTER TABLE classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE roster_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE dsd_clinic_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE ui_blockers ENABLE ROW LEVEL SECURITY;

-- -- Policy notes:
-- Supabase exposes auth.uid() representing the current JWT sub,
-- and auth.role() representing the role string from Postgres.
-- We rely on users.user_id = auth.uid() to relate the authenticated identity to rows in users table.
-- For teacher/school admin tenant isolation we use subqueries verifying the user's school_id matches the target record's school id.

-- USERS: allow SUPERADMIN full access; allow users to read/update their own row
DROP POLICY IF EXISTS users_self_or_superadmin ON users;
CREATE POLICY users_self_or_superadmin ON users
FOR ALL
USING (
    auth.role() = 'service_role' OR
    auth.role() = 'SUPERADMIN' OR
    (auth.uid() = user_id)
)
WITH CHECK (
    auth.role() = 'service_role' OR
    auth.role() = 'SUPERADMIN' OR
    (auth.uid() = user_id)
);

-- SCHOOLS: SUPERADMIN or staff assigned to school (SCHOOLADMIN/TEACHER) via users table
DROP POLICY IF EXISTS schools_select_admins ON schools;
CREATE POLICY schools_select_admins ON schools
FOR SELECT
USING (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.school_id = schools.school_id AND u.role IN ('SCHOOLADMIN','TEACHER')
    ) OR auth.role() = 'SUPERADMIN'
);

CREATE POLICY schools_update_admins ON schools
FOR UPDATE, DELETE
USING (
    auth.role() = 'service_role' OR
    auth.role() = 'SUPERADMIN'
)
WITH CHECK (
    auth.role() = 'service_role' OR
    auth.role() = 'SUPERADMIN'
);

-- PARENTS: parent users only
DROP POLICY IF EXISTS parents_parent_only ON parents;
CREATE POLICY parents_parent_only ON parents
FOR ALL
USING (
    auth.role() = 'service_role' OR
    auth.role() = 'SUPERADMIN' OR
    EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.user_id = parents.user_id AND u.role = 'PARENT')
)
WITH CHECK (
    auth.role() = 'service_role' OR
    auth.role() = 'SUPERADMIN' OR
    EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.user_id = parents.user_id AND u.role = 'PARENT')
);

-- LEARNERS: teachers & schooladmin limited to same school_id; parents only to children tied to them; clinic/dsd user restricted via clinic logic below
DROP POLICY IF EXISTS learners_tenant_policy ON learners;
CREATE POLICY learners_tenant_policy ON learners
FOR ALL
USING (
    auth.role() = 'service_role' OR
    auth.role() = 'SUPERADMIN' OR
    -- School staff can see learners in their school
    EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.school_id = learners.school_id AND u.role IN ('SCHOOLADMIN','TEACHER')) OR
    -- Parent sees only learners where they are the parent
    EXISTS (SELECT 1 FROM parents p JOIN users u2 ON u2.user_id = p.user_id WHERE p.parent_id = learners.parent_id AND u2.user_id = auth.uid() AND u2.role = 'PARENT')
)
WITH CHECK (
    auth.role() = 'service_role' OR
    auth.role() = 'SUPERADMIN' OR
    EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.school_id = learners.school_id AND u.role IN ('SCHOOLADMIN','TEACHER')) OR
    EXISTS (SELECT 1 FROM parents p JOIN users u2 ON u2.user_id = p.user_id WHERE p.parent_id = learners.parent_id AND u2.user_id = auth.uid() AND u2.role = 'PARENT')
);

-- CLASSROOMS: school staff only (tenant)
DROP POLICY IF EXISTS classrooms_tenant_policy ON classrooms;
CREATE POLICY classrooms_tenant_policy ON classrooms
FOR ALL
USING (
    auth.role() = 'service_role' OR
    auth.role() = 'SUPERADMIN' OR
    EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.school_id = classrooms.school_id AND u.role IN ('SCHOOLADMIN','TEACHER'))
)
WITH CHECK (
    auth.role() = 'service_role' OR
    auth.role() = 'SUPERADMIN' OR
    EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.school_id = classrooms.school_id AND u.role IN ('SCHOOLADMIN','TEACHER'))
);

-- ROSTER_LINKS: school staff and parents (in read-only contexts)
DROP POLICY IF EXISTS roster_tenant_policy ON roster_links;
CREATE POLICY roster_tenant_policy ON roster_links
FOR SELECT
USING (
    auth.role() = 'service_role' OR
    auth.role() = 'SUPERADMIN' OR
    EXISTS (SELECT 1 FROM classrooms c JOIN users u ON u.user_id = auth.uid() WHERE c.class_id = roster_links.class_id AND u.school_id = c.school_id AND u.role IN ('SCHOOLADMIN','TEACHER')) OR
    EXISTS (SELECT 1 FROM parents p WHERE p.parent_id = (SELECT parent_id FROM learners WHERE learner_id = roster_links.learner_id) AND p.user_id = auth.uid())
);

-- ATTENDANCE: teacher or schooladmin for that school, parent only for their learners
DROP POLICY IF EXISTS attendance_tenant_policy ON attendance_log;
CREATE POLICY attendance_tenant_policy ON attendance_log
FOR ALL
USING (
    auth.role() = 'service_role' OR
    auth.role() = 'SUPERADMIN' OR
    -- school staff
    EXISTS (
       SELECT 1 FROM classrooms c JOIN users u ON u.user_id = auth.uid()
       WHERE c.class_id = attendance_log.class_id AND u.school_id = c.school_id AND u.role IN ('SCHOOLADMIN','TEACHER')
    ) OR
    -- parents for their learner
    EXISTS (
       SELECT 1 FROM parents p WHERE p.parent_id = (SELECT parent_id FROM learners WHERE learner_id = attendance_log.learner_id) AND p.user_id = auth.uid()
    )
)
WITH CHECK (
    -- writing: only school staff may write attendance for their school
    auth.role() = 'service_role' OR
    auth.role() = 'SUPERADMIN' OR
    EXISTS (
       SELECT 1 FROM classrooms c JOIN users u ON u.user_id = auth.uid()
       WHERE c.class_id = attendance_log.class_id AND u.school_id = c.school_id AND u.role IN ('SCHOOLADMIN','TEACHER')
    )
);

-- ASSIGNMENTS / SUBMISSIONS / GRADES: teacher/schooladmin for same school; parents/learners can view submissions/grades for their learner
DROP POLICY IF EXISTS assignments_tenant_policy ON assignments;
CREATE POLICY assignments_tenant_policy ON assignments
FOR ALL
USING (
    auth.role() = 'service_role' OR auth.role() = 'SUPERADMIN' OR
    EXISTS (SELECT 1 FROM classrooms c JOIN users u ON u.user_id = auth.uid() WHERE c.class_id = assignments.class_id AND u.school_id = c.school_id AND u.role IN ('SCHOOLADMIN','TEACHER'))
)
WITH CHECK (
    auth.role() = 'service_role' OR auth.role() = 'SUPERADMIN' OR
    EXISTS (SELECT 1 FROM classrooms c JOIN users u ON u.user_id = auth.uid() WHERE c.class_id = assignments.class_id AND u.school_id = c.school_id AND u.role IN ('SCHOOLADMIN','TEACHER'))
);

DROP POLICY IF EXISTS submissions_tenant_policy ON submissions;
CREATE POLICY submissions_tenant_policy ON submissions
FOR ALL
USING (
    auth.role() = 'service_role' OR auth.role() = 'SUPERADMIN' OR
    -- teacher/school staff for the assignment's class
    EXISTS (
        SELECT 1 FROM assignments a JOIN classrooms c ON a.class_id = c.class_id JOIN users u ON u.user_id = auth.uid()
        WHERE submissions.assignment_id = a.assignment_id AND u.school_id = c.school_id AND u.role IN ('SCHOOLADMIN','TEACHER')
    ) OR
    -- parent/learner can see their own submissions
    EXISTS (
        SELECT 1 FROM learners l JOIN parents p ON l.parent_id = p.parent_id JOIN users u2 ON u2.user_id = p.user_id
        WHERE submissions.learner_id = l.learner_id AND u2.user_id = auth.uid() AND u2.role = 'PARENT'
    )
)
WITH CHECK (
    -- writes: submissions can be inserted by the learner or by service
    auth.role() = 'service_role' OR
    EXISTS (SELECT 1 FROM learners l WHERE l.learner_id = submissions.learner_id AND EXISTS (SELECT 1 FROM parents p JOIN users u2 ON u2.user_id = p.user_id WHERE p.parent_id = l.parent_id AND u2.user_id = auth.uid() AND u2.role = 'PARENT'))
);

-- GRADES: teachers & school admins can create/update; parents/learners view
DROP POLICY IF EXISTS grades_tenant_policy ON grades;
CREATE POLICY grades_tenant_policy ON grades
FOR ALL
USING (
    auth.role() = 'service_role' OR auth.role() = 'SUPERADMIN' OR
    EXISTS (
        SELECT 1 FROM submissions s JOIN assignments a ON s.assignment_id = a.assignment_id JOIN classrooms c ON a.class_id = c.class_id JOIN users u ON u.user_id = auth.uid()
        WHERE grades.submission_id = s.submission_id AND u.school_id = c.school_id AND u.role IN ('SCHOOLADMIN','TEACHER')
    ) OR
    EXISTS (
        SELECT 1 FROM submissions s JOIN learners l ON s.learner_id = l.learner_id JOIN parents p ON l.parent_id = p.parent_id JOIN users u2 ON u2.user_id = p.user_id
        WHERE grades.submission_id = s.submission_id AND u2.user_id = auth.uid() AND u2.role = 'PARENT'
    )
)
WITH CHECK (
    auth.role() = 'service_role' OR auth.role() = 'SUPERADMIN' OR
    EXISTS (
        SELECT 1 FROM submissions s JOIN assignments a ON s.assignment_id = a.assignment_id JOIN classrooms c ON a.class_id = c.class_id JOIN users u ON u.user_id = auth.uid()
        WHERE grades.submission_id = s.submission_id AND u.school_id = c.school_id AND u.role IN ('SCHOOLADMIN','TEACHER')
    )
);

-- DSD/CLINIC CASES: Strict policy: CLINIC_USER or DSD_USER only when parent_consent_popia = true AND matches school/district (district enforcement suggested via users.district claim)
DROP POLICY IF EXISTS dsd_cases_policy ON dsd_clinic_cases;
CREATE POLICY dsd_cases_policy ON dsd_clinic_cases
FOR ALL
USING (
    auth.role() = 'service_role' OR auth.role() = 'SUPERADMIN' OR
    (
      -- clinic/dsd users only if parent consent is true for the learner
      (auth.role() IN ('CLINIC_USER','DSD_USER')) AND
      EXISTS (
        SELECT 1 FROM learners l JOIN users u ON u.user_id = auth.uid()
        WHERE l.learner_id = dsd_clinic_cases.learner_id
          AND l.parent_consent_popia = TRUE
          -- optional: match district zone if you store district on users or schools:
          -- AND u.district = (SELECT district FROM schools WHERE school_id = dsd_clinic_cases.school_id)
      )
    )
)
WITH CHECK (
    -- creation requires service role or clinic/dsd users with consent
    auth.role() = 'service_role' OR auth.role() = 'SUPERADMIN' OR
    (
      auth.role() IN ('CLINIC_USER','DSD_USER') AND EXISTS (SELECT 1 FROM learners l WHERE l.learner_id = dsd_clinic_cases.learner_id AND l.parent_consent_popia = TRUE)
    )
);

-- BILLING: school admins & superadmins and service role
DROP POLICY IF EXISTS billing_accounts_policy ON billing_accounts;
CREATE POLICY billing_accounts_policy ON billing_accounts
FOR ALL
USING (
    auth.role() = 'service_role' OR auth.role() = 'SUPERADMIN' OR
    EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.school_id = billing_accounts.school_id AND u.role = 'SCHOOLADMIN')
)
WITH CHECK (
    auth.role() = 'service_role' OR auth.role() = 'SUPERADMIN' OR
    EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.school_id = billing_accounts.school_id AND u.role = 'SCHOOLADMIN')
);

-- UI_BLOCKERS: school staff and superadmin read/update
DROP POLICY IF EXISTS ui_blockers_policy ON ui_blockers;
CREATE POLICY ui_blockers_policy ON ui_blockers
FOR ALL
USING (
    auth.role() = 'service_role' OR auth.role() = 'SUPERADMIN' OR
    EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.school_id = ui_blockers.school_id AND u.role IN ('SCHOOLADMIN','TEACHER'))
)
WITH CHECK (
    auth.role() = 'service_role' OR auth.role() = 'SUPERADMIN'
);

-- Unmask audit table: service role or superadmin can read; user can insert audit record only for permitted targets
ALTER TABLE unmask_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS unmask_audit_policy ON unmask_audit;
CREATE POLICY unmask_audit_policy ON unmask_audit
FOR ALL
USING (
    auth.role() = 'service_role' OR auth.role() = 'SUPERADMIN' OR (auth.uid() = requested_by)
)
WITH CHECK (
   auth.role() = 'service_role' OR auth.role() = 'SUPERADMIN' OR (auth.uid() = requested_by)
);

-- ------------------------
-- UTILITY PROCEDURES
-- ------------------------
-- Insert a DSD case helper used by Edge functions (optional)
CREATE OR REPLACE FUNCTION edulink_create_dsd_case(
    p_school_id UUID,
    p_learner_id UUID,
    p_chronic_badge TEXT,
    p_notes TEXT,
    p_assigned_worker_id UUID DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE new_case UUID;
BEGIN
  INSERT INTO dsd_clinic_cases(school_id, learner_id, chronic_badge, case_notes, assigned_worker_id)
  VALUES (p_school_id, p_learner_id, p_chronic_badge, p_notes, p_assigned_worker_id)
  RETURNING case_id INTO new_case;

  RETURN new_case;
END;
$$;

-- Audit trigger example: when ui_blockers inserted, notify via NOTIFY so a backend worker can push to OneSignal / Push channels
CREATE OR REPLACE FUNCTION notify_ui_blocker() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('ui_blocker_channel', json_build_object('blocker_id', NEW.blocker_id, 'school_id', NEW.school_id)::text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_ui_blocker ON ui_blockers;
CREATE TRIGGER trg_notify_ui_blocker AFTER INSERT ON ui_blockers
FOR EACH ROW EXECUTE FUNCTION notify_ui_blocker();

-- Done
