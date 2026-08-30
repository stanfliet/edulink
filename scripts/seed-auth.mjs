// ============================================================
// EDULINK · seed-auth.mjs
// Provisions auth.users identities + raw_user_meta_data.
// The on_auth_user_created trigger provisions public.users + parents.
//
// Usage:
//   SUPABASE_URL=https://vfjskqklfavhhltsaicr.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... node seed-auth.mjs
// ============================================================
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vfjskqklfavhhltsaicr.supabase.co';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_ROLE) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const S = '11111111-1111-1111-1111-111111111111'; // Paarl Cyber Academy
const W = '22222222-2222-2222-2222-222222222222'; // Stellenbosch Digital High

const profiles = [
  // SuperAdmin — no school tenant
  { email: 'stanfliet@contractor.net', password: 'Edulink#2026!', meta: { role: 'SUPERADMIN', full_name: 'Michael Stanfliet', cell_number: '0615051013' } },
  // SchoolAdmin
  { email: 'admin@paarlcyber.co.za',  password: 'Edulink#2026!', meta: { role: 'SCHOOLADMIN', full_name: 'Annelie du Toit', cell_number: '0825550101', school_id: S } },
  { email: 'admin@stelledigital.co.za', password: 'Edulink#2026!', meta: { role: 'SCHOOLADMIN', full_name: 'Pieter Botha', cell_number: '0835550202', school_id: W } },
  // Teachers (Paarl Cyber)
  { email: 'm.coetzee@paarlcyber.co.za',  password: 'Edulink#2026!', meta: { role: 'TEACHER', full_name: 'Maria Coetzee', cell_number: '0845550303', school_id: S } },
  { email: 's.naidoo@paarlcyber.co.za',   password: 'Edulink#2026!', meta: { role: 'TEACHER', full_name: 'Suresh Naidoo', cell_number: '0845550404', school_id: S } },
  { email: 'j.visser@paarlcyber.co.za',   password: 'Edulink#2026!', meta: { role: 'TEACHER', full_name: 'Janine Visser', cell_number: '0845550505', school_id: S } },
  // Teachers (Stellenbosch Digital)
  { email: 'k.peters@stelledigital.co.za', password: 'Edulink#2026!', meta: { role: 'TEACHER', full_name: 'Karen Peters', cell_number: '0845550606', school_id: W } },
  // Parents
  { email: 'sipho.dlamini@gmail.com', password: 'Edulink#2026!', meta: { role: 'PARENT', full_name: 'Sipho Dlamini', cell_number: '0725550707' } },
  { email: 'liezel.swart@gmail.com', password: 'Edulink#2026!', meta: { role: 'PARENT', full_name: 'Liezel Swart', cell_number: '0735550808' } },
  // Clinic user
  { email: 'nurse@paarlclinic.org.za', password: 'Edulink#2026!', meta: { role: 'CLINIC_USER', full_name: 'Thandi Mbeki', cell_number: '0715550909', district_zone: 'WESTERN_CAPE' } },
  // DSD caseworker
  { email: 'dsd@paarl.gov.za', password: 'Edulink#2026!', meta: { role: 'DSD_USER', full_name: 'Faried Abrahams', cell_number: '0715551010', district_zone: 'WESTERN_CAPE' } },
];

let created = 0, skipped = 0;
for (const p of profiles) {
  const { data: existing } = await admin.auth.admin.listUsers();
  const known = existing?.users?.some((u) => u.email === p.email);
  if (known) {
    console.log(`skip   ${p.email}`);
    skipped++;
    continue;
  }
  const { error } = await admin.auth.admin.createUser({
    email: p.email,
    password: p.password,
    email_confirm: true,
    user_metadata: p.meta,
  });
  if (error) {
    console.error(`FAIL   ${p.email}: ${error.message}`);
  } else {
    console.log(`ok     ${p.email} (${p.meta.role})`);
    created++;
  }
}
console.log(`\nDone. created=${created} skipped=${skipped}`);
