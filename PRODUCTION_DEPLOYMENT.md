# EDULINK Production Deployment Guide

**Domain:** k2020.org.za  
**Platform:** Vercel + Supabase + Render  
**Last Updated:** 2026-08-30

---

## Pre-Deployment Checklist

### 1. **Supabase Setup** ✓
```bash
# Create project at supabase.com
# Apply migrations in order:
supabase db push --project-ref <ref>
```

**Migrations to apply:**
- 0001: Enable extensions (uuid-ossp, pgcrypto)
- 0002: Core schema (users, tenants, roles)
- 0003: School data (schools, learners, staff)
- 0004: Health & DSD (cases, clinic, assessments)
- 0005: Seed data (optional)

**Required Secrets in Supabase Dashboard → Settings → Secrets:**
```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
PAYFAST_MERCHANT_ID=10012345
PAYFAST_MERCHANT_KEY=<merchant-key>
PAYFAST_PASSPHRASE=<passphrase>
ONESIGNAL_APP_ID=<app-id>
ONESIGNAL_REST_API_KEY=<rest-api-key>
EDULINK_CRON_SECRET=<32-char-random>
```

### 2. **Vercel Setup** ✓
```bash
# Connect GitHub repo
# Set root directory to: web/
# Add Environment Variables (Project Settings → Environment Variables):
```

**Vercel Environment Variables:**
```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-public-key>
NEXT_PUBLIC_APP_URL=https://k2020.org.za
```

**Custom Domain:**
- Go to Vercel Project → Settings → Domains
- Add: k2020.org.za
- Point DNS CNAME to `cname.vercel-dns.com`

### 3. **Deploy Edge Functions** ✓
```bash
cd supabase

# Deploy all functions with secrets
supabase functions deploy data-ingestion-parser \
  --project-ref <ref>

supabase functions deploy attendance-lockout-watchdog \
  --project-ref <ref>

supabase functions deploy 72-hour-disciplinary-tracker \
  --project-ref <ref>

supabase functions deploy payfast-billing-webhook \
  --project-ref <ref>
```

### 4. **Render Setup** (Cron Services) ✓
```yaml
# Create Blueprint from render.yaml
# Fill env vars:
- EDULINK_SUPABASE_URL
- EDULINK_SERVICE_ROLE_KEY  
- EDULINK_CRON_SECRET

# Cron schedules:
- attendance-lockout-watchdog: 14:00 daily (UTC)
- 72-hour-disciplinary-tracker: 01:30 daily (UTC)
```

### 5. **DNS Configuration** ✓
**At your domain registrar (e.g., Namecheap, GoDaddy):**
```
Type: CNAME
Name: k2020
Target: cname.vercel-dns.com
TTL: 3600
```

Or if using Vercel's nameservers:
```
ns1.vercel-dns.com
ns2.vercel-dns.com
```

---

## Deployment Steps

### Step 1: Local Development Verification
```bash
cd web
npm install
npm run dev

# Verify http://localhost:3000 loads
# Test login with test@example.com / password123
```

### Step 2: Build Production
```bash
cd web
npm run build
npm run start  # Test production build locally
```

### Step 3: Deploy to Vercel
```bash
# Option A: Push to main branch (auto-deploy)
git add .
git commit -m "chore: production deployment"
git push origin main

# Option B: Use Vercel CLI
vercel --prod
```

### Step 4: Verify Deployment
- **Production URL:** https://k2020.org.za
- Check Vercel Analytics → Performance
- Test all 5 role dashboards (SUPERADMIN, SCHOOLADMIN, TEACHER, PARENT, CLINIC/DSD)
- Verify Supabase connectivity
- Test OneSignal notifications

### Step 5: Enable Monitoring
- **Vercel:** Project → Settings → Monitoring
- **Supabase:** Project → Logs → Edge Functions
- **Render:** Dashboard → Services → Logs

---

## Security Hardening

### HTTPS & Headers ✓
All headers configured in `vercel.json`:
- ✅ X-Content-Type-Options: nosniff
- ✅ X-Frame-Options: DENY
- ✅ Strict-Transport-Security: 2 years max-age
- ✅ Referrer-Policy: strict-origin-when-cross-origin
- ✅ Permissions-Policy: camera/microphone/geolocation blocked

### Environment Variables ✓
- **NEVER** commit `.env.local`
- Use `.env.example` as template
- All secrets stored in Vercel & Supabase dashboards
- Service role keys NEVER exposed to browser

### Row-Level Security ✓
All tables protected by RLS in PostgreSQL:
```sql
-- Example: learners table
ALTER TABLE learners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation"
  ON learners
  FOR SELECT
  USING (school_id IN (
    SELECT school_id FROM user_roles 
    WHERE user_id = auth.uid()
  ));
```

### POPIA Compliance ✓
- Contact numbers masked by default
- Addresses masked; reveal logged to `address_reveal_log`
- Minor-child records require parent consent + agency zone match
- Billing exemptions properly scoped

---

## Performance Optimization

### Image & Asset Optimization ✓
- `next.config.mjs`: `images: { unoptimized: true }` (Vercel handles optimization)
- Fonts pre-loaded via Google Fonts
- Tailwind CSS purged for production (~15KB gzip)

### Code Splitting & Lazy Loading ✓
- Next.js 14 automatically code-splits route segments
- Dashboard components lazy-loaded per role
- Dynamic imports for Heavy components

### Database Query Optimization ✓
- Use connection pooling (Supabase PgBouncer enabled)
- RLS rules indexed on common queries
- Edge Functions cached responses where possible

---

## Monitoring & Alerts

### Vercel Analytics
- Real User Monitoring (RUM) enabled
- Core Web Vitals tracked
- Deploy previews for staging

### Supabase Monitoring
- Database performance stats
- API rate limits
- Edge Function error logs

### Render Cron Logs
- View execution history
- Set up email alerts for failures

---

## Rollback Procedure

If deployment breaks:
```bash
# Vercel: Revert to previous deployment
# Go to Vercel Dashboard → Deployments
# Click on stable deployment → Promote to Production

# Or via CLI:
vercel promote <deployment-url> --prod
```

---

## Support & Operations

**Platform Operations Director:**  
Michael Stanfliet · 0615051013 · stanfliet@contractor.net

**Escalation Path:**
1. Check Vercel logs → Project → Deployments → Logs
2. Check Supabase logs → Project → Logs → Edge Functions
3. Check Render cron logs
4. Contact Michael with error screenshots + timestamp

---

## Post-Deployment Verification Checklist

- [ ] HTTPS works at https://k2020.org.za
- [ ] Login redirects to /auth
- [ ] All 5 role dashboards accessible
- [ ] Supabase queries respond < 200ms
- [ ] OneSignal notifications send
- [ ] No 5xx errors in Vercel logs
- [ ] Performance score > 90
- [ ] POPIA compliance audited
- [ ] Cron jobs running on schedule
- [ ] Backups enabled in Supabase

**Deployment Status:** Ready for Production ✓
