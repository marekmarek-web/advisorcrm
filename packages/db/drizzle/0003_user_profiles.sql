CREATE TABLE IF NOT EXISTS "user_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"full_name" text,
	"email" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
