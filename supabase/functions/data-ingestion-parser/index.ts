// ============================================================
// EDULINK · data-ingestion-parser
// Triggered by file upload (Supabase Storage event -> import.triggered).
//
// Parses both SA-SAMS and Western Cape CEMIS Excel workbooks,
// auto-mapping headers:
//   Learner_ID, First_Name, Last_Name, Grade, Class_Section,
//   Parent_Name, Parent_Cell, Exempt_Status
// Cleans data and upserts learners without duplication
// (dedupe on sa_sams_id / cemis_id / full-name match).
//
// Endpoint flow: client (SchoolAdmin) uploads XLSX to
// storage 'imports/<school_id>/<file>' then invokes:
//   POST /functions/v1/data-ingestion-parser
//   { file_path: "imports/<school_id>/<file>", school_id, source: "SA_SAMS"|"CEMIS" }
// ============================================================
import * as XLSX from "npm:xlsx@0.18.5";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { corsHandler, json } from "../_shared/cors.ts";

const HEADER_MAP: Record<string, string> = {
  "learner_id": "sa_sams_id",
  "learner no": "sa_sams_id",
  "sams id": "sa_sams_id",
  "learner number": "sa_sams_id",
  "sasamsid": "sa_sams_id",
  "sa-sams id": "sa_sams_id",
  "cemis id": "cemis_id",
  "cemisid": "cemis_id",
  "first_name": "first_name",
  "first name": "first_name",
  "name": "first_name",
  "learner name": "first_name",
  "last_name": "last_name",
  "surname": "last_name",
  "last name": "last_name",
  "grade": "grade",
  "current grade": "grade",
  "class_section": "class_section",
  "class": "class_section",
  "class section": "class_section",
  "parent_name": "parent_name",
  "parent name": "parent_name",
  "parent_cell": "parent_cell",
  "parent cell": "parent_cell",
  "parent cell number": "parent_cell",
  "cell": "parent_cell",
  "exempt_status": "exempt_status",
  "exempt": "exempt_status",
  "bursary exempt": "exempt_status",
  "exempt status": "exempt_status",
};

function detectSource(fileName: string, source?: string): "SA_SAMS" | "CEMIS" {
  const lower = fileName.toLowerCase();
  if (source === "SA_SAMS" || source === "CEMIS") return source;
  if (lower.includes("sams")) return "SA_SAMS";
  return "CEMIS";
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/\s+/g, " ");
}

function cleanValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") {
    // Excel cells like 20240101001 come through as numbers
    if (Number.isInteger(v) && String(v).length >= 8) return String(v);
    return String(v);
  }
  return String(v).trim();
}

function parseBool(v: unknown): boolean {
  const s = cleanValue(v).toLowerCase();
  return s === "true" || s === "yes" || s === "y" || s === "1" || s === "x";
}

