CREATE TABLE IF NOT EXISTS "process_stages" (
	"id" serial PRIMARY KEY NOT NULL,
	"stage_name" varchar(100) NOT NULL,
	"stage_time" interval NOT NULL,
	"submitted_at" timestamp DEFAULT now(),
	CONSTRAINT "process_stages_stage_name_unique" UNIQUE("stage_name")
);
