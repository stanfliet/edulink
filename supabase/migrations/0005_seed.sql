-- ============================================================
-- EDULINK · 0005 — Seed data (public tables only)
-- Auth identities are provisioned by scripts/seed-auth.mjs
-- (the on_auth_user_created trigger provisions users + parents).
-- Linked records (learners/roster/attendance/cases) are created
-- by scripts/seed-data.mjs after auth users exist.
-- ============================================================

INSERT INTO schools (school_id, name, emis_number, province, commercial_status, billing_type, next_billing_date) VALUES
('11111111-1111-1111-1111-111111111111', 'Paarl Cyber Academy',      'WC-EDULINK-001', 'Western Cape', 'ACTIVE',    'R20_MONTHLY', DATE '2026-09-01'),
('22222222-2222-2222-2222-222222222222', 'Stellenbosch Digital High','WC-EDULINK-002', 'Western Cape', 'ACTIVE',    'R20_MONTHLY', DATE '2026-09-01'),
('33333333-3333-3333-3333-333333333333', 'Cape Town North Technical','WC-EDULINK-003', 'Western Cape', 'SUSPENDED', 'R20_MONTHLY', DATE '2026-08-01')
ON CONFLICT (emis_number) DO NOTHING;

-- Classrooms (teacher_id assigned by seed-data.mjs once auth users exist)
INSERT INTO classrooms (class_id, school_id, teacher_id, subject_name, grade) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '11111111-1111-1111-1111-111111111111', NULL, 'Mathematics',             11),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '11111111-1111-1111-1111-111111111111', NULL, 'Physical Science',        11),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '11111111-1111-1111-1111-111111111111', NULL, 'English Home Language',   10),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', '11111111-1111-1111-1111-111111111111', NULL, 'Life Orientation',        10),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', '22222222-2222-2222-2222-222222222222', NULL, 'Accounting',              11),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', '22222222-2222-2222-2222-222222222222', NULL, 'Computer Applications Technology', 10),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', '22222222-2222-2222-2222-222222222222', NULL, 'Mathematics',             9)
ON CONFLICT (class_id) DO NOTHING;

-- Assignments (LMS)
INSERT INTO assignments (assignment_id, class_id, title, description, max_points, due_date) VALUES
('cccccccc-cccc-cccc-cccc-ccccccccccc1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Quadratic Functions Problem Set',  'Factorisation + the quadratic formula, showing all working.', 50, NOW() + INTERVAL '7 days'),
('cccccccc-cccc-cccc-cccc-ccccccccccc2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Newton''s Laws Practical Write-up', 'Formal experiment write-up with data table and conclusion.', 100, NOW() + INTERVAL '10 days'),
('cccccccc-cccc-cccc-cccc-ccccccccccc3', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'Poetry Anthology Analysis',         'Analyse two prescribed poems and compare their use of imagery.', 60, NOW() + INTERVAL '5 days'),
('cccccccc-cccc-cccc-cccc-ccccccccccc4', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'Ledger Postings Exercise',          'Post the March transactions to the general ledger.', 80, NOW() + INTERVAL '6 days')
ON CONFLICT (assignment_id) DO NOTHING;

-- Notice blasts (created_by NULL — system seeded; real posts carry a user id)
INSERT INTO app_notifications (school_id, audience, title, body, link_url) VALUES
('11111111-1111-1111-1111-111111111111', 'ALL',      'Winter Uniform Reminder',     'Winter uniform regulations take effect next Monday. Blazers required.', '/notices'),
('11111111-1111-1111-1111-111111111111', 'PARENTS',  'Parent Evening — 12 September','Term 3 parent-teacher evening at 17:30. Book your slot online.', '/notices'),
('22222222-2222-2222-2222-222222222222', 'TEACHERS', 'Marks Submission Deadline',   'Term 3 SNA marks are due to the academic office by Friday.', '/notices'),
('33333333-3333-3333-3333-333333333333', 'ALL',      'Billing Hold — Action Needed','Your school account is on hold. Contact the district office.', '/billing')
ON CONFLICT (notification_id) DO NOTHING;

-- Billing event sample (PayFast webhook trail)
INSERT INTO billing_events (event_id, provider, provider_payment_id, entity_type, entity_id, amount_charged, status, raw_payload) VALUES
('dddddddd-dddd-dddd-dddd-ddddddddddd1', 'PAYFAST', 'EDULINK-DEMO-0001', 'PARENT', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', 100, 'COMPLETE',
 '{"m_payment_id":"EDULINK-DEMO-0001","pf_payment_status":"COMPLETE","item_name":"EDULINK PARENT SUBSCRIPTION"}'::jsonb)
ON CONFLICT (provider_payment_id) DO NOTHING;
