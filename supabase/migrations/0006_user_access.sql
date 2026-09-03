-- ============================================================
-- EDULINK · 0006 — User access model
--   1. Phone-first identities: login_email synthesized from cell
--      number when no contact email is provided (email optional).
--   2. LEARNER-targeted notifications + parent read receipts.
--   3. Auto-notify parents on absence / grade events.
-- ============================================================

-- ------------------------------------------------------------------
-- 1. users: optional contact email + mandatory login handle
-- ------------------------------------------------------------------
ALTER TABLE public.users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS login_email VARCHAR(255);
UPDATE public.users SET login_email = email WHERE login_email IS NULL;
ALTER TABLE public.users ALTER COLUMN login_email SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_login_email ON public.users(login_email);

-- ------------------------------------------------------------------
-- Auto-provision trigger: contact email (optional) vs login handle
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_role   text    := COALESCE(NEW.raw_user_meta_data->>'role', 'PARENT');
    v_school uuid    := NULLIF(NEW.raw_user_meta_data->>'school_id', '')::uuid;
    v_zone   text    := COALESCE(NEW.raw_user_meta_data->>'district_zone', 'WESTERN_CAPE');
    v_name   text    := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
    v_cell   text    := COALESCE(NEW.raw_user_meta_data->>'cell_number', '0000000000');
    v_cemail text    := NULLIF(NEW.raw_user_meta_data->>'contact_email', '');
BEGIN
    IF EXISTS (SELECT 1 FROM public.users WHERE user_id = NEW.id) THEN
        RETURN NEW;
    END IF;
    INSERT INTO public.users (user_id, school_id, role, full_name, cell_number, email, login_email, district_zone)
    VALUES (NEW.id, v_school, v_role, v_name, v_cell, v_cemail, NEW.email, v_zone);

    IF v_role = 'PARENT' THEN
        INSERT INTO public.parents (user_id) VALUES (NEW.id);
    END IF;
    RETURN NEW;
END $$;

-- ------------------------------------------------------------------
-- 2. LEARNER-targeted notifications
-- ------------------------------------------------------------------
ALTER TABLE public.app_notifications DROP CONSTRAINT IF EXISTS app_notifications_audience_check;
ALTER TABLE public.app_notifications ADD CONSTRAINT app_notifications_audience_check
    CHECK (audience IN ('SCHOOL', 'TEACHERS', 'PARENTS', 'ALL', 'LEARNER'));

CREATE INDEX IF NOT EXISTS idx_notif_learner ON public.app_notifications(learner_id, created_at DESC);

-- Parent read receipts (unread badges + mark-as-read)
CREATE TABLE IF NOT EXISTS public.notification_reads (
    notification_id UUID NOT NULL REFERENCES public.app_notifications(notification_id) ON DELETE CASCADE,
    parent_user_id  UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (notification_id, parent_user_id)
);
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY reads_parent_all ON public.notification_reads FOR ALL TO authenticated
    USING (parent_user_id = auth.uid())
    WITH CHECK (parent_user_id = auth.uid() AND public.app_role() = 'PARENT');

-- ------------------------------------------------------------------
-- 3. Event → notification pipeline (parent sees everything)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_parent_on_attendance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_first text; v_last text; v_school uuid; v_subject text; v_title text;
BEGIN
    SELECT l.first_name, l.last_name, l.school_id INTO v_first, v_last, v_school
    FROM public.learners l WHERE l.learner_id = NEW.learner_id;
    IF v_school IS NULL THEN RETURN NEW; END IF;
    SELECT c.subject_name INTO v_subject FROM public.classrooms c WHERE c.class_id = NEW.class_id;
    v_title := 'Attendance alert — ' || v_first || ' ' || v_last || ' (' || NEW.date || ')';
    IF EXISTS (SELECT 1 FROM public.app_notifications WHERE learner_id = NEW.learner_id AND title = v_title) THEN
        RETURN NEW;
    END IF;
    INSERT INTO public.app_notifications (school_id, learner_id, audience, title, body)
    VALUES (
        v_school, NEW.learner_id, 'LEARNER', v_title,
        v_first || ' ' || v_last || ' was marked ' || NEW.status ||
        ' on ' || NEW.date || COALESCE(' for ' || v_subject, '') || '.'
    );
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_attendance_parent_notify ON public.attendance_log;
CREATE TRIGGER trg_attendance_parent_notify AFTER INSERT ON public.attendance_log
FOR EACH ROW WHEN (NEW.status IN ('ABSENT', 'LATE'))
EXECUTE FUNCTION public.notify_parent_on_attendance();

CREATE OR REPLACE FUNCTION public.notify_parent_on_grade()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_learner uuid; v_school uuid; v_first text; v_last text;
    v_assignment text; v_subject text; v_max int; v_title text;
BEGIN
    SELECT s.learner_id, c.school_id, a.title, c.subject_name, a.max_points
      INTO v_learner, v_school, v_assignment, v_subject, v_max
    FROM public.submissions s
    JOIN public.assignments a ON a.assignment_id = s.assignment_id
    JOIN public.classrooms c ON c.class_id = a.class_id
    WHERE s.submission_id = NEW.submission_id;
    IF v_learner IS NULL OR v_school IS NULL THEN RETURN NEW; END IF;
    SELECT l.first_name, l.last_name INTO v_first, v_last
    FROM public.learners l WHERE l.learner_id = v_learner;
    v_title := 'Grade posted: ' || v_assignment || ' — ' || v_first || ' ' || v_last;
    IF EXISTS (SELECT 1 FROM public.app_notifications WHERE learner_id = v_learner AND title = v_title) THEN
        RETURN NEW;
    END IF;
    INSERT INTO public.app_notifications (school_id, learner_id, audience, title, body)
    VALUES (
        v_school, v_learner, 'LEARNER', v_title,
        v_first || ' ' || v_last || ' scored ' || NEW.score_achieved || '/' || v_max ||
        COALESCE(' for ' || v_subject, '') ||
        COALESCE('. Feedback: ' || NEW.feedback_text, '')
    );
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_grade_parent_notify ON public.grades;
CREATE TRIGGER trg_grade_parent_notify AFTER INSERT ON public.grades
FOR EACH ROW EXECUTE FUNCTION public.notify_parent_on_grade();
