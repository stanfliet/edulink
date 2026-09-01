# EDULINK

**Multi-Tenant School Management Platform · LMS · Public Health Tracking Network · Social Services Disciplinary System**

Hosted at **k2020.org.za** · Built on **Vercel** (Next.js front-end) + **Supabase** (PostgreSQL, Auth, Edge Functions, Storage) + **Render** (scheduled background automation).

© 2026 EDULINK. All Rights Reserved. Hosted securely at k2020.org.za.

---

## Stack

| Layer | Technology |
|---|---|
| Front-end | Next.js 14 (App Router, TypeScript, Tailwind CSS) — Vercel |
| Database | Supabase PostgreSQL 15+ (uuid-ossp, pgcrypto) |
| Realtime / Auth / Storage | Supabase (email+password, private `imports` bucket) |
| Edge Functions | Supabase Edge Functions (Deno) |
| Background cron | Render Cron Services → HTTPS-triggered Edge Functions |
| Payments | PayFast ITN webhook |
| Push alerts | OneSignal API (clinic + DSD caseworker terminals) |

## Repo layout

```
edulink/
├── supabase/
│   ├── migrations/            # 0001 extensions → 0005 seed (apply in order)
│   └── functions/
│       ├── _shared/           # CORS + supabase admin client + idempotent guard
│       ├── data-ingestion-parser/        # SA-SAMS + CEMIS XLSX parsing
│       ├── attendance-lockout-watchdog/  # daily 14:00 (Render cron)
│       ├── disciplinary-72h-tracker/ # nightly (Render cron)
│       └── payfast-billing-webhook/      # PayFast ITN callbacks
├── render.yaml                # Render blueprint (cron services)
├── vercel.json                # Vercel project config
├── web/                       # Next.js 14 app (five role dashboards)
└── scripts/                   # seed-auth.mjs + seed-data.mjs (dev/bootstrap)
```

## Deployment

1. **Supabase**: create project → run `supabase/migrations/0001..0005` in order (SQL editor or `supabase db push`).
2. **Edge Functions**: `supabase functions deploy data-ingestion-parser attendance-lockout-watchdog disciplinary-72h-tracker payfast-billing-webhook --project-ref <ref>` — then set the secrets from `.env.example`.
3. **Vercel**: import `web/` (rootDirectory auto-detected from `vercel.json`), add env vars, custom domain `k2020.org.za`.
4. **Render**: create a Blueprint from `render.yaml`, fill the three sync:false env vars. Cron schedule: watchdog **14:00 daily**, 72-hour tracker **nightly 01:30 UTC**.
5. **Seed (optional)**: `npm i` in `scripts/`, set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, then `npm run seed`.

## Role spaces

- **SUPERADMIN** — South African geographic distribution map, real-time revenue streams, network metrics, master billing overrides.
- **SCHOOLADMIN** — drag-and-drop SA-SAMS/CEMIS ingestion, daily absence ticker, campus notice blasts.
- **TEACHER** — vertical radio-toggle attendance registers, gradebook matrix; persistent full-screen lockout modal at 14:00 until roll is submitted.
- **PARENT** — task deadline calendar, live notification feed, POPIA public-health-net consent toggle.
- **CLINIC_USER / DSD_USER** — case intake manager: Caregiver Stability Index, Risk Assessment, Form 22 checkboxes, case notebooks (zone + consent scoped).

## POPIA compliance

- Row-Level Security enforces tenant isolation on every table.
- All contact numbers masked in the UI; reveal requires a logged manual override.
- Home addresses masked on load; clinic/DSD unlocks require an override logged to `address_reveal_log`.
- Minor-child case records are only readable by agency users in the same `district_zone` **and** where `parent_consent_popia = TRUE`.
- Billing lockouts bypass entirely when `exempt_status = TRUE`.

## Operations contact

Platform Operations Director: **Michael Stanfliet** · 0615051013 · stanfliet@contractor.net · Paarl, Western Cape, South Africa.

This system complies strictly with the Protection of Personal Information Act (POPIA), Act No 4 of 2013 of South Africa. Minor children profiles are protected via encrypted database row isolation.
