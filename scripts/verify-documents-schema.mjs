/**
 * Ověří, že tabulka public.documents má sloupce odpovídající Drizzle schématu.
 * Spuštění (z kořene repa):
 *   PowerShell:  $env:DATABASE_URL="postgresql://..."; node scripts/verify-documents-schema.mjs
 *   Nebo:        node --env-file=apps/web/.env.local scripts/verify-documents-schema.mjs
 */
import postgres from "postgres";

const REQUIRED = [
  "id",
  "tenant_id",
  "contact_id",
  "contract_id",
  "opportunity_id",
  "name",
  "document_type",
  "storage_path",
  "mime_type",
  "size_bytes",
  "tags",
  "visible_to_client",
  "upload_source",
  "sensitive",
  "uploaded_by",
  "page_count",
  "captured_platform",
  "has_text_layer",
  "is_scan_like",
  "source_channel",
  "detected_input_mode",
  "document_fingerprint",
  "readability_score",
  "normalized_pdf_path",
  "preprocessing_warnings",
  "page_text_map",
  "page_image_refs",
  "capture_mode",
  "capture_quality_warnings",
  "manual_crop_applied",
  "rotation_adjusted",
  "processing_provider",
  "processing_status",
  "processing_stage",
  "business_status",
  "processing_error",
  "processing_started_at",
  "processing_finished_at",
  "ocr_pdf_path",
  "markdown_path",
  "markdown_content",
  "extract_json_path",
  "ai_input_source",
  "archived_at",
  "created_at",
  "updated_at",
];

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[verify-documents-schema] Nastavte DATABASE_URL (nebo použijte node --env-file=apps/web/.env.local).");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

try {
  const rows = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'documents'
  `;
  const have = new Set(rows.map((r) => r.column_name));
  const missing = REQUIRED.filter((c) => !have.has(c));
  if (missing.length) {
    console.error("[verify-documents-schema] Chybí sloupce v documents:", missing.join(", "));
    console.error("Spusťte packages/db/migrations/documents_schema_sync_2026.sql v Supabase SQL Editor.");
    process.exit(2);
  }
  const jobs = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'document_processing_jobs'
    ) AS ok
  `;
  if (!jobs[0]?.ok) {
    console.error("[verify-documents-schema] Chybí tabulka document_processing_jobs.");
    process.exit(3);
  }
  console.log("[verify-documents-schema] OK — documents má všechny očekávané sloupce a document_processing_jobs existuje.");
} finally {
  await sql.end({ timeout: 2 });
}
