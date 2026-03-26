-- AI Review: optional pipeline sub-step + dokumentace nových hodnot processing_status (text; žádný CHECK).
-- Hodnoty scan_pending_ocr a blocked ukládá aplikace do stávajícího sloupce processing_status.

ALTER TABLE "contract_upload_reviews" ADD COLUMN IF NOT EXISTS "processing_stage" text;
--> statement-breakpoint
COMMENT ON COLUMN "contract_upload_reviews"."processing_status" IS 'Pipeline: uploaded, processing, extracted, review_required, failed, scan_pending_ocr (čeká na OCR/sken), blocked (např. chybí kritická pole — bez apply do portálu).';
--> statement-breakpoint
COMMENT ON COLUMN "contract_upload_reviews"."processing_stage" IS 'Podkrok během processing (např. classifying, extracting); po dokončení se maže.';
