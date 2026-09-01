# EDULINK Environment Setup Guide

**For Production Deployment to k2020.org.za**

---

## Quick Setup (Copy & Paste)

### 1. Create .env.local for local development
```bash
cp web/.env.local.example web/.env.local
```

Edit `web/.env.local`:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 2. Set Vercel environment variables
```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add NEXT_PUBLIC_APP_URL https://k2020.org.za
```

### 3. Set Supabase Edge Function secrets
```bash
supabase secrets set \
  --project-ref <ref> \
  SUPABASE_URL=https://<ref>.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
  PAYFAST_MERCHANT_ID=10012345 \
  PAYFAST_MERCHANT_KEY=<key> \
  PAYFAST_PASSPHRASE=<passphrase> \
  ONESIGNAL_APP_ID=<app-id> \
  ONESIGNAL_REST_API_KEY=<rest-api-key> \
  EDULINK_CRON_SECRET=<32-char-random-string>
```

---

## Detailed Setup Instructions

### A. Development Environment

#### Install Node.js
```bash
# Windows: https://nodejs.org (LTS)
# Or use nvm-windows

node --version  # Should be v18 or higher
npm --version   # Should be v9 or higher
```

#### Install Vercel CLI
```bash
npm install -g vercel
vercel login
```

#### Install Supabase CLI
```bash
# Windows (via npm)
npm install -g supabase

# Or download binary
# https://github.com/supabase/cli/releases
```

#### Clone Repository
```bash
git clone <your-repo-url>
cd edulink
cd web
npm install
```

#### Create Local Environment File
```bash
# Copy template
cp .env.local.example .env.local

# Edit with your values
# Use a text editor to set:
# - NEXT_PUBLIC_SUPABASE_URL
# - NEXT_PUBLIC_SUPABASE_ANON_KEY
# - NEXT_PUBLIC_APP_URL (keep as http://localhost:3000)
```

#### Start Development Server
```bash
npm run dev
# Visit http://localhost:3000
```

---

### B. Supabase Setup

#### Create Supabase Project
1. Go to https://supabase.com
2. Sign up / Log in
3. Create new project
4. Choose PostgreSQL region closest to South Africa (prefer EU)
5. Save project ref and API keys

#### Apply Database Migrations
```bash
# From project root
supabase link --project-ref <your-project-ref>

cd supabase
supabase db push

# This applies all migrations in order:
# - 0001: Extensions (uuid-ossp, pgcrypto)
# - 0002: Core schema (users, roles, tenants)
# - 0003: School data (schools, learners, staff)
# - 0004: Health & DSD (cases, clinic, assessments)
# - 0005: Seed data (optional, for testing)
```

#### Set Supabase Secrets
Go to Supabase Dashboard → Project Settings → Secrets:

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<from Settings → API → service_role>

PAYFAST_MERCHANT_ID=10012345
PAYFAST_MERCHANT_KEY=<from PayFast merchant dashboard>
PAYFAST_PASSPHRASE=<secure passphrase>
PAYFAST_SANDBOX=true

ONESIGNAL_APP_ID=<from OneSignal account>
ONESIGNAL_REST_API_KEY=<from OneSignal settings>

EDULINK_CRON_SECRET=<generate: openssl rand -hex 16>
```

#### Deploy Edge Functions
```bash
cd supabase

# Deploy all functions
supabase functions deploy data-ingestion-parser --project-ref <ref>
supabase functions deploy attendance-lockout-watchdog --project-ref <ref>
supabase functions deploy disciplinary-72h-tracker --project-ref <ref>
supabase functions deploy payfast-billing-webhook --project-ref <ref>

