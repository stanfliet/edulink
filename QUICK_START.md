# EDULINK Quick Start — k2020.org.za Production Ready

**Status:** ✅ Production Build System Ready  
**Date:** 2026-08-30  
**Version:** 1.0.0

---

## What's Included

This production deployment package includes:

### 📋 Documentation (Ready to Use)
1. **PRODUCTION_DEPLOYMENT.md** - Complete Vercel deployment guide
2. **VERCEL_DEPLOYMENT_GUIDE.md** - Step-by-step Vercel setup
3. **PRODUCTION_RUNBOOK.md** - Operational procedures & monitoring
4. **ENVIRONMENT_SETUP.md** - Environment variables guide
5. **QUICK_START.md** - This file

### 🔧 Configuration Files (Enhanced)
- **vercel.json** - Enhanced with CSP headers, caching, rewrites
- **next.config.mjs** - Production optimizations enabled
- **web/src/lib/env.ts** - Environment validation utility
- **web/scripts/deployment-check.mjs** - Pre-deployment checklist

### 🚀 Deployment Scripts
- **deploy.mjs** - One-click production deployment automation
- **scripts/production-verify.sh** - Post-deployment verification

### 🌐 Target
- **Domain:** k2020.org.za
- **Platform:** Vercel (CDG1 - Paris region)
- **Database:** Supabase PostgreSQL
- **Auth:** Supabase JWT + RLS
- **Cron:** Render scheduled services

---

## Fastest Path to Production (5 Steps)

### Step 1: Prepare Your Machine
```bash
# Install Node.js (if not already installed)
# Download from: https://nodejs.org (LTS version)

# Verify installation
node --version  # Should be v18+
npm --version   # Should be v9+
```

### Step 2: Set Up Local Environment
```bash
# Navigate to project
cd C:\Users\k2020\edulink\web

# Copy environment template
copy .env.local.example .env.local

# Edit .env.local with your values:
# NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
# NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Step 3: Install & Build Locally
```bash
# Install dependencies
npm install

# Build for production
npm run build

# Test production build locally
npm run start
# Visit http://localhost:3000
```

### Step 4: Deploy to Vercel
```bash
# Option A: Push to GitHub (auto-deploys)
git add .
git commit -m "chore: production deployment"
git push origin main

# Option B: Use Vercel CLI
npm install -g vercel
vercel login
cd web
vercel --prod
```

### Step 5: Configure Domain
At your domain registrar (Namecheap, GoDaddy, etc.):
```
Type: CNAME
Name: k2020.org.za
Target: cname.vercel-dns.com
TTL: 3600
```

Wait 24-48 hours for DNS propagation, then visit **https://k2020.org.za** ✅

---

## Pre-Deployment Checklist

Run this before pushing to production:

```bash
# 1. Verify environment variables are set
echo $env:NEXT_PUBLIC_SUPABASE_URL

# 2. Check build succeeds
cd web
npm run build

# 3. Test production locally
npm run start

# 4. Run security checks
npm run lint

# 5. Verify dependencies
npm list @supabase/supabase-js lucide-react

