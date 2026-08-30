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
