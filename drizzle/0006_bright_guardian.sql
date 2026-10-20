CREATE TABLE "author_directives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_id" uuid NOT NULL,
	"entry_id" uuid,
	"scope" text NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"pattern" text,
	"speech_level" text,
	"target_chars" integer,
	"chapter_position" integer,
	"source" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "facts" ADD COLUMN "reveal_at_position" integer;--> statement-breakpoint
ALTER TABLE "wiki_entries" ADD COLUMN "context_tier" text DEFAULT 'mention' NOT NULL;--> statement-breakpoint
ALTER TABLE "author_directives" ADD CONSTRAINT "author_directives_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_directives" ADD CONSTRAINT "author_directives_entry_id_wiki_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."wiki_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_directives" ADD CONSTRAINT "author_directives_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "author_directives_work_idx" ON "author_directives" USING btree ("work_id");