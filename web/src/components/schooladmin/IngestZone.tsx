"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { FileSpreadsheet, Loader2, UploadCloud } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { invokeFunction } from "@/lib/supabase/functions";

interface IngestResult {
  ok: boolean;
  import_id?: string;
  source_system?: string;
  sheet?: string;
  rows_parsed?: number;
  rows_created?: number;
  rows_updated?: number;
  errors?: number;
  error?: string;
}

export function IngestZone({ schoolId }: { schoolId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<"SA_SAMS" | "CEMIS">("SA_SAMS");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) {
      setFile(accepted[0]);
      setResult(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
    },
    maxFiles: 1,
  });

  async function runIngestion() {
    if (!file) return;
    setBusy(true);
    setResult(null);
    const supabase = createClient();

    const path = `imports/${schoolId}/${file.name}`;
    const { error: upErr } = await supabase.storage
      .from("imports")
      .upload(path, file, { upsert: true });

    if (upErr) {
      setResult({ ok: false, error: `Upload failed: ${upErr.message}` });
      setBusy(false);
      return;
    }

    const res = await invokeFunction<IngestResult>("data-ingestion-parser", {
      file_path: path,
      school_id: schoolId,
      source,
    });
    setResult(res.data ?? { ok: false, error: res.error ?? "unknown error" });
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      {/* drag & drop zone */}
      <div
        {...getRootProps()}
        className={`grid cursor-pointer place-items-center rounded-lg border-2 border-dashed p-10 text-center transition ${
          isDragActive
            ? "border-cyan bg-cyan/10 shadow-neon"
            : "border-edge bg-void/40 hover:border-cyan/50"
        }`}
      >
        <input {...getInputProps()} />
        {file ? (
          <div className="flex flex-col items-center gap-2">
            <FileSpreadsheet className="h-10 w-10 text-cyan" />
            <p className="font-display text-xs uppercase tracking-widest text-ink">{file.name}</p>
            <p className="text-[11px] text-ghost">
              {(file.size / 1024).toFixed(1)} KB — drop a different file to replace
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <UploadCloud className="h-10 w-10 text-cyan" />
            <p className="font-display text-xs uppercase tracking-widest text-ink">
              {isDragActive ? "Release to upload" : "Drag & drop spreadsheet"}
            </p>
            <p className="text-[11px] text-ghost">
              SA-SAMS export or Western Cape CEMIS workbook (.xlsx / .xls)
            </p>
          </div>
        )}
      </div>

      {/* source selector */}
      <div className="flex items-center gap-2">
        <span className="label">Source system:</span>
        {(["SA_SAMS", "CEMIS"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSource(s)}
            className={`rounded-full border px-3 py-1 text-[11px] transition ${
              source === s
                ? "border-cyan/60 bg-cyan/15 text-cyan"
                : "border-edge text-ghost hover:text-ink"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* run */}
      <button onClick={runIngestion} disabled={!file || busy} className="btn-solid w-full">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
        {busy ? "Parsing & deduplicating…" : "Ingest & Clean Data"}
      </button>

      {/* result */}
      {result && (
        <div
          className={`rounded-md border p-4 text-xs ${
            result.ok
              ? "border-cyan/40 bg-cyan/5 text-cyan"
              : "border-crimson/50 bg-crimson/10 text-crimson"
          }`}
        >
          {result.ok ? (
            <ul className="space-y-1">
              <li className="font-semibold uppercase tracking-widest">
                ✓ {result.source_system} import completed
              </li>
              <li>Rows parsed: {result.rows_parsed}</li>
              <li>Created: {result.rows_created} · Updated (dedup): {result.rows_updated}</li>
              <li>Rejected rows: {result.errors}</li>
              <li className="mono-num text-[10px]">import_id: {result.import_id}</li>
            </ul>
          ) : (
            <p>{result.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
