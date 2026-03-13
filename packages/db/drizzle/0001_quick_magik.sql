ALTER TABLE "contract_upload_reviews" ADD COLUMN "reviewed_by" text;--> statement-breakpoint
ALTER TABLE "contract_upload_reviews" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contract_upload_reviews" ADD COLUMN "reject_reason" text;--> statement-breakpoint
ALTER TABLE "contract_upload_reviews" ADD COLUMN "applied_by" text;--> statement-breakpoint
ALTER TABLE "contract_upload_reviews" ADD COLUMN "applied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contract_upload_reviews" ADD COLUMN "matched_client_id" uuid;--> statement-breakpoint
ALTER TABLE "contract_upload_reviews" ADD COLUMN "create_new_client_confirmed" text;--> statement-breakpoint
ALTER TABLE "contract_upload_reviews" ADD COLUMN "apply_result_payload" jsonb;--> statement-breakpoint
ALTER TABLE "contract_upload_reviews" ADD COLUMN "review_decision_reason" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contract_upload_reviews" ADD CONSTRAINT "contract_upload_reviews_matched_client_id_contacts_id_fk" FOREIGN KEY ("matched_client_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
