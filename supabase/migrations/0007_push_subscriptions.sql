-- ============================================================
-- EDULINK · 0007 — Web Push notifications
--   1. pg_net (async HTTP from SQL) for trigger -> edge dispatch.
--   2. push_subscriptions: one Web Push subscription per browser.
--   3. Vault secret holding the service-role key so triggers can
--      authorize against the push-dispatch edge function.
--   4. AFTER INSERT trigger on app_notifications fires a dispatch.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ------------------------------------------------------------------
-- 1. Browser push subscriptions (self-managed rows)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    subscription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    endpoint        TEXT NOT NULL UNIQUE,
    p256dh          TEXT NOT NULL,
    auth            TEXT NOT NULL,
    user_agent      TEXT,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_subscriptions_self_all ON public.push_subscriptions FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ------------------------------------------------------------------
-- 2. Service-role key in Vault (server-side only; never exposed)
-- ------------------------------------------------------------------
SELECT vault.create_secret(
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmanNrcWtsZmF2aGhsdHNhaWNyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Nzk4OTc4MywiZXhwIjoyMTAzNTY1NzgzfQ.Zp6E83dqGXQzj6yGDfyOJm3pZInG0vo5k0gZzcRfPBg',
    'service_role_key'
) WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'service_role_key');

-- ------------------------------------------------------------------
-- 3. Notification insert -> push dispatch (async, non-blocking)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dispatch_push_notification()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_url  text := 'https://vfjskqklfavhhltsaicr.supabase.co/functions/v1/push-dispatch';
    v_key  text;
BEGIN
    SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets WHERE name = 'service_role_key';
    IF v_key IS NULL THEN RETURN NEW; END IF;

    PERFORM net.http_post(
        url     := v_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_key
        ),
        body    := jsonb_build_object('notification_id', NEW.notification_id)
    );
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_app_notification_push ON public.app_notifications;
CREATE TRIGGER trg_app_notification_push AFTER INSERT ON public.app_notifications
FOR EACH ROW EXECUTE FUNCTION public.dispatch_push_notification();
