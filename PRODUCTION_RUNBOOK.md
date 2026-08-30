# k2020.org.za — Production Runbook

**Last Updated:** 2026-08-30  
**Environment:** Production (Vercel + Supabase + Render)  
**Operations Lead:** Michael Stanfliet (stanfliet@contractor.net · 0615051013)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    k2020.org.za (Vercel CDN)                   │
│              Next.js 14 + React 18 + Tailwind CSS              │
│                  5 Role Dashboards (SSR + CSR)                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    ┌─────────┴─────────┐
                    ↓                   ↓
         ┌────────────────────┐  ┌──────────────┐
         │ Supabase (EU)      │  │ OneSignal    │
         │ ─────────────────  │  │ Notifications│
         │ PostgreSQL (RLS)   │  └──────────────┘
         │ Auth (JWT)         │
         │ Storage (Private)  │
         │ Edge Functions     │
         └────────────────────┘
                ↓
         ┌──────────────────────────┐
         │ Render (Cron Services)   │
         │ ──────────────────────── │
         │ - Attendance Lockout     │
         │ - 72-Hour Tracker        │
         └──────────────────────────┘
```

---

## Deployment Timeline

### Phase 1: Foundation (Completed ✓)
- [x] Next.js 14 app skeleton
- [x] Supabase integration
- [x] 5 role-based dashboards
- [x] POPIA compliance architecture

### Phase 2: Production Release (NOW)
- [ ] Deploy to Vercel with k2020.org.za domain
- [ ] Activate SSL/TLS
- [ ] Configure DNS records
- [ ] Enable monitoring & alerts
- [ ] Run pre-flight checks
- [ ] Soft launch (staff access)
- [ ] Public launch

### Phase 3: Post-Launch (Week 1)
- [ ] Performance optimization
- [ ] User feedback collection
- [ ] Security audit
- [ ] Data migration from legacy systems
- [ ] Training for 5 role groups

---

## Production Deployment Sequence

### Step 1: Pre-Deployment (2 hours before)
```bash
# 1. Backup Supabase
supabase db pull --project-ref <ref> > backup-$(date +%Y%m%d-%H%M%S).sql

# 2. Verify all secrets are set
supabase secrets list --project-ref <ref>

# 3. Check Edge Functions deployed
supabase functions list --project-ref <ref>

# 4. Test locally
cd web
npm install
npm run build
npm run start
# Verify http://localhost:3000 loads
```

### Step 2: Vercel Deployment (5 minutes)
```bash
# Push to main branch (triggers auto-deploy)
git add .
git commit -m "chore: production deployment k2020.org.za"
git push origin main

# Monitor deployment
# Vercel Dashboard → Deployments → Current deployment
# Wait for "Ready"
```

### Step 3: DNS Configuration (Immediate)
At your domain registrar:
```
Zone: k2020.org.za
CNAME Record:
  Name: k2020
  Target: cname.vercel-dns.com
  TTL: 3600
```

### Step 4: SSL Certificate (Automatic, ~2 hours)
Vercel auto-provisions via Let's Encrypt. Monitor:
```bash
# Check certificate status
curl -I https://k2020.org.za
# Should return 200 with Strict-Transport-Security header
```

### Step 5: Smoke Tests (30 minutes after deploy)
```bash
# Test each role dashboard
curl -I https://k2020.org.za                    # Landing
curl -I https://k2020.org.za/login              # Auth
curl -I https://k2020.org.za/dashboard/admin    # SUPERADMIN
curl -I https://k2020.org.za/dashboard/school   # SCHOOLADMIN
curl -I https://k2020.org.za/dashboard/teacher  # TEACHER
curl -I https://k2020.org.za/dashboard/parent   # PARENT
curl -I https://k2020.org.za/dashboard/clinic   # CLINIC/DSD

# All should return 200 OK with security headers
```

---

## Monitoring Procedures

### Daily Checks (9:00 AM)
```bash
# 1. Vercel deployment status
# Dashboard → Deployments → Check latest is "Ready"

# 2. Supabase database health
# Dashboard → Database → Activity → Check no slow queries

# 3. Render cron jobs
# Dashboard → Services → Check last run time

# 4. Performance metrics
# Vercel → Analytics → Core Web Vitals (should be > 90)

# 5. Error rate
# Vercel → Logs → Check for 5xx errors (should be 0)
```

### Weekly Checks (Monday 9:00 AM)
```bash
# 1. Database backups
supabase db pull --project-ref <ref>

# 2. User activity report
# Supabase → SQL Editor → Run user_activity_report()

# 3. Cost review
# Vercel: usage → deployments & bandwidth
# Supabase: usage → API calls & storage
# Render: usage → compute hours

# 4. Security audit
# Check RLS policies: SELECT * FROM pg_policies;
# Check audit logs: SELECT * FROM audit_log LIMIT 10;
```

### Monthly Checks (First Monday)
```bash
# 1. Full security audit
# - Review all user access logs
# - Verify RLS enforcement
# - Check for data breaches (none expected)

# 2. Performance optimization
# - Analyze slow queries in Supabase
# - Review Tailwind CSS bundle size
# - Check image optimization

# 3. Capacity planning
# - Review user growth trends
# - Estimate storage needs (next 6 months)
# - Plan scaling (if needed)

