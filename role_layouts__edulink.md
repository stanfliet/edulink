Placement guide — Next.js App Router files for EDULINK

Files created at repo root for convenience. Move them into your Next.js app as follows:

1) app/layout.tsx
   - Copy contents of app_layout__edulink.tsx into app/layout.tsx
   - This provides the global layout with side rail, top rail, and content area.

2) app/components/Footer.tsx
   - Copy contents of Footer__edulink.tsx into app/components/Footer.tsx
   - Footer enforces the exact three-column legal block requested.

3) app/globals.css
   - Copy contents of globals__edulink.css into app/globals.css
   - This defines color tokens, panel styles, nav hover, and the ui-blocker modal style.

Suggested route tree (Next.js App Router):

app/
├─ layout.tsx                # root layout (copy from app_layout__edulink.tsx)
├─ globals.css               # global styles (copy from globals__edulink.css)
├─ page.tsx                  # landing/home
├─ (auth)/login/page.tsx     # auth routes
├─ (superadmin)/dashboard/page.tsx
├─ (school)/dashboard/page.tsx
├─ (teacher)/dashboard/page.tsx
├─ (parent)/dashboard/page.tsx
├─ (clinic)/dashboard/page.tsx
└─ components/
   └─ Footer.tsx

Notes & next steps
- Implement a small client-side hook to fetch /v1/ui_blockers (or supabase.realtime subscription) and render the .ui-blocker-modal when blockers exist for the logged-in teacher/class.
- Integrate Supabase auth session on the server layout to do role-based rendering and redirect unauthorized roles to their correct route.
- Use v_users_masked (Postgres view) when populating contact lists; implement a server endpoint (/api/unmask) that writes to unmask_audit and returns the real number only when permitted.
- Add framer-motion for smooth transitions between pages; wrap children with <AnimatePresence> etc.

If you want, I can now generate one of these in-place as correctly-structured files (create app/ and components/ folders) — confirm and I'll create the actual folder/files rather than root stubs.