# 6. Check TypeScript
npx tsc --noEmit
```

---

## Deployment Architecture

```
Your User Browser
       ↓
   k2020.org.za (Vercel CDN)
       ↓
   Next.js 14 App
  ├─ Landing Page (/)
  ├─ Auth Pages (/login, /auth/*)
  ├─ Dashboards (/dashboard/*)
  │  ├─ SUPERADMIN (map, revenue)
  │  ├─ SCHOOLADMIN (ingestion, tickers)
  │  ├─ TEACHER (attendance)
  │  ├─ PARENT (tasks)
  │  └─ CLINIC/DSD (cases)
  └─ API Routes (/api/*)
       ↓
   Supabase Backend
  ├─ PostgreSQL (rows with RLS)
  ├─ Auth (JWT tokens)
  ├─ Storage (file uploads)
  └─ Edge Functions (webhook handlers)
       ↓
   Render Cron Services
  ├─ Attendance Lockout (14:00 UTC)
  └─ 72-Hour Disciplinary Tracker (01:30 UTC)
```

---

## Environment Variables Required

### For Local Development (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxxx
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### For Vercel Production
Set in Vercel Dashboard → Project Settings → Environment Variables:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxxx
NEXT_PUBLIC_APP_URL=https://k2020.org.za
```

### For Supabase Edge Functions
Set in Supabase Dashboard → Project Settings → Secrets:
```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxxx
PAYFAST_MERCHANT_ID=10012345
PAYFAST_MERCHANT_KEY=xxxx
PAYFAST_PASSPHRASE=xxxx
ONESIGNAL_APP_ID=xxxx
ONESIGNAL_REST_API_KEY=xxxx
EDULINK_CRON_SECRET=xxxx
```

---

## Key Features Included

### 🔐 Security
- ✅ Content Security Policy (CSP) headers
- ✅ X-Frame-Options: DENY (prevents clickjacking)
- ✅ Strict-Transport-Security (HSTS 2 years)
- ✅ Supabase Row-Level Security (RLS) enforcement
- ✅ JWT authentication via Supabase
- ✅ POPIA compliance (masked data + consent tracking)

### ⚡ Performance
- ✅ Next.js 14 with App Router
- ✅ Static asset caching (1 year for .next/static)
- ✅ Image optimization (WebP/AVIF)
- ✅ Tailwind CSS minification
- ✅ Vercel Edge Network (CDG1 Paris)

### 📊 Monitoring
- ✅ Vercel Analytics (Core Web Vitals)
- ✅ Supabase logs (database + Edge Functions)
- ✅ Render cron execution logs
- ✅ Error tracking integration ready

### 🌐 Multi-Tenancy
- ✅ Role-based access (5 roles: SUPERADMIN, SCHOOLADMIN, TEACHER, PARENT, CLINIC/DSD)
- ✅ Tenant isolation via RLS policies
- ✅ School-scoped data visibility
- ✅ District zone filtering

---

## Common Commands

```bash
# Development
npm run dev          # Start dev server (http://localhost:3000)

# Production
npm run build        # Build for production
npm run start        # Start production server

# Quality
npm run lint         # Run ESLint
npx tsc --noEmit     # TypeScript check

# Deployment
git push origin main # Auto-deploy via Vercel
vercel --prod        # Deploy via CLI

# Diagnostics
npm list             # Show dependency tree
npm outdated         # Check for updates
npm audit            # Security audit
```

---

## Verifying Deployment

After deploying to https://k2020.org.za:

### Check Response Headers
```bash
curl -I https://k2020.org.za

# Should see:
# HTTP/1.1 200 OK
# Strict-Transport-Security: max-age=63072000
# X-Content-Type-Options: nosniff
# X-Frame-Options: DENY
# Content-Security-Policy: default-src 'self'...
```

### Test All 5 Dashboards
1. **SUPERADMIN:** https://k2020.org.za/dashboard/admin
2. **SCHOOLADMIN:** https://k2020.org.za/dashboard/school
3. **TEACHER:** https://k2020.org.za/dashboard/teacher
4. **PARENT:** https://k2020.org.za/dashboard/parent
5. **CLINIC/DSD:** https://k2020.org.za/dashboard/clinic

### Check Vercel Analytics
- Dashboard → Analytics → Core Web Vitals
- Should show: LCP < 2.5s, FID < 100ms, CLS < 0.1

### Verify Supabase Connection
1. Open browser DevTools (F12)
2. Network tab → reload page
3. Look for requests to `*.supabase.co`
4. Should all return 200/201

---

## Troubleshooting Quick Fixes

| Issue | Fix |
|-------|-----|
| "Cannot find module 'next'" | `npm install` in web/ directory |
| "Environment variable undefined" | Check .env.local or Vercel dashboard |
| "Supabase connection timeout" | Verify URL & anon key are correct |
| "Build fails on Vercel" | Check Vercel build logs, fix locally, push again |
| "DNS not resolving" | Wait 24-48h, flush DNS, verify CNAME at registrar |
| "Styles not loading" | Clear browser cache, hard refresh (Ctrl+Shift+R) |

---

## Getting Help

### Documentation
- 📖 [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) - Full deployment guide
- 📖 [ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md) - Environment variables
- 📖 [PRODUCTION_RUNBOOK.md](./PRODUCTION_RUNBOOK.md) - Operations guide

### Support Contacts
- **Michael Stanfliet** (Operations Lead)
  - 📧 stanfliet@contractor.net
  - 📱 0615051013

### External Support
- Vercel: https://vercel.com/support
- Supabase: https://supabase.com/support
- Next.js: https://nextjs.org/docs

---

## What's Next?

1. ✅ **Complete environment setup** (ENVIRONMENT_SETUP.md)
2. ✅ **Deploy to Vercel** (follow Quick Start above)
3. ✅ **Configure k2020.org.za domain** (add DNS records)
4. ✅ **Run smoke tests** (verify all dashboards work)
5. ✅ **Set up monitoring** (Vercel + Supabase logs)
6. ✅ **Configure cron services** (Render blueprint)
7. ✅ **Train staff** (5 role dashboards)
8. ✅ **Go live!** 🚀

---

**Status:** Ready for Production Deployment  
**Estimated Time to Launch:** 2-4 hours  
**Confidence Level:** Very High ✅

Let's build the future of South African school management!

---

*EDULINK — Multi-Tenant School Management Platform*  
*Paarl · Stellenbosch · Cape Town · Western Cape, South Africa*  
*© 2026 EDULINK. All Rights Reserved.*