# 4. Disaster recovery drill
# - Restore from backup to staging
# - Verify all data present
# - Test failover procedures
```

---

## Alert Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| **Response Time** | > 500ms | > 2000ms | Scale Vercel / optimize queries |
| **Error Rate** | > 0.1% | > 1% | Check logs / rollback if needed |
| **Database CPU** | > 70% | > 90% | Scale Supabase / optimize RLS |
| **Disk Usage** | > 80% | > 95% | Archive old data / upgrade storage |
| **API Rate Limit** | > 80% quota | > 95% quota | Reduce request frequency |
| **SSL Certificate** | < 7 days | < 1 day | Renew (auto) / investigate if manual |

---

## Incident Response Procedure

### Level 1: Performance Degradation (> 500ms response time)
1. Check Vercel Analytics for spike
2. Check Supabase logs for slow queries
3. If query slow: analyze query plan, add index, retry
4. If Vercel slow: check build size, enable gzip, retry
5. Expected resolution: 15-30 minutes

### Level 2: Service Outage (5xx errors > 1%)
1. **Immediate:** Check Vercel deployment status
   - If red/building: wait for completion
   - If red/failed: rollback to previous deployment
2. Check Supabase status page
   - If down: wait for recovery, no action needed
   - If up: investigate Edge Functions logs
3. Notify Michael Stanfliet
4. Expected resolution: 30 minutes - 2 hours

### Level 3: Data Integrity Issue
1. **STOP all writes:** Shut down Render cron services
2. Verify issue scope via SQL queries
3. Restore from latest backup if necessary
4. Investigate root cause
5. Contact Michael + legal team immediately
6. Expected resolution: 2-4 hours (forensics)

### Level 4: Security Breach
1. **IMMEDIATE:** Take app offline
   - Vercel → Deployments → Pause production
2. Forensic analysis (with Michael)
3. Remediation (patch vulnerability)
4. Restore from clean backup
5. Notify all affected users
6. Expected resolution: 4-24 hours (depends on severity)

---

## Rollback Procedure

**Use if production deployment causes issues:**

### Quick Rollback (< 5 minutes)
```bash
# 1. Go to Vercel Dashboard
# 2. Deployments tab
# 3. Find stable previous deployment (green checkmark)
# 4. Click "..." → "Promote to Production"
# 5. Wait for new deployment to build (~1 min)
# 6. Verify: curl https://k2020.org.za
```

### Manual Rollback (if Vercel UI unavailable)
```bash
vercel rollback --prod
# Vercel prompts to select deployment to restore
# Confirm and wait for redeploy
```

### Database Rollback (if data corruption)
```bash
# 1. Stop all services (Vercel + Render)
# 2. Restore Supabase from backup
supabase db push --project-ref <ref> < backup-YYYYMMDD-HHMMSS.sql
# 3. Verify data integrity via SQL queries
# 4. Restart services
```

---

## Performance Optimization Tips

### Frontend (Vercel)
- Minimize CSS bundle: `npx tailwindcss -m` in production
- Defer non-critical JS: use `<script defer>`
- Pre-load fonts: `<link rel="preload" href="..." as="font">`
- Use Next.js Image optimization: `<Image priority />`

### Backend (Supabase)
- Add indexes on frequently queried columns
- Use row-level security (RLS) efficiently
- Cache frequent queries with `CACHE(300)`
- Analyze slow queries: `EXPLAIN ANALYZE SELECT ...`

### Cron Jobs (Render)
- Stagger job timings to avoid thundering herd
- Use idempotency keys to prevent duplicates
- Log all executions for debugging

---

## Cost Optimization

**Estimated Monthly Costs:**
- Vercel: $20-50 (depending on traffic)
- Supabase: $25-100 (depending on data size)
- Render: $10-25 (cron services)
- Domain: $12/year (k2020.org.za)
- **Total: ~$60-200/month**

**Cost Reduction Strategies:**
1. Use Vercel Analytics to identify heavy pages
2. Optimize database queries to reduce Supabase API calls
3. Cache frequently accessed data (1-hour TTL)
4. Compress images before upload (< 1MB each)
5. Archive historical data annually

---

## Disaster Recovery Plan

**RTO (Recovery Time Objective):** < 4 hours  
**RPO (Recovery Point Objective):** < 1 hour

### Backup Strategy
- **Supabase:** Automatic daily snapshots (7-day retention)
- **Vercel:** Automatic deployment history (30-day retention)
- **Manual backups:** Run weekly via `supabase db pull`

### Recovery Checklist
- [ ] Backup location documented (AWS S3 + local)
- [ ] Recovery procedure tested (monthly)
- [ ] Restore time measured (< 4 hours)
- [ ] All stakeholders trained
- [ ] Runbook reviewed and updated

---

## Support Contacts

| Role | Name | Phone | Email | Timezone |
|------|------|-------|-------|----------|
| **Operations Lead** | Michael Stanfliet | 0615051013 | stanfliet@contractor.net | UTC+2 (SAST) |
| **Technical CTO** | *TBD* | *TBD* | *TBD* | *TBD* |
| **Vercel Support** | — | — | support@vercel.com | UTC |
| **Supabase Support** | — | — | support@supabase.com | UTC |
| **Render Support** | — | — | support@render.com | UTC |

---

## Escalation Matrix

### Tier 1: Self-Service (You)
- Performance degradation (< 30 min)
- Non-critical feature bugs
- User access issues

### Tier 2: Michael Stanfliet
- Outage (> 1 hour)
- Data integrity concerns
- Security incidents
- Capacity planning

### Tier 3: External Vendors
- Vercel infrastructure failure
- Supabase database corruption
- DNS/domain issues

---

## Sign-Off

**Deployment Approved By:**  
- [ ] Michael Stanfliet (Operations Lead)
- [ ] CTO (Technical Review)
- [ ] Security Lead (POPIA Compliance)

**Date:** _______________  
**Version:** 1.0.0  
**Status:** Ready for Production Deployment ✅
