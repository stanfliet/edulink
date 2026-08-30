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
