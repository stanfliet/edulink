// ============================================================
// EDULINK · seed-data.mjs
// Links seeded classrooms to teachers, creates learners + parents
// links, roster, a few days of attendance (incl. a 3-day absence
// trigger for the 72-hour tracker demo) and one DSD case.
//
// Usage:
//   SUPABASE_URL=https://vfjskqklfavhhltsaicr.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... node seed-data.mjs
// ============================================================
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vfjskqklfavhhltsaicr.supabase.co';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_ROLE) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SCHOOL_A = '11111111-1111-1111-1111-111111111111';
const SCHOOL_B = '22222222-2222-2222-2222-222222222222';
const CLASS_MATH11 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
const CLASS_SCI11  = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2';
const CLASS_ENG10  = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3';
const CLASS_LO10   = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4';
const CLASS_ACC11  = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';

// teacher emails -> user records
const { data: users } = await sb.from('users').select('user_id,email,role,school_id');
const byEmail = Object.fromEntries((users ?? []).map((u) => [u.email, u]));
const T_MARIA = byEmail['m.coetzee@paarlcyber.co.za']?.user_id;
const T_SURESH = byEmail['s.naidoo@paarlcyber.co.za']?.user_id;
const T_JANINE = byEmail['j.visser@paarlcyber.co.za']?.user_id;
const T_KAREN = byEmail['k.peters@stelledigital.co.za']?.user_id;

// 1) assign teachers to seeded classrooms
await sb.from('classrooms').update({ teacher_id: T_MARIA }).eq('class_id', CLASS_MATH11);
await sb.from('classrooms').update({ teacher_id: T_SURESH }).eq('class_id', CLASS_SCI11);
await sb.from('classrooms').update({ teacher_id: T_JANINE }).eq('class_id', CLASS_ENG10);
await sb.from('classrooms').update({ teacher_id: T_JANINE }).eq('class_id', CLASS_LO10);
await sb.from('classrooms').update({ teacher_id: T_KAREN }).eq('class_id', CLASS_ACC11);
console.log('classrooms -> teachers assigned');

// 2) parents
const P_SIPHO = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1';
const P_LIEZEL = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2';
await sb.from('parents').upsert([
  { parent_id: P_SIPHO,  user_id: byEmail['sipho.dlamini@gmail.com']?.user_id,  billing_status: 'PAID', yearly_expiry_date: '2027-08-01' },
  { parent_id: P_LIEZEL, user_id: byEmail['liezel.swart@gmail.com']?.user_id, billing_status: 'PAST_DUE', yearly_expiry_date: '2026-07-01' },
]);
console.log('parents linked');

// 3) learners
const learners = [
  { learner_id: '55555555-5555-5555-5555-555555555501', school_id: SCHOOL_A, parent_id: P_SIPHO,  first_name: 'Lerato', last_name: 'Dlamini',   grade: 11, class_section: 'A', sa_sams_id: 'SAMS-0001', cemis_id: 'CEM-0001', exempt_status: false, chronic_tag: 'Asthma', parent_consent_popia: true,  home_address: '14 Protea Road, Paarl' },
  { learner_id: '55555555-5555-5555-5555-555555555502', school_id: SCHOOL_A, parent_id: P_SIPHO,  first_name: 'Kagiso', last_name: 'Dlamini',   grade: 10, class_section: 'B', sa_sams_id: 'SAMS-0002', cemis_id: 'CEM-0002', exempt_status: false, chronic_tag: null,    parent_consent_popia: true,  home_address: '14 Protea Road, Paarl' },
  { learner_id: '55555555-5555-5555-5555-555555555503', school_id: SCHOOL_A, parent_id: P_LIEZEL, first_name: 'Mia',     last_name: 'Swart',      grade: 11, class_section: 'A', sa_sams_id: 'SAMS-0003', cemis_id: 'CEM-0003', exempt_status: false, chronic_tag: 'Epilepsy', parent_consent_popia: false, home_address: '3 Wingerd Street, Paarl' },
  { learner_id: '55555555-5555-5555-5555-555555555504', school_id: SCHOOL_A, parent_id: P_LIEZEL, first_name: 'Daniel',  last_name: 'Swart',      grade: 10, class_section: 'B', sa_sams_id: 'SAMS-0004', cemis_id: 'CEM-0004', exempt_status: true,  chronic_tag: null,    parent_consent_popia: false, home_address: '3 Wingerd Street, Paarl' },
  { learner_id: '55555555-5555-5555-5555-555555555505', school_id: SCHOOL_B, parent_id: null,     first_name: 'Anele',   last_name: 'Nkosi',      grade: 11, class_section: 'A', sa_sams_id: 'SAMS-0005', cemis_id: 'CEM-0005', exempt_status: false, chronic_tag: 'Diabetes', parent_consent_popia: true,  home_address: '88 Dorp Street, Stellenbosch' },
  { learner_id: '55555555-5555-5555-5555-555555555506', school_id: SCHOOL_B, parent_id: null,     first_name: 'Ruben',   last_name: 'Fourie',      grade: 9,  class_section: 'C', sa_sams_id: 'SAMS-0006', cemis_id: 'CEM-0006', exempt_status: false, chronic_tag: null,     parent_consent_popia: false, home_address: '12 Bird Street, Stellenbosch' },
];
const { error: errL } = await sb.from('learners').upsert(learners, { onConflict: 'learner_id' });
if (errL) console.error('learners error:', errL.message);

