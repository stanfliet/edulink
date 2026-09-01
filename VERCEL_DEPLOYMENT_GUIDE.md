# EDULINK → Vercel Deployment Guide

**Target Domain:** k2020.org.za  
**Platform:** Next.js 14 on Vercel (CDG1 - Paris Region)  
**Database:** Supabase PostgreSQL  
**Edge Functions:** Supabase Deno Functions  
**Cron Services:** Render  

---

## Quick Start (5 Minutes)

### 1. Prerequisites
- [ ] GitHub account with repository access
- [ ] Vercel account (free tier OK)
- [ ] Supabase project deployed
- [ ] k2020.org.za domain registered

### 2. Import Project to Vercel
```bash
# Via Vercel CLI
vercel login
cd web/
vercel

# Or via Vercel Dashboard:
# 1. Go to vercel.com → New Project
# 2. Import GitHub repository
# 3. Set Root Directory: web/
# 4. Framework: Next.js
# 5. Deploy
```

### 3. Set Environment Variables (Vercel Dashboard → Settings → Environment Variables)
```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key-from-supabase>
NEXT_PUBLIC_APP_URL=https://k2020.org.za
```

### 4. Add Custom Domain
1. Vercel Dashboard → Project → Settings → Domains
2. Add Domain: `k2020.org.za`
3. Update DNS at your registrar:
   ```
   Type: CNAME
   Name: k2020
   Target: cname.vercel-dns.com
   ```
4. Or use Vercel's nameservers:
   - ns1.vercel-dns.com
   - ns2.vercel-dns.com

### 5. Deploy
```bash
git push origin main
# Vercel auto-deploys on push
```

---

## Detailed Setup Guide

### A. Supabase Configuration

#### Create Project
1. Go to supabase.com → New Project
2. Select PostgreSQL region closest to South Africa (prefer EU)
3. Enable `uuid-ossp` and `pgcrypto` extensions
4. Copy project URL and anon key

#### Database Setup
```bash
supabase link --project-ref <ref>
supabase db push
# Applies migrations/0001-0005 in order
```

#### Create Secrets (Dashboard → Settings → Secrets)
```bash
# Core
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Payments (PayFast)
PAYFAST_MERCHANT_ID=10012345
PAYFAST_MERCHANT_KEY=<merchant-key>
PAYFAST_PASSPHRASE=<passphrase>
PAYFAST_SANDBOX=true
PAYFAST_NOTIFY_URL=https://<project-ref>.supabase.co/functions/v1/payfast-billing-webhook

# Notifications (OneSignal)
ONESIGNAL_APP_ID=<app-id>
ONESIGNAL_REST_API_KEY=<rest-api-key>

# Cron Security
EDULINK_CRON_SECRET=<32-char-random-string>
```

#### Deploy Edge Functions
```bash
cd supabase

supabase functions deploy data-ingestion-parser \
  --project-ref <ref>

supabase functions deploy attendance-lockout-watchdog \
  --project-ref <ref>

supabase functions deploy disciplinary-72h-tracker \
  --project-ref <ref>

supabase functions deploy payfast-billing-webhook \
  --project-ref <ref>
```

### B. Vercel Configuration

#### Import Repository
1. vercel.com → Dashboard → Add New → Project
2. Import GitHub repo
3. **Root Directory:** `web/`
4. **Framework:** Next.js
5. **Build Command:** `npm run build`
6. **Install Command:** `npm install`

#### Environment Variables
Go to Project Settings → Environment Variables and add:

| Variable | Value | Production | Preview | Development |
|----------|-------|----------|---------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | ✅ | ✅ | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | From Supabase | ✅ | ✅ | ✅ |
| `NEXT_PUBLIC_APP_URL` | `https://k2020.org.za` | ✅ | Auto-generated | ✅ |

#### Custom Domain
1. Settings → Domains
2. Enter `k2020.org.za`
3. Vercel shows DNS records to add
4. **Option A (Recommended):** Update CNAME at registrar
   ```
   Name: k2020.org.za
   Type: CNAME
   Value: cname.vercel-dns.com
   ```
5. **Option B:** Use Vercel's nameservers (requires registrar change)

#### Enable Production Protections
1. Settings → Git → Production Branch: `main`
2. Settings → Git → Ignored Build Step: (leave empty)
3. Settings → Build & Development Settings:
   - Command Override: `npm run build`
   - Output Directory: `.next`

### C. Render Configuration (Cron Services)

#### Create Blueprint
1. render.com → Blueprints → New Blueprint
2. Connect GitHub repo
3. Upload `render.yaml` from root
4. Render auto-detects services

#### Fill Required Variables
When deploying blueprint, fill:
- `EDULINK_SUPABASE_URL` = Supabase project URL
- `EDULINK_SERVICE_ROLE_KEY` = Service role key
- `EDULINK_CRON_SECRET` = Same value as Supabase secret

