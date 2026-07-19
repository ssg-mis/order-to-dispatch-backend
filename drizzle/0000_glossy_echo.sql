CREATE TYPE "public"."delivery_purpose" AS ENUM('week-on-week', 'future-period');--> statement-breakpoint
CREATE TYPE "public"."order_category" AS ENUM('Sales', 'Stock Transfer');--> statement-breakpoint
CREATE TYPE "public"."order_through" AS ENUM('Direct', 'Broker', 'Salesperson');--> statement-breakpoint
CREATE TYPE "public"."order_type" AS ENUM('regular', 'pre-approval');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(50) NOT NULL,
	"password" text NOT NULL,
	"email" varchar(255),
	"phone_no" varchar(15),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"role" varchar(30) NOT NULL,
	"page_access" jsonb,
	"depo_access" jsonb,
	"features" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_code" varchar(50) NOT NULL,
	"status" varchar(20),
	"customer_name" varchar(255) NOT NULL,
	"pan" varchar(20),
	"gstin" varchar(20),
	"gst_registered" varchar(30),
	"contact_person" varchar(255),
	"contact" text,
	"email" varchar(255),
	"address_line_1" text,
	"address_line_2" text,
	"state" varchar(100),
	"pincode" varchar(10),
	"approval_status" varchar(20) DEFAULT 'approved' NOT NULL,
	"created_by" integer,
	"reviewed_by" integer,
	"rejection_reason" text,
	"pending_changes" jsonb,
	"pending_edit_by" integer,
	"pending_edit_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_customer_code_unique" UNIQUE("customer_code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skus" (
	"id" serial PRIMARY KEY NOT NULL,
	"sku_code" varchar(100) NOT NULL,
	"sku_name" varchar(255) NOT NULL,
	"status" varchar(20),
	"main_uom" varchar(50),
	"alternate_uom" varchar(50),
	"nos_per_main_uom" numeric(10, 2),
	"units" text,
	"oil_filling_per_unit" numeric(10, 3),
	"filling_units" text,
	"converted_kg" numeric(10, 3),
	"packing_weight_per_main_unit" numeric(10, 3),
	"weight_difference" numeric(10, 3),
	"sku_weight" numeric(10, 3),
	"packing_weight" numeric(10, 3),
	"gross_weight" numeric(10, 3),
	"extra_weight" numeric(10, 3) DEFAULT '0',
	"approval_status" varchar(20) DEFAULT 'approved' NOT NULL,
	"created_by" integer,
	"reviewed_by" integer,
	"rejection_reason" text,
	"pending_changes" jsonb,
	"pending_edit_by" integer,
	"pending_edit_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skus_sku_code_unique" UNIQUE("sku_code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "depots" (
	"id" serial PRIMARY KEY NOT NULL,
	"depot_code" text,
	"status" varchar(50),
	"depot_name" varchar(255) NOT NULL,
	"depot_address" text,
	"state" varchar(100),
	"approval_status" varchar(20) DEFAULT 'approved' NOT NULL,
	"created_by" integer,
	"reviewed_by" integer,
	"rejection_reason" text,
	"pending_changes" jsonb,
	"pending_edit_by" integer,
	"pending_edit_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "depots_depot_code_unique" UNIQUE("depot_code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "brokers" (
	"id" serial PRIMARY KEY NOT NULL,
	"broker_code" text,
	"status" varchar(20),
	"broker_name" varchar(255) NOT NULL,
	"email_id" varchar(255),
	"mobile_no" varchar(15),
	"depot_id" integer,
	"approval_status" varchar(20) DEFAULT 'approved' NOT NULL,
	"created_by" integer,
	"reviewed_by" integer,
	"rejection_reason" text,
	"pending_changes" jsonb,
	"pending_edit_by" integer,
	"pending_edit_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brokers_broker_code_unique" UNIQUE("broker_code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "salespersons" (
	"id" serial PRIMARY KEY NOT NULL,
	"salesperson_code" text,
	"status" varchar(20),
	"salesperson_name" varchar(255),
	"email_id" varchar(255),
	"mobile_no" varchar(15),
	"depot_id" integer,
	"approval_status" varchar(20) DEFAULT 'approved' NOT NULL,
	"created_by" integer,
	"reviewed_by" integer,
	"rejection_reason" text,
	"pending_changes" jsonb,
	"pending_edit_by" integer,
	"pending_edit_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "salespersons_salesperson_code_unique" UNIQUE("salesperson_code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transporters" (
	"id" serial PRIMARY KEY NOT NULL,
	"transporter_code" text,
	"status" varchar(20),
	"transporter_name" varchar(100) NOT NULL,
	"contact_person" varchar(100),
	"contact_number" varchar(15),
	"email_id" varchar(100),
	"address_line1" text,
	"state" varchar(50),
	"pincode" varchar(10),
	"pan" varchar(20),
	"gstin" varchar(20),
	"approval_status" varchar(20) DEFAULT 'approved' NOT NULL,
	"created_by" integer,
	"reviewed_by" integer,
	"rejection_reason" text,
	"pending_changes" jsonb,
	"pending_edit_by" integer,
	"pending_edit_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transporters_transporter_code_unique" UNIQUE("transporter_code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vehicles" (
	"id" serial PRIMARY KEY NOT NULL,
	"vehicle_code" varchar(50),
	"status" varchar(20),
	"registration_no" varchar(50) NOT NULL,
	"vehicle_type" varchar(50),
	"transporter_id" integer,
	"rto" varchar(50),
	"fuel_type" varchar(50),
	"road_tax" date,
	"road_tax_image" text,
	"life_time_tax" date,
	"life_time_tax_image" text,
	"pollution" date,
	"pollution_image" text,
	"insurance" date,
	"insurance_image" text,
	"fitness" date,
	"fitness_image" text,
	"state_permit" date,
	"state_permit_image" text,
	"state_permit_type" varchar(50),
	"national_permit" date,
	"national_permit_image" text,
	"rc_image" text,
	"gvw" numeric(10, 2),
	"ulw" numeric(10, 2),
	"passing" numeric(10, 2),
	"approval_status" varchar(20) DEFAULT 'approved' NOT NULL,
	"created_by" integer,
	"reviewed_by" integer,
	"rejection_reason" text,
	"pending_changes" jsonb,
	"pending_edit_by" integer,
	"pending_edit_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_vehicle_code_unique" UNIQUE("vehicle_code"),
	CONSTRAINT "vehicles_registration_no_unique" UNIQUE("registration_no")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drivers" (
	"id" serial PRIMARY KEY NOT NULL,
	"driver_code" varchar(20),
	"status" varchar(20),
	"driver_name" varchar(100) NOT NULL,
	"driving_licence_no" varchar(50),
	"driving_licence_type" varchar(50),
	"valid_upto" date,
	"rto" varchar(50),
	"mobile_no" varchar(15),
	"email_id" varchar(100),
	"address_line1" text,
	"state" varchar(50),
	"pincode" varchar(10),
	"aadhaar_no" varchar(20),
	"pan_no" text,
	"aadhaar_upload" text,
	"dl_upload" text,
	"approval_status" varchar(20) DEFAULT 'approved' NOT NULL,
	"created_by" integer,
	"reviewed_by" integer,
	"rejection_reason" text,
	"pending_changes" jsonb,
	"pending_edit_by" integer,
	"pending_edit_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drivers_driver_code_unique" UNIQUE("driver_code"),
	CONSTRAINT "drivers_driving_licence_no_unique" UNIQUE("driving_licence_no")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_no" varchar(50) NOT NULL,
	"customer_id" integer,
	"depot_id" integer,
	"broker_id" integer,
	"salesperson_id" integer,
	"order_type" "order_type",
	"order_category" "order_category",
	"delivery_purpose" "delivery_purpose",
	"order_through" "order_through",
	"customer_type" varchar(50),
	"party_so_date" date,
	"start_date" date,
	"end_date" date,
	"delivery_date" date,
	"future_period_date" date,
	"customer_contact_person_name" varchar(255),
	"customer_contact_person_whatsapp_no" varchar(20),
	"customer_address" text,
	"customer_delivery_address" text,
	"payment_terms" varchar(100),
	"advance_payment_to_be_taken" boolean DEFAULT false,
	"advance_amount" numeric(12, 4),
	"type_of_transporting" varchar(100),
	"freight_rate" numeric(10, 2) DEFAULT '0',
	"bill_company_name" varchar(255),
	"bill_address" text,
	"ship_company_name" varchar(255),
	"ship_address" text,
	"gst" text,
	"process_id" text,
	"upload_so" text,
	"upload_copy" text,
	"order_punch_remarks" text,
	"order_punch_user_id" integer,
	"timestamp_created" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_no_unique" UNIQUE("order_no")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"sku_id" integer,
	"source_order_no" varchar(50),
	"uom" varchar(50),
	"alternate_uom" varchar(50),
	"alternate_qty_kg" numeric(12, 3),
	"oil_type" varchar(100),
	"order_quantity" numeric(15, 4),
	"approved_qty" numeric(15, 4),
	"remaining_qty" numeric(15, 4),
	"preclose_qty" numeric(15, 4) DEFAULT '0',
	"rate_of_material" numeric(12, 4),
	"final_rate" numeric(12, 4),
	"rate_per_15kg" numeric(12, 4),
	"rate_per_ltr" numeric(12, 4)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pre_approvals" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_item_id" integer NOT NULL,
	"planned_at" timestamp with time zone,
	"actual_at" timestamp with time zone,
	"delay" interval,
	"take_required_rates_each_item" boolean DEFAULT false,
	"approved_by_user_id" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "order_approvals" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_item_id" integer NOT NULL,
	"planned_at" timestamp with time zone,
	"actual_at" timestamp with time zone,
	"delay" interval,
	"rate_is_rightly_as_per_current_market_rate" boolean DEFAULT false,
	"we_are_dealing_in_ordered_sku" boolean DEFAULT false,
	"party_credit_status" varchar(50),
	"dispatch_date_confirmed" boolean DEFAULT false,
	"order_confirmation_with_customer" boolean DEFAULT false,
	"overall_status" varchar(50),
	"approved_by_user_id" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dispatch_plannings" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_item_id" integer NOT NULL,
	"planned_at" timestamp with time zone,
	"actual_at" timestamp with time zone,
	"delay" interval,
	"performed_by_user_id" integer,
	"revert_remarks" text,
	"revert_from_dispatch_remarks" text,
	"cancel_remarks" text,
	"cancelled_by_user_id" integer,
	"preclose_remarks" text,
	"preclose_by_user_id" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dispatches" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_item_id" integer NOT NULL,
	"dsr_number" varchar(50),
	"planned_at" timestamp with time zone,
	"actual_at" timestamp with time zone,
	"delay" interval,
	"performed_by_user_id" integer,
	"qty_to_be_dispatched" numeric(15, 4),
	"actual_qty_dispatch" numeric(15, 4),
	"actual_qty" numeric(15, 4),
	"check_status" text,
	"remarks" text,
	"dispatch_from" text,
	"vehicle_id" integer,
	"driver_id" integer,
	"transporter_id" integer,
	"vehicle_no_plate_image" text,
	"fitness_image" text,
	"fitness_end_date" date,
	"insurance_image" text,
	"insurance_end_date" date,
	"tax_copy_image" text,
	"tax_end_date" date,
	"pollution_image" text,
	"pollution_end_date" date,
	"permit1_image" text,
	"permit1_end_date" date,
	"permit2_out_state_image" text,
	"permit2_end_date" date,
	"weightment_slip_copy" text,
	"rst_no" text,
	"gross_weight" numeric(12, 3),
	"tare_weight" numeric(12, 3),
	"net_weight" numeric(12, 3),
	"extra_weight" numeric(12, 3) DEFAULT '0',
	"packaging_weight" numeric(10, 2) DEFAULT '0',
	"passing_weight" numeric(10, 2),
	"difference" numeric(10, 2) DEFAULT '0',
	"reason_of_weight_difference" text,
	"vehicle_overload_remarks" text,
	"freight_rate_type" varchar(50),
	"freight_amount" numeric(12, 2),
	"cd_amount" numeric(10, 4),
	"advance_bhada_bank" numeric(10, 2),
	"advance_bhada_diesel_advance" numeric(10, 2),
	"advance_bhada_cash" numeric(10, 2),
	"final_rate" numeric(10, 2),
	"is_transfer" boolean DEFAULT false,
	CONSTRAINT "dispatches_dsr_number_unique" UNIQUE("dsr_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "security_guard_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"dispatch_id" integer NOT NULL,
	"planned_at" timestamp with time zone,
	"actual_at" timestamp with time zone,
	"delay" interval,
	"verdict_status" varchar(20),
	"performed_by_user_id" integer,
	"revert_remarks" text,
	"bilty_no" text,
	"bilty_image" text,
	"vehicle_image_attachment" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"dispatch_id" integer NOT NULL,
	"planned_made_at" timestamp with time zone,
	"made_at" timestamp with time zone,
	"made_by_user_id" integer,
	"bill_type" varchar(50),
	"invoice_date" timestamp,
	"invoice_no" text,
	"invoice_copy" text,
	"qty" numeric(15, 4),
	"bill_amount" numeric(14, 2),
	"planned_checked_at" timestamp with time zone,
	"checked_at" timestamp with time zone,
	"checked_by_user_id" integer,
	"status" varchar(20),
	"check_remarks" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gate_outs" (
	"id" serial PRIMARY KEY NOT NULL,
	"dispatch_id" integer NOT NULL,
	"planned_at" timestamp with time zone,
	"actual_at" timestamp with time zone,
	"performed_by_user_id" integer,
	"gate_pass_copy" text,
	"vehicle_loaded_image" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "material_receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"dispatch_id" integer NOT NULL,
	"planned_at" timestamp with time zone,
	"actual_at" timestamp with time zone,
	"performed_by_user_id" integer,
	"material_received_date" date,
	"received_image_proof" text,
	"damage_status" varchar(50),
	"damage_qty" numeric(15, 4),
	"damage_image" text,
	"remarks" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "damage_adjustments" (
	"id" serial PRIMARY KEY NOT NULL,
	"dispatch_id" integer NOT NULL,
	"planned_at" timestamp with time zone,
	"actual_at" timestamp with time zone,
	"performed_by_user_id" integer,
	"status" varchar(50),
	"credit_note_date" date,
	"credit_note_no" text,
	"credit_note_copy" text,
	"credit_note_qty" numeric(15, 4),
	"credit_note_amount" numeric(14, 2),
	"net_balance" numeric(14, 2)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customers" ADD CONSTRAINT "customers_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customers" ADD CONSTRAINT "customers_pending_edit_by_users_id_fk" FOREIGN KEY ("pending_edit_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "skus" ADD CONSTRAINT "skus_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "skus" ADD CONSTRAINT "skus_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "skus" ADD CONSTRAINT "skus_pending_edit_by_users_id_fk" FOREIGN KEY ("pending_edit_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "depots" ADD CONSTRAINT "depots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "depots" ADD CONSTRAINT "depots_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "depots" ADD CONSTRAINT "depots_pending_edit_by_users_id_fk" FOREIGN KEY ("pending_edit_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "brokers" ADD CONSTRAINT "brokers_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "brokers" ADD CONSTRAINT "brokers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "brokers" ADD CONSTRAINT "brokers_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "brokers" ADD CONSTRAINT "brokers_pending_edit_by_users_id_fk" FOREIGN KEY ("pending_edit_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "salespersons" ADD CONSTRAINT "salespersons_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "salespersons" ADD CONSTRAINT "salespersons_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "salespersons" ADD CONSTRAINT "salespersons_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "salespersons" ADD CONSTRAINT "salespersons_pending_edit_by_users_id_fk" FOREIGN KEY ("pending_edit_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transporters" ADD CONSTRAINT "transporters_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transporters" ADD CONSTRAINT "transporters_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transporters" ADD CONSTRAINT "transporters_pending_edit_by_users_id_fk" FOREIGN KEY ("pending_edit_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_transporter_id_transporters_id_fk" FOREIGN KEY ("transporter_id") REFERENCES "public"."transporters"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_pending_edit_by_users_id_fk" FOREIGN KEY ("pending_edit_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drivers" ADD CONSTRAINT "drivers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drivers" ADD CONSTRAINT "drivers_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drivers" ADD CONSTRAINT "drivers_pending_edit_by_users_id_fk" FOREIGN KEY ("pending_edit_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_broker_id_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."brokers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_salesperson_id_salespersons_id_fk" FOREIGN KEY ("salesperson_id") REFERENCES "public"."salespersons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_order_punch_user_id_users_id_fk" FOREIGN KEY ("order_punch_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_items" ADD CONSTRAINT "order_items_sku_id_skus_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."skus"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pre_approvals" ADD CONSTRAINT "pre_approvals_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pre_approvals" ADD CONSTRAINT "pre_approvals_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_approvals" ADD CONSTRAINT "order_approvals_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_approvals" ADD CONSTRAINT "order_approvals_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dispatch_plannings" ADD CONSTRAINT "dispatch_plannings_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dispatch_plannings" ADD CONSTRAINT "dispatch_plannings_performed_by_user_id_users_id_fk" FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dispatch_plannings" ADD CONSTRAINT "dispatch_plannings_cancelled_by_user_id_users_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dispatch_plannings" ADD CONSTRAINT "dispatch_plannings_preclose_by_user_id_users_id_fk" FOREIGN KEY ("preclose_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_performed_by_user_id_users_id_fk" FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_transporter_id_transporters_id_fk" FOREIGN KEY ("transporter_id") REFERENCES "public"."transporters"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "security_guard_checks" ADD CONSTRAINT "security_guard_checks_dispatch_id_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."dispatches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "security_guard_checks" ADD CONSTRAINT "security_guard_checks_performed_by_user_id_users_id_fk" FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_dispatch_id_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."dispatches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_made_by_user_id_users_id_fk" FOREIGN KEY ("made_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_checked_by_user_id_users_id_fk" FOREIGN KEY ("checked_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gate_outs" ADD CONSTRAINT "gate_outs_dispatch_id_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."dispatches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gate_outs" ADD CONSTRAINT "gate_outs_performed_by_user_id_users_id_fk" FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "material_receipts" ADD CONSTRAINT "material_receipts_dispatch_id_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."dispatches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "material_receipts" ADD CONSTRAINT "material_receipts_performed_by_user_id_users_id_fk" FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "damage_adjustments" ADD CONSTRAINT "damage_adjustments_dispatch_id_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."dispatches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "damage_adjustments" ADD CONSTRAINT "damage_adjustments_performed_by_user_id_users_id_fk" FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
