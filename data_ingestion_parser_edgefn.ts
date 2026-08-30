/*
  Data Ingestion Parser (Supabase Edge Function - Deno template)
  Save into your edge functions folder (e.g., functions/data-ingestion-parser/index.ts) when ready.

  This template uses esm.sh to import xlsx in Deno. It expects the environment
  variables SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be available.

  The function accepts multipart/form-data with a `file` field containing .xlsx/.xls/.csv.
  It maps common headers and upserts parents and learners, deduplicating by SA_SAMS, CEMIS, or parent phone.

  NOTE: Test thoroughly. This is a robust starting point but adapt to local requirements.
*/

import { serve } from 'https://deno.land/std@0.201.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.33.0';
import * as multipart from 'https://deno.land/std@0.201.0/mime/multipart.ts';
import XLSX from 'https://esm.sh/xlsx@0.18.5';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { global: { headers: { 'x-edge-function': 'data-ingestion-parser' } } });

function normalizeHeader(h: string) {
  return h.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

function mapRow(row: Record<string, any>) {
  const r: any = {};
  // tolerant mappings
  r.sa_sams_id = row['learner_id'] || row['sa_sams'] || row['sa_sams_id'] || row['sams_id'] || null;
  r.cemis_id = row['cemis_id'] || row['cemis'] || null;
  r.first_name = row['first_name'] || row['firstname'] || row['givenname'] || null;
  r.last_name = row['last_name'] || row['lastname'] || row['surname'] || null;
  r.grade = row['grade'] ? Number(row['grade']) : null;
  r.class_section = row['class_section'] || row['class'] || row['classsection'] || null;
  r.parent_name = row['parent_name'] || row['parent'] || null;
  r.parent_cell = row['parent_cell'] || row['parentcell'] || row['parent_phone'] || null;
  r.exempt_status = String(row['exempt_status'] || row['exempt'] || '').toLowerCase() === 'true' || String(row['exempt_status']||'').toLowerCase() === 'y';
  return r;
}

async function handleUpload(req: Request) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const contentType = req.headers.get('content-type') || '';
  if (!contentType.includes('multipart')) return new Response('Expected multipart/form-data', { status: 400 });

  // Using Deno's multipart parsing
  const boundaryMatch = contentType.match(/boundary=(.*)$/i);
  if (!boundaryMatch) return new Response('Missing boundary', { status: 400 });
  const boundary = boundaryMatch[1];
  const body = new Uint8Array(await req.arrayBuffer());
  const parsed = multipart.parse(body, boundary);

  const filePart = parsed['file'] || parsed['upload'];
  if (!filePart) return new Response('No file provided', { status: 400 });

  const fileBuf = filePart.content;
  const wb = XLSX.read(fileBuf, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: null });

  // perform mapping & upsert
  let processed = 0;
  for (const rawRow of rows) {
    const norm: Record<string, any> = {};
    for (const k of Object.keys(rawRow)) norm[normalizeHeader(k)] = rawRow[k];
    const mapped = mapRow(norm);

    // Attempt to find existing parent by phone
    let parentId: string | null = null;
    if (mapped.parent_cell) {
      const p = await supabase.from('parents').select('parent_id,user_id').ilike('payment_reference', mapped.parent_cell).limit(1).maybeSingle();
      if (p && p.data && !p.error) {
        parentId = p.data.parent_id;
      }
    }

    // Upsert parent if no parent found
    if (!parentId) {
      if (mapped.parent_cell || mapped.parent_name) {
        // Create a user placeholder for parent (NOTE: must sync with auth.users in production)
        const parentUserInsert = await supabase.from('users').insert({
          // create a placeholder UUID for user mapping. In production, ensure sync with auth.users
          user_id: crypto.randomUUID(),
          role: 'PARENT',
          full_name: mapped.parent_name || 'Parent',
          cell_number: mapped.parent_cell || null,
          email: null
        }).select('user_id').maybeSingle();

        let pUserId = null;
        if (parentUserInsert && parentUserInsert.data) pUserId = parentUserInsert.data.user_id;

        const parentInsert = await supabase.from('parents').insert({ user_id: pUserId, billing_status: 'UNPAID', payment_reference: mapped.parent_cell }).select('parent_id').maybeSingle();
        if (parentInsert && parentInsert.data) parentId = parentInsert.data.parent_id;
      }
    }

    // Upsert learner: try SA_SAMS, then CEMIS, then name+grade+class
    let learnerMatch = null;
    if (mapped.sa_sams_id) {
      const q = await supabase.from('learners').select('learner_id').eq('sa_sams_id', mapped.sa_sams_id).limit(1).maybeSingle();
      if (q && q.data) learnerMatch = q.data.learner_id;
    }
    if (!learnerMatch && mapped.cemis_id) {
      const q = await supabase.from('learners').select('learner_id').eq('cemis_id', mapped.cemis_id).limit(1).maybeSingle();
      if (q && q.data) learnerMatch = q.data.learner_id;
    }
    if (!learnerMatch) {
      const q = await supabase.from('learners').select('learner_id').ilike('first_name', mapped.first_name || '').ilike('last_name', mapped.last_name || '').eq('grade', mapped.grade || 0).limit(1).maybeSingle();
      if (q && q.data) learnerMatch = q.data.learner_id;
    }

    if (learnerMatch) {
      // update existing learner
      await supabase.from('learners').update({
        parent_id: parentId || undefined,
        sa_sams_id: mapped.sa_sams_id || undefined,
        cemis_id: mapped.cemis_id || undefined,
        exempt_status: mapped.exempt_status === true
      }).eq('learner_id', learnerMatch);
    } else {
      // insert new learner (school_id must be provided via form field 'school_id')
      const schoolId = parsed['school_id']?.value || null;
      await supabase.from('learners').insert({
        school_id: schoolId,
        parent_id: parentId,
        first_name: mapped.first_name || 'Unknown',
        last_name: mapped.last_name || 'Unknown',
        grade: mapped.grade || 0,
        class_section: mapped.class_section || 'A',
        sa_sams_id: mapped.sa_sams_id || null,
        cemis_id: mapped.cemis_id || null,
        exempt_status: mapped.exempt_status === true
      });
    }

    processed++;
  }

  return new Response(JSON.stringify({ success: true, processed }), { status: 200, headers: { 'content-type': 'application/json' } });
}

serve(handleUpload, { port: 0 });

/*
  Deployment notes:
  - Place this file into functions/data-ingestion-parser/index.ts for Supabase Edge Functions (Deno).
  - Ensure SUPABASE_SERVICE_ROLE_KEY is used only server-side and never exposed to client.
  - For large uploads, consider uploading to Supabase Storage and triggering an event to process the file by URL (safer for Edge functions concurrency).
*/