#### Verify Cron Schedules
- **attendance-lockout-watchdog:** Daily at 14:00 UTC
- **disciplinary-72h-tracker:** Daily at 01:30 UTC

---

## Testing & Verification

### Local Testing
```bash
cd web
npm install
npm run dev
# Visit http://localhost:3000
```

### Staging on Vercel
```bash
# Create feature branch
git checkout -b feature/test-deployment
git push origin feature/test-deployment

# Vercel auto-creates preview deployment
# URL: https://edulink-<hash>.vercel.app
```

### Production Verification
After deploying to https://k2020.org.za:

```bash
# 1. Check response headers
curl -I https://k2020.org.za
# Should see: Strict-Transport-Security, X-Frame-Options, CSP headers

# 2. Test Supabase connection
# Load page, open DevTools, check Network tab
# Supabase auth requests should succeed

# 3. Test all 5 role dashboards
# - SUPERADMIN: Map & revenue
# - SCHOOLADMIN: Ingestion & tickers
# - TEACHER: Attendance registers
# - PARENT: Task calendar
# - CLINIC/DSD: Case intake

# 4. Check Vercel Analytics
# Dashboard → Analytics → Core Web Vitals
```

---

## Deployment Checklist

- [ ] GitHub repo connected to Vercel
- [ ] Root directory set to `web/`
- [ ] Environment variables added (SUPABASE_URL, ANON_KEY, APP_URL)
- [ ] Custom domain `k2020.org.za` configured
- [ ] DNS records updated at registrar
- [ ] Supabase project created and migrations applied
- [ ] Edge Functions deployed
- [ ] Render cron services configured
- [ ] SSL certificate issued (auto via Vercel)
- [ ] Staging deployment tested
- [ ] Production deployment completed
- [ ] All 5 dashboards accessible
- [ ] Supabase queries returning data
- [ ] OneSignal notifications working
- [ ] Core Web Vitals > 90

---

## Monitoring & Alerts

### Vercel Monitoring
- **Dashboard:** Project → Analytics
- **Deployments:** Logs for each deployment
- **Function Logs:** Edge API logs (if using API routes)
- **Error Tracking:** Automatic error collection

### Supabase Monitoring
- **Database:** Project → Logs → Database
- **Edge Functions:** Logs → Edge Functions
- **Storage:** Usage stats
- **API Rate Limits:** Monitor in Settings

### Render Monitoring
- **Dashboard:** Services → Logs
- **Cron Execution:** View history & alerts
- **Email Notifications:** Set up for failures

---

## Troubleshooting

### "Cannot find module" errors
```bash
cd web
npm ci --production
npm run build
```

### Environment variables not loading
1. Vercel Dashboard → Settings → Environment Variables
2. Verify variable names exactly (case-sensitive)
3. Redeploy: Deployments → Select deployment → Redeploy

### Supabase connection timeout
1. Check `NEXT_PUBLIC_SUPABASE_URL` is correct
2. Verify anon key is valid
3. Check Supabase project status (green indicator)
4. Test via: `curl https://<project-ref>.supabase.co`

### DNS not resolving
1. Clear browser cache / DNS cache
2. Wait 24-48 hours for DNS propagation
3. Verify CNAME record at registrar
4. Test via: `nslookup k2020.org.za`

### Build failing
1. Check build logs: Vercel Dashboard → Deployments
2. Run locally: `npm run build`
3. Check for TypeScript errors: `npx tsc --noEmit`
4. Verify all environment variables present

---

## Rollback Procedure

If production breaks:

### Via Vercel Dashboard
1. Go to Deployments
2. Find stable previous deployment
3. Click "..." → Promote to Production

### Via Vercel CLI
```bash
vercel ls                              # List deployments
vercel promote <deployment-url> --prod # Promote to prod
```

### Verify Rollback
```bash
curl https://k2020.org.za
# Should be responsive with old version
```

---

## Next Steps

1. **Domain setup:** Update DNS at registrar
2. **Staging test:** Deploy feature branch and test
3. **Production launch:** Merge to main and monitor
4. **Post-launch:** Set up monitoring & backup alerts
5. **Operations:** Assign monitoring duty to Michael Stanfliet

---

## Support

**Platform Operations Director:**  
Michael Stanfliet  
📞 0615051013  
📧 stanfliet@contractor.net  
📍 Paarl, Western Cape, South Africa

**Escalation Matrix:**
1. **Vercel Build Fails:** Check build logs → Fix locally → Push again
2. **Supabase Down:** Check status.supabase.com → Contact Supabase support
3. **DNS Issues:** Wait 24-48h / flush DNS / contact registrar
4. **Performance Issues:** Optimize Tailwind CSS → check images → check queries
5. **Security Concerns:** Review CSP headers → audit RLS policies → contact Michael

---

**Status:** ✅ Ready for Production Deployment  
**Last Updated:** 2026-08-30  
**Version:** 1.0.0
