/*
  72-hour Disciplinary Tracker
  Save as a small Node.js script and deploy on Render as a scheduled job.
  Environment variables required:
    - SUPABASE_URL
    - SUPABASE_SERVICE_ROLE_KEY
    - SCHEDULER_SECRET
    - ONESIGNAL_APP_ID (optional)
    - ONESIGNAL_REST_KEY (optional)

  Install dependencies: npm i @supabase/supabase-js node-fetch
*/

const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SCHEDULER_SECRET = process.env.SCHEDULER_SECRET;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing Supabase env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function run(secretHeader) {
  if (!secretHeader || secretHeader !== SCHEDULER_SECRET) {
    console.error('Invalid scheduler secret header');
    process.exit(1);
  }

  console.log('Starting 72-hour disciplinary tracker...');

  // Query learners with 3 consecutive absent days using SQL function; if not present, run an inline query
  // This query finds learners who have 3 most recent school days absent (simple approach)
  const sql = `
    WITH last3 AS (
      SELECT learner_id, array_agg(status ORDER BY date DESC) AS status_arr, max(date) AS last_date
      FROM attendance_log
      WHERE status = 'ABSENT'
      GROUP BY learner_id
    )
    SELECT l.learner_id, l.first_name, l.last_name, l.school_id, l.parent_consent_popia, l.chronic_tag, (SELECT COUNT(*) FROM attendance_log a WHERE a.learner_id = l.learner_id AND a.status = 'ABSENT' AND a.date >= now()::date - INTERVAL '4 days') as absent_days
    FROM learners l
    JOIN last3 ON last3.learner_id = l.learner_id
    WHERE (SELECT COUNT(*) FROM attendance_log a2 WHERE a2.learner_id = l.learner_id AND a2.status = 'ABSENT' AND a2.date >= now()::date - INTERVAL '4 days') >= 3
      AND l.parent_consent_popia = true
  `;

  const { data, error } = await supabase.rpc('sql', { q: sql }).catch(() => ({ error: 'rpc sql not available' }));

  // Supabase RPC 'sql' may not exist in your project environment. Fallback to using from('attendance_log').select if needed.
  if (error) {
    console.log('RPC raw SQL not available, running fallback query via client.');
    // Fallback: fetch recent absences and aggregate client-side
    const { data: absences } = await supabase.from('attendance_log').select('learner_id,date,status').gte('date', new Date(Date.now()-5*24*60*60*1000).toISOString().slice(0,10)).eq('status','ABSENT');
    const map = new Map();
    (absences||[]).forEach(a => {
      const arr = map.get(a.learner_id) || [];
      arr.push(a.date);
      map.set(a.learner_id, arr);
    });

    const learnersToProcess = [];
    for (const [learner_id, dates] of map.entries()) {
      // if 3 or more absences in last 4 days
      if (dates.length >= 3) learnersToProcess.push(learner_id);
    }

    console.log('Found learners with >=3 absences in last 4 days:', learnersToProcess.length);

    for (const lid of learnersToProcess) {
      const { data: l } = await supabase.from('learners').select('learner_id,first_name,last_name,school_id,parent_consent_popia,chronic_tag').eq('learner_id', lid).single();
      if (!l) continue;
      if (!l.parent_consent_popia) continue;

      // create dsd_clinic_cases row
      await supabase.from('dsd_clinic_cases').insert({
        school_id: l.school_id,
        learner_id: l.learner_id,
        trigger_date: new Date().toISOString().slice(0,10),
        chronic_badge: l.chronic_tag,
        case_notes: 'Auto-created by 72-hour disciplinary tracker: multiple absences detected',
        case_status: 'INBOUND_INTAKE'
      });

      // send push via OneSignal if configured
      if (process.env.ONESIGNAL_APP_ID && process.env.ONESIGNAL_REST_KEY) {
        await fetch('https://onesignal.com/api/v1/notifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${process.env.ONESIGNAL_REST_KEY}`
          },
          body: JSON.stringify({
            app_id: process.env.ONESIGNAL_APP_ID,
            headings: { en: '72-hour Absence Alert' },
            contents: { en: `Learner ${l.first_name} ${l.last_name} marked absent multiple times.` },
            filters: [{ field: 'tag', key: 'school_id', relation: '=', value: l.school_id }]
          })
        });
      }
    }

    console.log('72-hour tracker finished.');
    process.exit(0);
  }

  console.log('RPC result:', data);
}

// If run as a script on Render, the scheduler will send a GET with a header x-scheduler-secret
const headerSecret = process.env.RENDER_SCHEDULE_SECRET || process.env.SCHEDULER_SECRET;
run(headerSecret).catch(err => { console.error(err); process.exit(1); });