Deno.serve(async (req: Request) => {
  const pre = corsHandler(req);
  if (pre) return pre;

  try {
    const body = await req.json();
    const filePath: string = body.file_path ?? "";
    const schoolId: string = body.school_id ?? "";
    const sourceHint: string = body.source ?? "";
    const fileName = filePath.split("/").pop() ?? "upload.xlsx";

    if (!filePath || !schoolId) {
      return json({ ok: false, error: "file_path and school_id required" }, 400);
    }

    const sb = getAdminClient();
    const source = detectSource(fileName, sourceHint);

    // 1) audit row first
    const { data: importRow, error: errImp } = await sb
      .from("data_imports")
      .insert({
        school_id: schoolId,
        file_name: fileName,
        source_system: source,
        status: "PROCESSING",
      })
      .select()
      .single();
    if (errImp) throw errImp;

    // 2) pull the uploaded file from private storage
    const { data: blob, error: errDl } = await sb.storage
      .from("imports")
      .download(filePath);
    if (errDl || !blob) {
      await sb.from("data_imports").update({ status: "FAILED", errors: { download: String(errDl?.message ?? "no blob") } })
        .eq("import_id", importRow.import_id);
      return json({ ok: false, error: "DOWNLOAD_FAILED" }, 400);
    }

    // 3) parse workbook — first sheet only
    const buf = await blob.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

    if (rows.length === 0) {
      await sb.from("data_imports").update({ status: "FAILED", errors: { sheet: "no data rows" } })
        .eq("import_id", importRow.import_id);
      return json({ ok: false, error: "EMPTY_SHEET" }, 400);
    }

    // 4) map headers -> canonical fields
    const headers = Object.keys(rows[0]);
    const fieldByHeader = new Map<string, string>();
    for (const h of headers) {
      const mapped = HEADER_MAP[normalizeHeader(h)];
      if (mapped) fieldByHeader.set(h, mapped);
    }

    let rowsCreated = 0;
    let rowsUpdated = 0;
    const errors: unknown[] = [];

    // 5) upsert learners, dedup on sa_sams_id / cemis_id / (name+grade+section)
    for (const row of rows) {
      try {
        const rec: Record<string, unknown> = {
          school_id: schoolId,
          first_name: "",
          last_name: "",
          grade: 0,
          class_section: "",
          exempt_status: false,
        };
        for (const [h, canonical] of fieldByHeader.entries()) {
          const val = row[h];
          if (canonical === "exempt_status") {
            rec[canonical] = parseBool(val);
          } else if (canonical === "grade") {
            rec[canonical] = parseInt(cleanValue(val), 10) || 0;
          } else {
            rec[canonical] = cleanValue(val);
          }
        }
        if (!rec.first_name || !rec.last_name || !rec.grade) {
          errors.push({ row, reason: "missing first_name/last_name/grade" });
          continue;
        }

        // Dedupe lookup — prefer official system IDs
        let match = null;
        if (rec.sa_sams_id || rec.cemis_id) {
          const q = sb.from("learners").select("learner_id").eq("school_id", schoolId);
          const q2 = rec.sa_sams_id ? q.eq("sa_sams_id", rec.sa_sams_id) : q.eq("cemis_id", rec.cemis_id);
          const { data } = await q2.limit(1);
          match = data?.[0] ?? null;
        }
        if (!match) {
          const { data } = await sb
            .from("learners")
            .select("learner_id")
            .eq("school_id", schoolId)
            .eq("first_name", rec.first_name)
            .eq("last_name", rec.last_name)
            .eq("grade", rec.grade)
            .eq("class_section", rec.class_section)
            .limit(1);
          match = data?.[0] ?? null;
        }

        if (match) {
          const { error } = await sb
            .from("learners")
            .update({
              sa_sams_id: rec.sa_sams_id || undefined,
              cemis_id: rec.cemis_id || undefined,
              exempt_status: rec.exempt_status,
            })
            .eq("learner_id", match.learner_id);
          if (error) throw error;
          rowsUpdated += 1;
        } else {
          const { error } = await sb.from("learners").insert(rec);
          if (error) throw error;
          rowsCreated += 1;
        }
      } catch (e) {
        errors.push({ row, reason: e instanceof Error ? e.message : String(e) });
      }
    }

    // 6) finalize audit
    await sb.from("data_imports")
      .update({
        status: errors.length === rows.length ? "FAILED" : "COMPLETED",
        rows_parsed: rows.length,
        rows_created: rowsCreated,
        rows_updated: rowsUpdated,
        errors: errors.length ? errors : null,
      })
      .eq("import_id", importRow.import_id);

    return json({
      ok: true,
      import_id: importRow.import_id,
      source_system: source,
      sheet: sheetName,
      rows_parsed: rows.length,
      rows_created: rowsCreated,
      rows_updated: rowsUpdated,
      errors: errors.length,
    }, 200);
  } catch (err) {
    console.error("ingestion error", err);
    return json(
      { ok: false, error: err instanceof Error ? err.message : "PARSE_FAILURE" },
      500,
    );
  }
});