// 4) roster
const roster = [
  { class_id: CLASS_MATH11, learner_id: '55555555-5555-5555-5555-555555555501' },
  { class_id: CLASS_MATH11, learner_id: '55555555-5555-5555-5555-555555555503' },
  { class_id: CLASS_SCI11,  learner_id: '55555555-5555-5555-5555-555555555501' },
  { class_id: CLASS_SCI11,  learner_id: '55555555-5555-5555-5555-555555555503' },
  { class_id: CLASS_ENG10,  learner_id: '55555555-5555-5555-5555-555555555502' },
  { class_id: CLASS_ENG10,  learner_id: '55555555-5555-5555-5555-555555555504' },
  { class_id: CLASS_LO10,   learner_id: '55555555-5555-5555-5555-555555555502' },
  { class_id: CLASS_LO10,   learner_id: '55555555-5555-5555-5555-555555555504' },
  { class_id: CLASS_ACC11,  learner_id: '55555555-5555-5555-5555-555555555505' },
];
await sb.from('roster_links').upsert(roster, { onConflict: 'link_id' }).select('link_id');

// 5) attendance — 3 consecutive ABSENT days for Lerato (72-hour trigger),
//    plus today's partial register for Math 11 (watchdog lockout demo).
const today = new Date().toISOString().slice(0, 10);
const d1 = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const d2 = new Date(Date.now() - 172800000).toISOString().slice(0, 10);
const d3 = new Date(Date.now() - 259200000).toISOString().slice(0, 10);

const attRows = [];
const mkAtt = (classId, learnerId, date, status) => ({
  class_id: classId, learner_id: learnerId, date, status,
});
// Lerato absent 3 consecutive days (Math 11)
for (const d of [d3, d2, d1]) {
  attRows.push(mkAtt(CLASS_MATH11, '55555555-5555-5555-5555-555555555501', d, 'ABSENT'));
  attRows.push(mkAtt(CLASS_MATH11, '55555555-5555-5555-5555-555555555503', d, 'PRESENT'));
}
// Today: Mia marked PRESENT but Lerato NOT YET MARKED -> watchdog will lock Math 11 today
attRows.push(mkAtt(CLASS_MATH11, '55555555-5555-5555-5555-555555555503', today, 'PRESENT'));
// Science: both marked today
attRows.push(mkAtt(CLASS_SCI11, '55555555-5555-5555-5555-555555555501', today, 'PRESENT'));
attRows.push(mkAtt(CLASS_SCI11, '55555555-5555-5555-5555-555555555503', today, 'LATE'));
// Other school
attRows.push(mkAtt(CLASS_ACC11, '55555555-5555-5555-5555-555555555505', today, 'PRESENT'));

const { error: errA } = await sb.from('attendance_log').insert(attRows);
if (errA) console.error('attendance error:', errA.message);
else console.log(`attendance seeded: ${attRows.length} rows`);

// 6) DSD case for Lerato (consent true) — visible to WESTERN_CAPE agency users
const { error: errC } = await sb.from('dsd_clinic_cases').upsert([
  {
    case_id: '44444444-4444-4444-4444-444444444444',
    school_id: SCHOOL_A,
    learner_id: '55555555-5555-5555-5555-555555555501',
    trigger_date: d3,
    chronic_badge: 'Asthma',
    caregiver_stability_index: 'STABLE',
    primary_risk_assessment: 'MODERATE',
    form_22_filed: false,
    case_notes: 'Referred after 3 consecutive unexplained absences. Asthma action plan on file.',
    case_status: 'INBOUND_INTAKE',
    district_zone: 'WESTERN_CAPE',
  },
], { onConflict: 'case_id' });
if (errC) console.error('case error:', errC.message);
else console.log('dsd case seeded');

// 7) lockout row for today (Math 11) to demo the teacher gate
const { error: errLk } = await sb.from('attendance_lockouts').upsert([
  { class_id: CLASS_MATH11, school_id: SCHOOL_A, lockout_date: today, status: 'LOCKED' },
], { onConflict: 'class_id,lockout_date' });
if (errLk) console.error('lockout error:', errLk.message);
else console.log('watchdog lockout demo row seeded');

console.log('\nSeed complete.');