# Verify
supabase functions list --project-ref <ref>
```

---

### C. Vercel Setup

#### Import Project to Vercel
**Option 1: Via Web Dashboard**
1. Go to https://vercel.com/dashboard
2. Click "Add New" → "Project"
3. Import GitHub repository
4. Configure project:
   - **Framework Preset:** Next.js
   - **Root Directory:** web/
   - **Build Command:** npm run build
   - **Install Command:** npm install
5. Click "Deploy"

**Option 2: Via Vercel CLI**
```bash
cd web
vercel
# Follow prompts
# Select: Link to existing project or create new
# Confirm settings
```

#### Add Environment Variables (Vercel Dashboard)
Go to Project Settings → Environment Variables

| Name | Value | Production | Preview | Development |
|------|-------|-----------|---------|-------------|
| NEXT_PUBLIC_SUPABASE_URL | https://[ref].supabase.co | ✅ | ✅ | ✅ |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | [anon-key] | ✅ | ✅ | ✅ |
| NEXT_PUBLIC_APP_URL | https://k2020.org.za | ✅ | - | ✅ |

#### Add Custom Domain
1. Vercel Dashboard → Settings → Domains
2. Input: k2020.org.za
3. Choose DNS provider:
   - **Option A (Recommended):** Add CNAME at your registrar
     ```
     Name: k2020.org.za
     Type: CNAME
     Value: cname.vercel-dns.com
     TTL: 3600
     ```
   - **Option B:** Update nameservers to Vercel's
     ```
     ns1.vercel-dns.com
     ns2.vercel-dns.com
     ```
4. Wait for DNS propagation (up to 24-48 hours)
5. Vercel automatically provisions SSL certificate

---

### D. Render Setup (Cron Services)

#### Create Render Blueprint
1. Go to https://render.com
2. Sign up / Log in
3. Click "Blueprints"
4. Click "New Blueprint"
5. Connect GitHub
6. Select `render.yaml` from root
7. Render auto-detects services

#### Fill Environment Variables
When deploying blueprint:

| Variable | Value |
|----------|-------|
| EDULINK_SUPABASE_URL | https://[ref].supabase.co |
| EDULINK_SERVICE_ROLE_KEY | [service-role-key] |
| EDULINK_CRON_SECRET | [same as Supabase] |

#### Verify Cron Schedules
Dashboard → Services → [Service Name] → Settings → Cron

- **attendance-lockout-watchdog:** `0 14 * * *` (14:00 UTC daily)
- **disciplinary-72h-tracker:** `30 1 * * *` (01:30 UTC daily)

---

### E. Environment Variable Summary

**Development (.env.local):**
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxxx
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Vercel Production:**
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxxx
NEXT_PUBLIC_APP_URL=https://k2020.org.za
```

**Supabase Edge Function Secrets:**
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

**Render Environment Variables:**
```
EDULINK_SUPABASE_URL=https://xxxx.supabase.co
EDULINK_SERVICE_ROLE_KEY=xxxx
EDULINK_CRON_SECRET=xxxx
```

---

## Verification Checklist

- [ ] Node.js v18+ installed
- [ ] Vercel CLI installed and logged in
- [ ] Supabase CLI installed
- [ ] GitHub repository cloned locally
- [ ] .env.local created with dev values
- [ ] Supabase project created
- [ ] Database migrations applied
- [ ] All secrets set in Supabase
- [ ] Edge Functions deployed
- [ ] Vercel project created
- [ ] Environment variables set in Vercel
- [ ] Custom domain k2020.org.za added
- [ ] DNS records configured
- [ ] Render blueprint deployed
- [ ] Cron schedules verified
- [ ] Local dev server runs (http://localhost:3000)
- [ ] All 5 dashboards accessible

---

## Getting Keys & Secrets

### From Supabase
1. Dashboard → Project Settings → API
2. **Project URL** = NEXT_PUBLIC_SUPABASE_URL
3. **Anon (public) key** = NEXT_PUBLIC_SUPABASE_ANON_KEY
4. **Service role key** = SUPABASE_SERVICE_ROLE_KEY (NEVER expose to browser)

### From PayFast
1. Merchant settings at PayFast portal
2. Merchant ID, Merchant Key, Passphrase
3. Test in sandbox mode first (PAYFAST_SANDBOX=true)

### From OneSignal
1. App settings → Keys & IDs
2. **App ID** = ONESIGNAL_APP_ID
3. **REST API Key** = ONESIGNAL_REST_API_KEY

### Generate EDULINK_CRON_SECRET
```bash
# Generate 32-character random hex string
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"

# Or via command line
openssl rand -hex 16
```

---

## Troubleshooting

### "Cannot find module 'next'"
```bash
cd web
npm install
npm run build
```

### "Environment variable not found"
1. Check spelling (case-sensitive)
2. Vercel: Settings → Environment Variables (add all three)
3. Local: .env.local file exists and readable
4. Supabase: Project Settings → Secrets

### "Supabase connection refused"
1. Verify URL is correct (check Supabase dashboard)
2. Check anon key is correct
3. Verify Supabase project status (should be green)
4. Check firewall/network access to supabase.co

### "DNS not resolving k2020.org.za"
1. Wait 24-48 hours for propagation
2. Flush DNS: `ipconfig /flushdns` (Windows)
3. Verify CNAME record at registrar
4. Test: `nslookup k2020.org.za`

### Build fails on Vercel
1. Check build logs in Vercel dashboard
2. Run locally: `npm run build`
3. Fix errors, commit, and push
4. Vercel auto-redeploys

---

## Support

**Questions?** Contact:
- Michael Stanfliet: stanfliet@contractor.net · 0615051013
- Supabase Support: https://supabase.com/support
- Vercel Support: https://vercel.com/support

**Status:** ✅ Ready for Production Setup
