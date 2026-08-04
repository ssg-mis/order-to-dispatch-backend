--
-- PostgreSQL database dump
--

\restrict iG79zUM6ojrNi1JDXCGR573MSwn3FRijUfeUZ2bSbVErXO3gAvxcjuef1FeFrdi

-- Dumped from database version 16.14 (Debian 16.14-1.pgdg13+1)
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: drizzle; Type: SCHEMA; Schema: -; Owner: o2d
--

CREATE SCHEMA drizzle;


ALTER SCHEMA drizzle OWNER TO o2d;

--
-- Name: delivery_purpose; Type: TYPE; Schema: public; Owner: o2d
--

CREATE TYPE public.delivery_purpose AS ENUM (
    'week-on-week',
    'future-period'
);


ALTER TYPE public.delivery_purpose OWNER TO o2d;

--
-- Name: order_category; Type: TYPE; Schema: public; Owner: o2d
--

CREATE TYPE public.order_category AS ENUM (
    'Sales',
    'Stock Transfer'
);


ALTER TYPE public.order_category OWNER TO o2d;

--
-- Name: order_through; Type: TYPE; Schema: public; Owner: o2d
--

CREATE TYPE public.order_through AS ENUM (
    'Direct',
    'Broker',
    'Salesperson'
);


ALTER TYPE public.order_through OWNER TO o2d;

--
-- Name: order_type; Type: TYPE; Schema: public; Owner: o2d
--

CREATE TYPE public.order_type AS ENUM (
    'regular',
    'pre-approval'
);


ALTER TYPE public.order_type OWNER TO o2d;

--
-- Name: enforce_dispatch_within_order_qty(); Type: FUNCTION; Schema: public; Owner: o2d
--

CREATE FUNCTION public.enforce_dispatch_within_order_qty() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  oq       numeric;
  category text;
  shipped  numeric;
  tol      numeric := 0.0001;
BEGIN
  SELECT oi.order_quantity, o.order_category INTO oq, category
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE oi.id = NEW.order_item_id;

  IF UPPER(TRIM(category)) = 'STOCK TRANSFER' THEN
    RETURN NEW;
  END IF;
  IF oq IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(qty_to_be_dispatched), 0) INTO shipped
    FROM dispatches
    WHERE order_item_id = NEW.order_item_id AND id <> NEW.id;
  shipped := shipped + COALESCE(NEW.qty_to_be_dispatched, 0);

  IF shipped > oq + tol THEN
    RAISE EXCEPTION 'dispatched total (%) exceeds order qty (%) for order_item %',
      shipped, oq, NEW.order_item_id USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.enforce_dispatch_within_order_qty() OWNER TO o2d;

--
-- Name: enforce_order_item_qty_within_original(); Type: FUNCTION; Schema: public; Owner: o2d
--

CREATE FUNCTION public.enforce_order_item_qty_within_original() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  root_id   integer;
  cap       numeric;
  category  text;
  fam_total numeric;
  tol       numeric := 0.0001;
BEGIN
  root_id := COALESCE(NEW.budget_root_id, NEW.id);

  -- Same normalized discriminator the app/reports use (stageUtils.isStockTransfer,
  -- inventoryService SQL): the enum guarantees the exact value, we normalize anyway
  -- so every layer asks the question identically.
  SELECT o.order_category INTO category FROM orders o WHERE o.id = NEW.order_id;
  IF UPPER(TRIM(category)) = 'STOCK TRANSFER' THEN
    RETURN NEW;
  END IF;

  -- Cap = the family root's frozen original punch quantity.
  IF root_id = NEW.id THEN
    cap := NEW.original_order_quantity;
  ELSE
    SELECT original_order_quantity INTO cap FROM order_items WHERE id = root_id;
  END IF;
  IF cap IS NULL THEN
    RETURN NEW;   -- no anchor to enforce against (defensive)
  END IF;

  IF NEW.approved_qty IS NOT NULL AND NEW.approved_qty > cap + tol THEN
    RAISE EXCEPTION 'approved_qty (%) exceeds original order qty (%) [family root %]',
      NEW.approved_qty, cap, root_id USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.remaining_qty IS NOT NULL AND NEW.remaining_qty > cap + tol THEN
    RAISE EXCEPTION 'remaining_qty (%) exceeds original order qty (%) [family root %]',
      NEW.remaining_qty, cap, root_id USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(SUM(order_quantity), 0) INTO fam_total
    FROM order_items
    WHERE COALESCE(budget_root_id, id) = root_id AND id <> NEW.id;
  fam_total := fam_total + COALESCE(NEW.order_quantity, 0);

  IF fam_total > cap + tol THEN
    RAISE EXCEPTION 'total order qty (%) exceeds original punch qty (%) [family root %]',
      fam_total, cap, root_id USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.enforce_order_item_qty_within_original() OWNER TO o2d;

--
-- Name: resolve_customer_depot(); Type: FUNCTION; Schema: public; Owner: o2d
--

CREATE FUNCTION public.resolve_customer_depot() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  n   integer;
  did integer;
BEGIN
  IF NEW.depot_id IS NULL AND NEW.customer_name IS NOT NULL THEN
    SELECT COUNT(*), MIN(d.id) INTO n, did
      FROM depots d
      WHERE d.status = 'Active'
        AND NEW.customer_name ILIKE '%' || d.depot_name || '%';
    IF n = 1 THEN
      NEW.depot_id := did;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.resolve_customer_depot() OWNER TO o2d;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: __drizzle_migrations; Type: TABLE; Schema: drizzle; Owner: o2d
--

CREATE TABLE drizzle.__drizzle_migrations (
    id integer NOT NULL,
    hash text NOT NULL,
    created_at bigint
);


ALTER TABLE drizzle.__drizzle_migrations OWNER TO o2d;

--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE; Schema: drizzle; Owner: o2d
--

CREATE SEQUENCE drizzle.__drizzle_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNER TO o2d;

--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: drizzle; Owner: o2d
--

ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNED BY drizzle.__drizzle_migrations.id;


--
-- Name: brokers; Type: TABLE; Schema: public; Owner: o2d
--

CREATE TABLE public.brokers (
    id integer NOT NULL,
    broker_code text,
    status character varying(20),
    broker_name character varying(255) NOT NULL,
    email_id character varying(255),
    mobile_no character varying(15),
    depot_id integer,
    approval_status character varying(20) DEFAULT 'approved'::character varying NOT NULL,
    created_by integer,
    reviewed_by integer,
    rejection_reason text,
    pending_changes jsonb,
    pending_edit_by integer,
    pending_edit_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.brokers OWNER TO o2d;

--
-- Name: brokers_id_seq; Type: SEQUENCE; Schema: public; Owner: o2d
--

CREATE SEQUENCE public.brokers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.brokers_id_seq OWNER TO o2d;

--
-- Name: brokers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: o2d
--

ALTER SEQUENCE public.brokers_id_seq OWNED BY public.brokers.id;


--
-- Name: commitment_details; Type: TABLE; Schema: public; Owner: o2d
--

CREATE TABLE public.commitment_details (
    id integer NOT NULL,
    commitment_id integer NOT NULL,
    order_id integer,
    order_item_id integer,
    raised_at timestamp with time zone,
    delay_days integer,
    po_no text,
    po_date date,
    sku_id integer,
    sku_quantity numeric(15,4),
    sku_rate numeric(12,4),
    sku_weight_mt numeric(15,4),
    remarks text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.commitment_details OWNER TO o2d;

--
-- Name: commitment_details_id_seq; Type: SEQUENCE; Schema: public; Owner: o2d
--

CREATE SEQUENCE public.commitment_details_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.commitment_details_id_seq OWNER TO o2d;

--
-- Name: commitment_details_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: o2d
--

ALTER SEQUENCE public.commitment_details_id_seq OWNED BY public.commitment_details.id;


--
-- Name: commitment_main; Type: TABLE; Schema: public; Owner: o2d
--

CREATE TABLE public.commitment_main (
    id integer NOT NULL,
    commitment_no character varying(50) NOT NULL,
    commitment_date date,
    customer_id integer,
    oil_type character varying(100),
    quantity numeric(15,4),
    unit character varying(50),
    rate numeric(12,4),
    planned_at timestamp with time zone,
    customer_contact_person_name character varying(255),
    whatsapp_no character varying(20),
    address text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.commitment_main OWNER TO o2d;

--
-- Name: commitment_main_id_seq; Type: SEQUENCE; Schema: public; Owner: o2d
--

CREATE SEQUENCE public.commitment_main_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.commitment_main_id_seq OWNER TO o2d;

--
-- Name: commitment_main_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: o2d
--

ALTER SEQUENCE public.commitment_main_id_seq OWNED BY public.commitment_main.id;


--
-- Name: customers; Type: TABLE; Schema: public; Owner: o2d
--

CREATE TABLE public.customers (
    id integer NOT NULL,
    customer_code character varying(50) NOT NULL,
    status character varying(20),
    customer_name character varying(255) NOT NULL,
    pan character varying(20),
    gstin character varying(20),
    gst_registered character varying(30),
    contact_person character varying(255),
    contact text,
    email character varying(255),
    address_line_1 text,
    address_line_2 text,
    state character varying(100),
    pincode character varying(10),
    approval_status character varying(20) DEFAULT 'approved'::character varying NOT NULL,
    created_by integer,
    reviewed_by integer,
    rejection_reason text,
    pending_changes jsonb,
    pending_edit_by integer,
    pending_edit_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    depot_id integer
);


ALTER TABLE public.customers OWNER TO o2d;

--
-- Name: customers_id_seq; Type: SEQUENCE; Schema: public; Owner: o2d
--

CREATE SEQUENCE public.customers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.customers_id_seq OWNER TO o2d;

--
-- Name: customers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: o2d
--

ALTER SEQUENCE public.customers_id_seq OWNED BY public.customers.id;


--
-- Name: damage_adjustments; Type: TABLE; Schema: public; Owner: o2d
--

CREATE TABLE public.damage_adjustments (
    id integer NOT NULL,
    dispatch_id integer NOT NULL,
    planned_at timestamp with time zone,
    actual_at timestamp with time zone,
    performed_by_user_id integer,
    status character varying(50),
    credit_note_date date,
    credit_note_no text,
    credit_note_copy text,
    credit_note_qty numeric(15,4),
    credit_note_amount numeric(14,2),
    net_balance numeric(14,2)
);


ALTER TABLE public.damage_adjustments OWNER TO o2d;

--
-- Name: damage_adjustments_id_seq; Type: SEQUENCE; Schema: public; Owner: o2d
--

CREATE SEQUENCE public.damage_adjustments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.damage_adjustments_id_seq OWNER TO o2d;

--
-- Name: damage_adjustments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: o2d
--

ALTER SEQUENCE public.damage_adjustments_id_seq OWNED BY public.damage_adjustments.id;


--
-- Name: depots; Type: TABLE; Schema: public; Owner: o2d
--

CREATE TABLE public.depots (
    id integer NOT NULL,
    depot_code text,
    status character varying(50),
    depot_name character varying(255) NOT NULL,
    depot_address text,
    state character varying(100),
    approval_status character varying(20) DEFAULT 'approved'::character varying NOT NULL,
    created_by integer,
    reviewed_by integer,
    rejection_reason text,
    pending_changes jsonb,
    pending_edit_by integer,
    pending_edit_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.depots OWNER TO o2d;

--
-- Name: depots_id_seq; Type: SEQUENCE; Schema: public; Owner: o2d
--

CREATE SEQUENCE public.depots_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.depots_id_seq OWNER TO o2d;

--
-- Name: depots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: o2d
--

ALTER SEQUENCE public.depots_id_seq OWNED BY public.depots.id;


--
-- Name: dispatch_drafts; Type: TABLE; Schema: public; Owner: o2d
--

CREATE TABLE public.dispatch_drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username text NOT NULL,
    order_key text NOT NULL,
    draft_data jsonb NOT NULL,
    saved_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.dispatch_drafts OWNER TO o2d;

--
-- Name: dispatch_plannings; Type: TABLE; Schema: public; Owner: o2d
--

CREATE TABLE public.dispatch_plannings (
    id integer NOT NULL,
    order_item_id integer NOT NULL,
    planned_at timestamp with time zone,
    actual_at timestamp with time zone,
    performed_by_user_id integer,
    revert_remarks text,
    revert_from_dispatch_remarks text,
    cancel_remarks text,
    cancelled_by_user_id integer,
    preclose_remarks text,
    preclose_by_user_id integer
);


ALTER TABLE public.dispatch_plannings OWNER TO o2d;

--
-- Name: dispatch_plannings_id_seq; Type: SEQUENCE; Schema: public; Owner: o2d
--

CREATE SEQUENCE public.dispatch_plannings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.dispatch_plannings_id_seq OWNER TO o2d;

--
-- Name: dispatch_plannings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: o2d
--

ALTER SEQUENCE public.dispatch_plannings_id_seq OWNED BY public.dispatch_plannings.id;


--
-- Name: dispatches; Type: TABLE; Schema: public; Owner: o2d
--

CREATE TABLE public.dispatches (
    id integer NOT NULL,
    order_item_id integer NOT NULL,
    dsr_number character varying(50),
    planned_at timestamp with time zone,
    actual_at timestamp with time zone,
    performed_by_user_id integer,
    qty_to_be_dispatched numeric(15,4),
    actual_qty_dispatch numeric(15,4),
    actual_qty numeric(15,4),
    check_status text,
    remarks text,
    dispatch_from text,
    vehicle_id integer,
    driver_id integer,
    transporter_id integer,
    vehicle_no_plate_image text,
    fitness_image text,
    fitness_end_date date,
    insurance_image text,
    insurance_end_date date,
    tax_copy_image text,
    tax_end_date date,
    pollution_image text,
    pollution_end_date date,
    permit1_image text,
    permit1_end_date date,
    permit2_out_state_image text,
    permit2_end_date date,
    weightment_slip_copy text,
    rst_no text,
    gross_weight numeric(12,3),
    tare_weight numeric(12,3),
    net_weight numeric(12,3),
    extra_weight numeric(12,3) DEFAULT '0'::numeric,
    packaging_weight numeric(10,2) DEFAULT '0'::numeric,
    passing_weight numeric(10,2),
    difference numeric(10,2) DEFAULT '0'::numeric,
    reason_of_weight_difference text,
    vehicle_overload_remarks text,
    freight_rate_type character varying(50),
    freight_amount numeric(12,2),
    cd_amount numeric(10,4),
    advance_bhada_bank numeric(10,2),
    advance_bhada_diesel_advance numeric(10,2),
    advance_bhada_cash numeric(10,2),
    final_rate numeric(10,2),
    is_transfer boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    manual_sauda_no text
);


ALTER TABLE public.dispatches OWNER TO o2d;

--
-- Name: dispatches_id_seq; Type: SEQUENCE; Schema: public; Owner: o2d
--

CREATE SEQUENCE public.dispatches_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.dispatches_id_seq OWNER TO o2d;

--
-- Name: dispatches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: o2d
--

ALTER SEQUENCE public.dispatches_id_seq OWNED BY public.dispatches.id;


--
-- Name: drivers; Type: TABLE; Schema: public; Owner: o2d
--

CREATE TABLE public.drivers (
    id integer NOT NULL,
    driver_code character varying(20),
    status character varying(20),
    driver_name character varying(100) NOT NULL,
    driving_licence_no character varying(50),
    driving_licence_type character varying(50),
    valid_upto date,
    rto character varying(50),
    mobile_no character varying(15),
    email_id character varying(100),
    address_line1 text,
    state character varying(50),
    pincode character varying(10),
    aadhaar_no character varying(20),
    pan_no text,
    aadhaar_upload text,
    dl_upload text,
    approval_status character varying(20) DEFAULT 'approved'::character varying NOT NULL,
    created_by integer,
    reviewed_by integer,
    rejection_reason text,
    pending_changes jsonb,
    pending_edit_by integer,
    pending_edit_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.drivers OWNER TO o2d;

--
-- Name: drivers_id_seq; Type: SEQUENCE; Schema: public; Owner: o2d
--

CREATE SEQUENCE public.drivers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.drivers_id_seq OWNER TO o2d;

--
-- Name: drivers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: o2d
--

ALTER SEQUENCE public.drivers_id_seq OWNED BY public.drivers.id;


--
-- Name: gate_in_records; Type: TABLE; Schema: public; Owner: o2d
--

CREATE TABLE public.gate_in_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_key text NOT NULL,
    username text NOT NULL,
    front_vehicle_image text,
    back_vehicle_image text,
    driver_photo text,
    gatepass_photo text,
    submitted_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.gate_in_records OWNER TO o2d;

--
-- Name: gate_outs; Type: TABLE; Schema: public; Owner: o2d
--

CREATE TABLE public.gate_outs (
    id integer NOT NULL,
    dispatch_id integer NOT NULL,
    planned_at timestamp with time zone,
    actual_at timestamp with time zone,
    performed_by_user_id integer,
    gate_pass_copy text,
    vehicle_loaded_image text
);


ALTER TABLE public.gate_outs OWNER TO o2d;

--
-- Name: gate_outs_id_seq; Type: SEQUENCE; Schema: public; Owner: o2d
--

CREATE SEQUENCE public.gate_outs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.gate_outs_id_seq OWNER TO o2d;

--
-- Name: gate_outs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: o2d
--

ALTER SEQUENCE public.gate_outs_id_seq OWNED BY public.gate_outs.id;


--
-- Name: inventory_opening_qty; Type: TABLE; Schema: public; Owner: o2d
--

CREATE TABLE public.inventory_opening_qty (
    id integer NOT NULL,
    depo_name text NOT NULL,
    product_name text NOT NULL,
    opening_qty integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.inventory_opening_qty OWNER TO o2d;

--
-- Name: inventory_opening_qty_id_seq; Type: SEQUENCE; Schema: public; Owner: o2d
--

CREATE SEQUENCE public.inventory_opening_qty_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.inventory_opening_qty_id_seq OWNER TO o2d;

--
-- Name: inventory_opening_qty_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: o2d
--

ALTER SEQUENCE public.inventory_opening_qty_id_seq OWNED BY public.inventory_opening_qty.id;


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: o2d
--

CREATE TABLE public.invoices (
    id integer NOT NULL,
    dispatch_id integer NOT NULL,
    planned_made_at timestamp with time zone,
    made_at timestamp with time zone,
    made_by_user_id integer,
    bill_type character varying(50),
    invoice_date timestamp without time zone,
    invoice_no text,
    invoice_copy text,
    qty numeric(15,4),
    bill_amount numeric(14,2),
    planned_checked_at timestamp with time zone,
    checked_at timestamp with time zone,
    checked_by_user_id integer,
    status character varying(20),
    check_remarks text
);


ALTER TABLE public.invoices OWNER TO o2d;

--
-- Name: invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: o2d
--

CREATE SEQUENCE public.invoices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.invoices_id_seq OWNER TO o2d;

--
-- Name: invoices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: o2d
--

ALTER SEQUENCE public.invoices_id_seq OWNED BY public.invoices.id;


--
-- Name: material_receipts; Type: TABLE; Schema: public; Owner: o2d
--

CREATE TABLE public.material_receipts (
    id integer NOT NULL,
    dispatch_id integer NOT NULL,
    planned_at timestamp with time zone,
    actual_at timestamp with time zone,
    performed_by_user_id integer,
    material_received_date date,
    received_image_proof text,
    damage_status character varying(50),
    damage_qty numeric(15,4),
    damage_image text,
    remarks text
);


ALTER TABLE public.material_receipts OWNER TO o2d;

--
-- Name: material_receipts_id_seq; Type: SEQUENCE; Schema: public; Owner: o2d
--

CREATE SEQUENCE public.material_receipts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.material_receipts_id_seq OWNER TO o2d;

--
-- Name: material_receipts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: o2d
--

ALTER SEQUENCE public.material_receipts_id_seq OWNED BY public.material_receipts.id;


--
-- Name: order_approvals; Type: TABLE; Schema: public; Owner: o2d
--

CREATE TABLE public.order_approvals (
    id integer NOT NULL,
    order_item_id integer NOT NULL,
    planned_at timestamp with time zone,
    actual_at timestamp with time zone,
    rate_is_rightly_as_per_current_market_rate boolean DEFAULT false,
    we_are_dealing_in_ordered_sku boolean DEFAULT false,
    party_credit_status character varying(50),
    dispatch_date_confirmed boolean DEFAULT false,
    order_confirmation_with_customer boolean DEFAULT false,
    overall_status character varying(50),
    approved_by_user_id integer
);


ALTER TABLE public.order_approvals OWNER TO o2d;

--
-- Name: order_approvals_id_seq; Type: SEQUENCE; Schema: public; Owner: o2d
--

CREATE SEQUENCE public.order_approvals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.order_approvals_id_seq OWNER TO o2d;

--
-- Name: order_approvals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: o2d
--

ALTER SEQUENCE public.order_approvals_id_seq OWNED BY public.order_approvals.id;


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: o2d
--

CREATE TABLE public.order_items (
    id integer NOT NULL,
    order_id integer NOT NULL,
    sku_id integer,
    source_order_no character varying(50),
    uom character varying(50),
    alternate_uom character varying(50),
    alternate_qty_kg numeric(12,3),
    oil_type character varying(100),
    order_quantity numeric(15,4),
    approved_qty numeric(15,4),
    remaining_qty numeric(15,4),
    preclose_qty numeric(15,4) DEFAULT '0'::numeric,
    rate_of_material numeric(12,4),
    final_rate numeric(12,4),
    rate_per_15kg numeric(12,4),
    rate_per_ltr numeric(12,4),
    origin character varying(10) DEFAULT 'punch'::character varying NOT NULL,
    split_from_item_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    original_order_quantity numeric(15,4),
    budget_root_id integer
);


ALTER TABLE public.order_items OWNER TO o2d;

--
-- Name: order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: o2d
--

CREATE SEQUENCE public.order_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.order_items_id_seq OWNER TO o2d;

--
-- Name: order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: o2d
--

ALTER SEQUENCE public.order_items_id_seq OWNED BY public.order_items.id;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: o2d
--

CREATE TABLE public.orders (
    id integer NOT NULL,
    order_no character varying(50) NOT NULL,
    customer_id integer,
    depot_id integer,
    broker_id integer,
    salesperson_id integer,
    order_type public.order_type,
    order_category public.order_category,
    delivery_purpose public.delivery_purpose,
    order_through public.order_through,
    customer_type character varying(50),
    party_so_date date,
    start_date date,
    end_date date,
    delivery_date date,
    future_period_date date,
    customer_contact_person_name character varying(255),
    customer_contact_person_whatsapp_no character varying(20),
    customer_address text,
    customer_delivery_address text,
    payment_terms character varying(100),
    advance_payment_to_be_taken boolean DEFAULT false,
    advance_amount numeric(12,4),
    type_of_transporting character varying(100),
    freight_rate numeric(10,2) DEFAULT '0'::numeric,
    bill_company_name character varying(255),
    bill_address text,
    ship_company_name character varying(255),
    ship_address text,
    gst text,
    manual_sauda_no text,
    upload_so text,
    upload_copy text,
    order_punch_remarks text,
    order_punch_user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.orders OWNER TO o2d;

--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: o2d
--

CREATE SEQUENCE public.orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.orders_id_seq OWNER TO o2d;

--
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: o2d
--

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;


--
-- Name: pre_approvals; Type: TABLE; Schema: public; Owner: o2d
--

CREATE TABLE public.pre_approvals (
    id integer NOT NULL,
    order_item_id integer NOT NULL,
    planned_at timestamp with time zone,
    actual_at timestamp with time zone,
    take_required_rates_each_item boolean DEFAULT false,
    approved_by_user_id integer
);


ALTER TABLE public.pre_approvals OWNER TO o2d;

--
-- Name: pre_approvals_id_seq; Type: SEQUENCE; Schema: public; Owner: o2d
--

CREATE SEQUENCE public.pre_approvals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.pre_approvals_id_seq OWNER TO o2d;

--
-- Name: pre_approvals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: o2d
--

ALTER SEQUENCE public.pre_approvals_id_seq OWNED BY public.pre_approvals.id;


--
-- Name: process_stages; Type: TABLE; Schema: public; Owner: o2d
--

CREATE TABLE public.process_stages (
    id integer NOT NULL,
    stage_name character varying(100) NOT NULL,
    stage_time interval NOT NULL,
    submitted_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.process_stages OWNER TO o2d;

--
-- Name: process_stages_id_seq; Type: SEQUENCE; Schema: public; Owner: o2d
--

CREATE SEQUENCE public.process_stages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.process_stages_id_seq OWNER TO o2d;

--
-- Name: process_stages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: o2d
--

ALTER SEQUENCE public.process_stages_id_seq OWNED BY public.process_stages.id;


--
-- Name: production; Type: TABLE; Schema: public; Owner: o2d
--

CREATE TABLE public.production (
    id integer NOT NULL,
    sku_name text NOT NULL,
    date date NOT NULL,
    qty integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.production OWNER TO o2d;

--
-- Name: production_id_seq; Type: SEQUENCE; Schema: public; Owner: o2d
--

CREATE SEQUENCE public.production_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.production_id_seq OWNER TO o2d;

--
-- Name: production_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: o2d
--

ALTER SEQUENCE public.production_id_seq OWNED BY public.production.id;


--
-- Name: salespersons; Type: TABLE; Schema: public; Owner: o2d
--

CREATE TABLE public.salespersons (
    id integer NOT NULL,
    salesperson_code text,
    status character varying(20),
    salesperson_name character varying(255),
    email_id character varying(255),
    mobile_no character varying(15),
    depot_id integer,
    approval_status character varying(20) DEFAULT 'approved'::character varying NOT NULL,
    created_by integer,
    reviewed_by integer,
    rejection_reason text,
    pending_changes jsonb,
    pending_edit_by integer,
    pending_edit_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.salespersons OWNER TO o2d;

--
-- Name: salespersons_id_seq; Type: SEQUENCE; Schema: public; Owner: o2d
--

CREATE SEQUENCE public.salespersons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.salespersons_id_seq OWNER TO o2d;

--
-- Name: salespersons_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: o2d
--

ALTER SEQUENCE public.salespersons_id_seq OWNED BY public.salespersons.id;


--
-- Name: security_guard_checks; Type: TABLE; Schema: public; Owner: o2d
--

CREATE TABLE public.security_guard_checks (
    id integer NOT NULL,
    dispatch_id integer NOT NULL,
    planned_at timestamp with time zone,
    actual_at timestamp with time zone,
    verdict_status character varying(20),
    performed_by_user_id integer,
    revert_remarks text,
    bilty_no text,
    bilty_image text,
    vehicle_image_attachment text
);


ALTER TABLE public.security_guard_checks OWNER TO o2d;

--
-- Name: security_guard_checks_id_seq; Type: SEQUENCE; Schema: public; Owner: o2d
--

CREATE SEQUENCE public.security_guard_checks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.security_guard_checks_id_seq OWNER TO o2d;

--
-- Name: security_guard_checks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: o2d
--

ALTER SEQUENCE public.security_guard_checks_id_seq OWNED BY public.security_guard_checks.id;


--
-- Name: sku_rate; Type: TABLE; Schema: public; Owner: o2d
--

CREATE TABLE public.sku_rate (
    id integer NOT NULL,
    sku character varying(100) NOT NULL,
    rate numeric(10,2),
    formula text
);


ALTER TABLE public.sku_rate OWNER TO o2d;

--
-- Name: sku_rate_id_seq; Type: SEQUENCE; Schema: public; Owner: o2d
--

CREATE SEQUENCE public.sku_rate_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.sku_rate_id_seq OWNER TO o2d;

--
-- Name: sku_rate_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: o2d
--

ALTER SEQUENCE public.sku_rate_id_seq OWNED BY public.sku_rate.id;


--
-- Name: sku_selling_price; Type: TABLE; Schema: public; Owner: o2d
--

CREATE TABLE public.sku_selling_price (
    id integer NOT NULL,
    packing_material text,
    sku_weight numeric(10,2),
    sku_unit character varying(10),
    conversion_formula numeric(10,2),
    sku_weight_in_gm numeric(10,2),
    packing_material_weight_in_gm numeric(10,2),
    net_oil_in_gm numeric(10,2),
    packing_cost numeric(10,2),
    var text,
    landing_cost numeric(10,2),
    selling_cost numeric(10,2),
    margin text,
    actual_margin numeric(5,2),
    approval_status character varying(20) DEFAULT 'approved'::character varying NOT NULL,
    created_by integer,
    reviewed_by integer,
    rejection_reason text,
    pending_changes jsonb,
    pending_edit_by integer,
    pending_edit_at timestamp with time zone
);


ALTER TABLE public.sku_selling_price OWNER TO o2d;

--
-- Name: sku_selling_price_id_seq; Type: SEQUENCE; Schema: public; Owner: o2d
--

CREATE SEQUENCE public.sku_selling_price_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.sku_selling_price_id_seq OWNER TO o2d;

--
-- Name: sku_selling_price_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: o2d
--

ALTER SEQUENCE public.sku_selling_price_id_seq OWNED BY public.sku_selling_price.id;


--
-- Name: skus; Type: TABLE; Schema: public; Owner: o2d
--

CREATE TABLE public.skus (
    id integer NOT NULL,
    sku_code character varying(100) NOT NULL,
    sku_name character varying(255) NOT NULL,
    status character varying(20),
    main_uom character varying(50),
    alternate_uom character varying(50),
    nos_per_main_uom numeric(10,2),
    units text,
    oil_filling_per_unit numeric(10,3),
    filling_units text,
    converted_kg numeric(10,3),
    packing_weight_per_main_unit numeric(10,3),
    weight_difference numeric(10,3),
    sku_weight numeric(10,3),
    packing_weight numeric(10,3),
    gross_weight numeric(10,3),
    extra_weight numeric(10,3) DEFAULT '0'::numeric,
    approval_status character varying(20) DEFAULT 'approved'::character varying NOT NULL,
    created_by integer,
    reviewed_by integer,
    rejection_reason text,
    pending_changes jsonb,
    pending_edit_by integer,
    pending_edit_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tag_name character varying(50)
);


ALTER TABLE public.skus OWNER TO o2d;

--
-- Name: skus_id_seq; Type: SEQUENCE; Schema: public; Owner: o2d
--

CREATE SEQUENCE public.skus_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.skus_id_seq OWNER TO o2d;

--
-- Name: skus_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: o2d
--

ALTER SEQUENCE public.skus_id_seq OWNED BY public.skus.id;


--
-- Name: transporters; Type: TABLE; Schema: public; Owner: o2d
--

CREATE TABLE public.transporters (
    id integer NOT NULL,
    transporter_code text,
    status character varying(20),
    transporter_name character varying(100) NOT NULL,
    contact_person character varying(100),
    contact_number character varying(15),
    email_id character varying(100),
    address_line1 text,
    state character varying(50),
    pincode character varying(10),
    pan character varying(20),
    gstin character varying(20),
    approval_status character varying(20) DEFAULT 'approved'::character varying NOT NULL,
    created_by integer,
    reviewed_by integer,
    rejection_reason text,
    pending_changes jsonb,
    pending_edit_by integer,
    pending_edit_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.transporters OWNER TO o2d;

--
-- Name: transporters_id_seq; Type: SEQUENCE; Schema: public; Owner: o2d
--

CREATE SEQUENCE public.transporters_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.transporters_id_seq OWNER TO o2d;

--
-- Name: transporters_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: o2d
--

ALTER SEQUENCE public.transporters_id_seq OWNED BY public.transporters.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: o2d
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    password text NOT NULL,
    email character varying(255),
    phone_no character varying(15),
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    role character varying(30) NOT NULL,
    page_access jsonb,
    depo_access jsonb,
    features jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.users OWNER TO o2d;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: o2d
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO o2d;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: o2d
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: var_calc; Type: TABLE; Schema: public; Owner: o2d
--

CREATE TABLE public.var_calc (
    loose_1_kg_oil_rate numeric(10,2),
    freight_rate numeric(10,2),
    total numeric(10,2),
    five_percent_gst numeric(10,2),
    gt numeric(10,2),
    calculation_date date,
    oil_type text,
    id integer NOT NULL
);


ALTER TABLE public.var_calc OWNER TO o2d;

--
-- Name: var_calc_id_seq; Type: SEQUENCE; Schema: public; Owner: o2d
--

CREATE SEQUENCE public.var_calc_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.var_calc_id_seq OWNER TO o2d;

--
-- Name: var_calc_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: o2d
--

ALTER SEQUENCE public.var_calc_id_seq OWNED BY public.var_calc.id;


--
-- Name: vehicles; Type: TABLE; Schema: public; Owner: o2d
--

CREATE TABLE public.vehicles (
    id integer NOT NULL,
    vehicle_code character varying(50),
    status character varying(20),
    registration_no character varying(50) NOT NULL,
    vehicle_type character varying(50),
    transporter_id integer,
    rto character varying(50),
    fuel_type character varying(50),
    road_tax date,
    road_tax_image text,
    life_time_tax date,
    life_time_tax_image text,
    pollution date,
    pollution_image text,
    insurance date,
    insurance_image text,
    fitness date,
    fitness_image text,
    state_permit date,
    state_permit_image text,
    state_permit_type character varying(50),
    national_permit date,
    national_permit_image text,
    rc_image text,
    gvw numeric(10,2),
    ulw numeric(10,2),
    passing numeric(10,2),
    approval_status character varying(20) DEFAULT 'approved'::character varying NOT NULL,
    created_by integer,
    reviewed_by integer,
    rejection_reason text,
    pending_changes jsonb,
    pending_edit_by integer,
    pending_edit_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ownership_type character varying(20)
);


ALTER TABLE public.vehicles OWNER TO o2d;

--
-- Name: vehicles_id_seq; Type: SEQUENCE; Schema: public; Owner: o2d
--

CREATE SEQUENCE public.vehicles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vehicles_id_seq OWNER TO o2d;

--
-- Name: vehicles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: o2d
--

ALTER SEQUENCE public.vehicles_id_seq OWNED BY public.vehicles.id;


--
-- Name: __drizzle_migrations id; Type: DEFAULT; Schema: drizzle; Owner: o2d
--

ALTER TABLE ONLY drizzle.__drizzle_migrations ALTER COLUMN id SET DEFAULT nextval('drizzle.__drizzle_migrations_id_seq'::regclass);


--
-- Name: brokers id; Type: DEFAULT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.brokers ALTER COLUMN id SET DEFAULT nextval('public.brokers_id_seq'::regclass);


--
-- Name: commitment_details id; Type: DEFAULT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.commitment_details ALTER COLUMN id SET DEFAULT nextval('public.commitment_details_id_seq'::regclass);


--
-- Name: commitment_main id; Type: DEFAULT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.commitment_main ALTER COLUMN id SET DEFAULT nextval('public.commitment_main_id_seq'::regclass);


--
-- Name: customers id; Type: DEFAULT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.customers ALTER COLUMN id SET DEFAULT nextval('public.customers_id_seq'::regclass);


--
-- Name: damage_adjustments id; Type: DEFAULT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.damage_adjustments ALTER COLUMN id SET DEFAULT nextval('public.damage_adjustments_id_seq'::regclass);


--
-- Name: depots id; Type: DEFAULT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.depots ALTER COLUMN id SET DEFAULT nextval('public.depots_id_seq'::regclass);


--
-- Name: dispatch_plannings id; Type: DEFAULT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.dispatch_plannings ALTER COLUMN id SET DEFAULT nextval('public.dispatch_plannings_id_seq'::regclass);


--
-- Name: dispatches id; Type: DEFAULT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.dispatches ALTER COLUMN id SET DEFAULT nextval('public.dispatches_id_seq'::regclass);


--
-- Name: drivers id; Type: DEFAULT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.drivers ALTER COLUMN id SET DEFAULT nextval('public.drivers_id_seq'::regclass);


--
-- Name: gate_outs id; Type: DEFAULT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.gate_outs ALTER COLUMN id SET DEFAULT nextval('public.gate_outs_id_seq'::regclass);


--
-- Name: inventory_opening_qty id; Type: DEFAULT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.inventory_opening_qty ALTER COLUMN id SET DEFAULT nextval('public.inventory_opening_qty_id_seq'::regclass);


--
-- Name: invoices id; Type: DEFAULT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.invoices ALTER COLUMN id SET DEFAULT nextval('public.invoices_id_seq'::regclass);


--
-- Name: material_receipts id; Type: DEFAULT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.material_receipts ALTER COLUMN id SET DEFAULT nextval('public.material_receipts_id_seq'::regclass);


--
-- Name: order_approvals id; Type: DEFAULT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.order_approvals ALTER COLUMN id SET DEFAULT nextval('public.order_approvals_id_seq'::regclass);


--
-- Name: order_items id; Type: DEFAULT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.order_items ALTER COLUMN id SET DEFAULT nextval('public.order_items_id_seq'::regclass);


--
-- Name: orders id; Type: DEFAULT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);


--
-- Name: pre_approvals id; Type: DEFAULT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.pre_approvals ALTER COLUMN id SET DEFAULT nextval('public.pre_approvals_id_seq'::regclass);


--
-- Name: process_stages id; Type: DEFAULT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.process_stages ALTER COLUMN id SET DEFAULT nextval('public.process_stages_id_seq'::regclass);


--
-- Name: production id; Type: DEFAULT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.production ALTER COLUMN id SET DEFAULT nextval('public.production_id_seq'::regclass);


--
-- Name: salespersons id; Type: DEFAULT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.salespersons ALTER COLUMN id SET DEFAULT nextval('public.salespersons_id_seq'::regclass);


--
-- Name: security_guard_checks id; Type: DEFAULT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.security_guard_checks ALTER COLUMN id SET DEFAULT nextval('public.security_guard_checks_id_seq'::regclass);


--
-- Name: sku_rate id; Type: DEFAULT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.sku_rate ALTER COLUMN id SET DEFAULT nextval('public.sku_rate_id_seq'::regclass);


--
-- Name: sku_selling_price id; Type: DEFAULT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.sku_selling_price ALTER COLUMN id SET DEFAULT nextval('public.sku_selling_price_id_seq'::regclass);


--
-- Name: skus id; Type: DEFAULT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.skus ALTER COLUMN id SET DEFAULT nextval('public.skus_id_seq'::regclass);


--
-- Name: transporters id; Type: DEFAULT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.transporters ALTER COLUMN id SET DEFAULT nextval('public.transporters_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: var_calc id; Type: DEFAULT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.var_calc ALTER COLUMN id SET DEFAULT nextval('public.var_calc_id_seq'::regclass);


--
-- Name: vehicles id; Type: DEFAULT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.vehicles ALTER COLUMN id SET DEFAULT nextval('public.vehicles_id_seq'::regclass);


--
-- Name: __drizzle_migrations __drizzle_migrations_pkey; Type: CONSTRAINT; Schema: drizzle; Owner: o2d
--

ALTER TABLE ONLY drizzle.__drizzle_migrations
    ADD CONSTRAINT __drizzle_migrations_pkey PRIMARY KEY (id);


--
-- Name: brokers brokers_broker_code_unique; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.brokers
    ADD CONSTRAINT brokers_broker_code_unique UNIQUE (broker_code);


--
-- Name: brokers brokers_pkey; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.brokers
    ADD CONSTRAINT brokers_pkey PRIMARY KEY (id);


--
-- Name: commitment_details commitment_details_pkey; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.commitment_details
    ADD CONSTRAINT commitment_details_pkey PRIMARY KEY (id);


--
-- Name: commitment_main commitment_main_commitment_no_key; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.commitment_main
    ADD CONSTRAINT commitment_main_commitment_no_key UNIQUE (commitment_no);


--
-- Name: commitment_main commitment_main_pkey; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.commitment_main
    ADD CONSTRAINT commitment_main_pkey PRIMARY KEY (id);


--
-- Name: customers customers_customer_code_unique; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_customer_code_unique UNIQUE (customer_code);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: damage_adjustments damage_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.damage_adjustments
    ADD CONSTRAINT damage_adjustments_pkey PRIMARY KEY (id);


--
-- Name: depots depots_depot_code_unique; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.depots
    ADD CONSTRAINT depots_depot_code_unique UNIQUE (depot_code);


--
-- Name: depots depots_pkey; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.depots
    ADD CONSTRAINT depots_pkey PRIMARY KEY (id);


--
-- Name: dispatch_drafts dispatch_drafts_order_key_key; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.dispatch_drafts
    ADD CONSTRAINT dispatch_drafts_order_key_key UNIQUE (order_key);


--
-- Name: dispatch_drafts dispatch_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.dispatch_drafts
    ADD CONSTRAINT dispatch_drafts_pkey PRIMARY KEY (id);


--
-- Name: dispatch_plannings dispatch_plannings_pkey; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.dispatch_plannings
    ADD CONSTRAINT dispatch_plannings_pkey PRIMARY KEY (id);


--
-- Name: dispatches dispatches_dsr_number_unique; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.dispatches
    ADD CONSTRAINT dispatches_dsr_number_unique UNIQUE (dsr_number);


--
-- Name: dispatches dispatches_pkey; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.dispatches
    ADD CONSTRAINT dispatches_pkey PRIMARY KEY (id);


--
-- Name: drivers drivers_driver_code_unique; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_driver_code_unique UNIQUE (driver_code);


--
-- Name: drivers drivers_driving_licence_no_unique; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_driving_licence_no_unique UNIQUE (driving_licence_no);


--
-- Name: drivers drivers_pkey; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_pkey PRIMARY KEY (id);


--
-- Name: gate_in_records gate_in_records_order_key_key; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.gate_in_records
    ADD CONSTRAINT gate_in_records_order_key_key UNIQUE (order_key);


--
-- Name: gate_in_records gate_in_records_pkey; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.gate_in_records
    ADD CONSTRAINT gate_in_records_pkey PRIMARY KEY (id);


--
-- Name: gate_outs gate_outs_pkey; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.gate_outs
    ADD CONSTRAINT gate_outs_pkey PRIMARY KEY (id);


--
-- Name: inventory_opening_qty inventory_opening_qty_depo_name_product_name_key; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.inventory_opening_qty
    ADD CONSTRAINT inventory_opening_qty_depo_name_product_name_key UNIQUE (depo_name, product_name);


--
-- Name: inventory_opening_qty inventory_opening_qty_pkey; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.inventory_opening_qty
    ADD CONSTRAINT inventory_opening_qty_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: material_receipts material_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.material_receipts
    ADD CONSTRAINT material_receipts_pkey PRIMARY KEY (id);


--
-- Name: order_approvals order_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.order_approvals
    ADD CONSTRAINT order_approvals_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_order_no_unique; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_order_no_unique UNIQUE (order_no);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: pre_approvals pre_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.pre_approvals
    ADD CONSTRAINT pre_approvals_pkey PRIMARY KEY (id);


--
-- Name: process_stages process_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.process_stages
    ADD CONSTRAINT process_stages_pkey PRIMARY KEY (id);


--
-- Name: process_stages process_stages_stage_name_unique; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.process_stages
    ADD CONSTRAINT process_stages_stage_name_unique UNIQUE (stage_name);


--
-- Name: production production_pkey; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.production
    ADD CONSTRAINT production_pkey PRIMARY KEY (id);


--
-- Name: production production_sku_name_date_key; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.production
    ADD CONSTRAINT production_sku_name_date_key UNIQUE (sku_name, date);


--
-- Name: salespersons salespersons_pkey; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.salespersons
    ADD CONSTRAINT salespersons_pkey PRIMARY KEY (id);


--
-- Name: salespersons salespersons_salesperson_code_unique; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.salespersons
    ADD CONSTRAINT salespersons_salesperson_code_unique UNIQUE (salesperson_code);


--
-- Name: security_guard_checks security_guard_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.security_guard_checks
    ADD CONSTRAINT security_guard_checks_pkey PRIMARY KEY (id);


--
-- Name: sku_rate sku_rate_pkey; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.sku_rate
    ADD CONSTRAINT sku_rate_pkey PRIMARY KEY (id);


--
-- Name: sku_selling_price sku_selling_price_pkey; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.sku_selling_price
    ADD CONSTRAINT sku_selling_price_pkey PRIMARY KEY (id);


--
-- Name: skus skus_pkey; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.skus
    ADD CONSTRAINT skus_pkey PRIMARY KEY (id);


--
-- Name: skus skus_sku_code_unique; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.skus
    ADD CONSTRAINT skus_sku_code_unique UNIQUE (sku_code);


--
-- Name: transporters transporters_pkey; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.transporters
    ADD CONSTRAINT transporters_pkey PRIMARY KEY (id);


--
-- Name: transporters transporters_transporter_code_unique; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.transporters
    ADD CONSTRAINT transporters_transporter_code_unique UNIQUE (transporter_code);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_unique; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);


--
-- Name: var_calc var_calc_calculation_date_oil_type_key; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.var_calc
    ADD CONSTRAINT var_calc_calculation_date_oil_type_key UNIQUE (calculation_date, oil_type);


--
-- Name: var_calc var_calc_pkey; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.var_calc
    ADD CONSTRAINT var_calc_pkey PRIMARY KEY (id);


--
-- Name: vehicles vehicles_pkey; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_pkey PRIMARY KEY (id);


--
-- Name: vehicles vehicles_registration_no_unique; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_registration_no_unique UNIQUE (registration_no);


--
-- Name: vehicles vehicles_vehicle_code_unique; Type: CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_vehicle_code_unique UNIQUE (vehicle_code);


--
-- Name: brokers_created_by_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX brokers_created_by_idx ON public.brokers USING btree (created_by);


--
-- Name: brokers_depot_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX brokers_depot_id_idx ON public.brokers USING btree (depot_id);


--
-- Name: brokers_pending_edit_by_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX brokers_pending_edit_by_idx ON public.brokers USING btree (pending_edit_by);


--
-- Name: brokers_reviewed_by_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX brokers_reviewed_by_idx ON public.brokers USING btree (reviewed_by);


--
-- Name: commitment_details_commitment_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX commitment_details_commitment_id_idx ON public.commitment_details USING btree (commitment_id);


--
-- Name: commitment_details_order_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX commitment_details_order_id_idx ON public.commitment_details USING btree (order_id);


--
-- Name: commitment_details_order_item_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX commitment_details_order_item_id_idx ON public.commitment_details USING btree (order_item_id);


--
-- Name: commitment_details_sku_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX commitment_details_sku_id_idx ON public.commitment_details USING btree (sku_id);


--
-- Name: commitment_main_customer_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX commitment_main_customer_id_idx ON public.commitment_main USING btree (customer_id);


--
-- Name: customers_created_by_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX customers_created_by_idx ON public.customers USING btree (created_by);


--
-- Name: customers_depot_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX customers_depot_id_idx ON public.customers USING btree (depot_id);


--
-- Name: customers_pending_edit_by_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX customers_pending_edit_by_idx ON public.customers USING btree (pending_edit_by);


--
-- Name: customers_reviewed_by_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX customers_reviewed_by_idx ON public.customers USING btree (reviewed_by);


--
-- Name: damage_adjustments_dispatch_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX damage_adjustments_dispatch_id_idx ON public.damage_adjustments USING btree (dispatch_id);


--
-- Name: damage_adjustments_performed_by_user_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX damage_adjustments_performed_by_user_id_idx ON public.damage_adjustments USING btree (performed_by_user_id);


--
-- Name: depots_created_by_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX depots_created_by_idx ON public.depots USING btree (created_by);


--
-- Name: depots_pending_edit_by_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX depots_pending_edit_by_idx ON public.depots USING btree (pending_edit_by);


--
-- Name: depots_reviewed_by_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX depots_reviewed_by_idx ON public.depots USING btree (reviewed_by);


--
-- Name: dispatch_plannings_cancelled_by_user_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX dispatch_plannings_cancelled_by_user_id_idx ON public.dispatch_plannings USING btree (cancelled_by_user_id);


--
-- Name: dispatch_plannings_order_item_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX dispatch_plannings_order_item_id_idx ON public.dispatch_plannings USING btree (order_item_id);


--
-- Name: dispatch_plannings_performed_by_user_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX dispatch_plannings_performed_by_user_id_idx ON public.dispatch_plannings USING btree (performed_by_user_id);


--
-- Name: dispatch_plannings_preclose_by_user_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX dispatch_plannings_preclose_by_user_id_idx ON public.dispatch_plannings USING btree (preclose_by_user_id);


--
-- Name: dispatches_driver_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX dispatches_driver_id_idx ON public.dispatches USING btree (driver_id);


--
-- Name: dispatches_order_item_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX dispatches_order_item_id_idx ON public.dispatches USING btree (order_item_id);


--
-- Name: dispatches_performed_by_user_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX dispatches_performed_by_user_id_idx ON public.dispatches USING btree (performed_by_user_id);


--
-- Name: dispatches_transporter_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX dispatches_transporter_id_idx ON public.dispatches USING btree (transporter_id);


--
-- Name: dispatches_vehicle_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX dispatches_vehicle_id_idx ON public.dispatches USING btree (vehicle_id);


--
-- Name: drivers_created_by_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX drivers_created_by_idx ON public.drivers USING btree (created_by);


--
-- Name: drivers_pending_edit_by_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX drivers_pending_edit_by_idx ON public.drivers USING btree (pending_edit_by);


--
-- Name: drivers_reviewed_by_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX drivers_reviewed_by_idx ON public.drivers USING btree (reviewed_by);


--
-- Name: gate_outs_dispatch_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX gate_outs_dispatch_id_idx ON public.gate_outs USING btree (dispatch_id);


--
-- Name: gate_outs_performed_by_user_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX gate_outs_performed_by_user_id_idx ON public.gate_outs USING btree (performed_by_user_id);


--
-- Name: invoices_checked_by_user_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX invoices_checked_by_user_id_idx ON public.invoices USING btree (checked_by_user_id);


--
-- Name: invoices_dispatch_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX invoices_dispatch_id_idx ON public.invoices USING btree (dispatch_id);


--
-- Name: invoices_made_by_user_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX invoices_made_by_user_id_idx ON public.invoices USING btree (made_by_user_id);


--
-- Name: material_receipts_dispatch_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX material_receipts_dispatch_id_idx ON public.material_receipts USING btree (dispatch_id);


--
-- Name: material_receipts_performed_by_user_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX material_receipts_performed_by_user_id_idx ON public.material_receipts USING btree (performed_by_user_id);


--
-- Name: order_approvals_approved_by_user_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX order_approvals_approved_by_user_id_idx ON public.order_approvals USING btree (approved_by_user_id);


--
-- Name: order_approvals_order_item_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX order_approvals_order_item_id_idx ON public.order_approvals USING btree (order_item_id);


--
-- Name: order_items_budget_root_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX order_items_budget_root_id_idx ON public.order_items USING btree (budget_root_id);


--
-- Name: order_items_order_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX order_items_order_id_idx ON public.order_items USING btree (order_id);


--
-- Name: order_items_sku_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX order_items_sku_id_idx ON public.order_items USING btree (sku_id);


--
-- Name: order_items_split_from_item_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX order_items_split_from_item_id_idx ON public.order_items USING btree (split_from_item_id);


--
-- Name: orders_broker_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX orders_broker_id_idx ON public.orders USING btree (broker_id);


--
-- Name: orders_customer_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX orders_customer_id_idx ON public.orders USING btree (customer_id);


--
-- Name: orders_depot_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX orders_depot_id_idx ON public.orders USING btree (depot_id);


--
-- Name: orders_order_punch_user_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX orders_order_punch_user_id_idx ON public.orders USING btree (order_punch_user_id);


--
-- Name: orders_salesperson_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX orders_salesperson_id_idx ON public.orders USING btree (salesperson_id);


--
-- Name: pre_approvals_approved_by_user_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX pre_approvals_approved_by_user_id_idx ON public.pre_approvals USING btree (approved_by_user_id);


--
-- Name: pre_approvals_order_item_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX pre_approvals_order_item_id_idx ON public.pre_approvals USING btree (order_item_id);


--
-- Name: salespersons_created_by_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX salespersons_created_by_idx ON public.salespersons USING btree (created_by);


--
-- Name: salespersons_depot_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX salespersons_depot_id_idx ON public.salespersons USING btree (depot_id);


--
-- Name: salespersons_pending_edit_by_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX salespersons_pending_edit_by_idx ON public.salespersons USING btree (pending_edit_by);


--
-- Name: salespersons_reviewed_by_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX salespersons_reviewed_by_idx ON public.salespersons USING btree (reviewed_by);


--
-- Name: security_guard_checks_dispatch_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX security_guard_checks_dispatch_id_idx ON public.security_guard_checks USING btree (dispatch_id);


--
-- Name: security_guard_checks_performed_by_user_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX security_guard_checks_performed_by_user_id_idx ON public.security_guard_checks USING btree (performed_by_user_id);


--
-- Name: sku_selling_price_created_by_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX sku_selling_price_created_by_idx ON public.sku_selling_price USING btree (created_by);


--
-- Name: sku_selling_price_pending_edit_by_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX sku_selling_price_pending_edit_by_idx ON public.sku_selling_price USING btree (pending_edit_by);


--
-- Name: sku_selling_price_reviewed_by_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX sku_selling_price_reviewed_by_idx ON public.sku_selling_price USING btree (reviewed_by);


--
-- Name: skus_created_by_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX skus_created_by_idx ON public.skus USING btree (created_by);


--
-- Name: skus_pending_edit_by_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX skus_pending_edit_by_idx ON public.skus USING btree (pending_edit_by);


--
-- Name: skus_reviewed_by_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX skus_reviewed_by_idx ON public.skus USING btree (reviewed_by);


--
-- Name: transporters_created_by_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX transporters_created_by_idx ON public.transporters USING btree (created_by);


--
-- Name: transporters_pending_edit_by_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX transporters_pending_edit_by_idx ON public.transporters USING btree (pending_edit_by);


--
-- Name: transporters_reviewed_by_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX transporters_reviewed_by_idx ON public.transporters USING btree (reviewed_by);


--
-- Name: vehicles_created_by_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX vehicles_created_by_idx ON public.vehicles USING btree (created_by);


--
-- Name: vehicles_pending_edit_by_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX vehicles_pending_edit_by_idx ON public.vehicles USING btree (pending_edit_by);


--
-- Name: vehicles_reviewed_by_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX vehicles_reviewed_by_idx ON public.vehicles USING btree (reviewed_by);


--
-- Name: vehicles_transporter_id_idx; Type: INDEX; Schema: public; Owner: o2d
--

CREATE INDEX vehicles_transporter_id_idx ON public.vehicles USING btree (transporter_id);


--
-- Name: customers trg_customer_depot_resolve_ins; Type: TRIGGER; Schema: public; Owner: o2d
--

CREATE TRIGGER trg_customer_depot_resolve_ins BEFORE INSERT ON public.customers FOR EACH ROW EXECUTE FUNCTION public.resolve_customer_depot();


--
-- Name: customers trg_customer_depot_resolve_upd; Type: TRIGGER; Schema: public; Owner: o2d
--

CREATE TRIGGER trg_customer_depot_resolve_upd BEFORE UPDATE ON public.customers FOR EACH ROW WHEN ((new.depot_id IS NULL)) EXECUTE FUNCTION public.resolve_customer_depot();


--
-- Name: dispatches trg_dispatch_qty_guard_ins; Type: TRIGGER; Schema: public; Owner: o2d
--

CREATE TRIGGER trg_dispatch_qty_guard_ins BEFORE INSERT ON public.dispatches FOR EACH ROW EXECUTE FUNCTION public.enforce_dispatch_within_order_qty();


--
-- Name: dispatches trg_dispatch_qty_guard_upd; Type: TRIGGER; Schema: public; Owner: o2d
--

CREATE TRIGGER trg_dispatch_qty_guard_upd BEFORE UPDATE ON public.dispatches FOR EACH ROW WHEN (((new.qty_to_be_dispatched IS DISTINCT FROM old.qty_to_be_dispatched) OR (new.order_item_id IS DISTINCT FROM old.order_item_id))) EXECUTE FUNCTION public.enforce_dispatch_within_order_qty();


--
-- Name: order_items trg_order_item_qty_guard_ins; Type: TRIGGER; Schema: public; Owner: o2d
--

CREATE TRIGGER trg_order_item_qty_guard_ins BEFORE INSERT ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.enforce_order_item_qty_within_original();


--
-- Name: order_items trg_order_item_qty_guard_upd; Type: TRIGGER; Schema: public; Owner: o2d
--

CREATE TRIGGER trg_order_item_qty_guard_upd BEFORE UPDATE ON public.order_items FOR EACH ROW WHEN (((new.order_quantity IS DISTINCT FROM old.order_quantity) OR (new.approved_qty IS DISTINCT FROM old.approved_qty) OR (new.remaining_qty IS DISTINCT FROM old.remaining_qty) OR (new.original_order_quantity IS DISTINCT FROM old.original_order_quantity) OR (new.budget_root_id IS DISTINCT FROM old.budget_root_id))) EXECUTE FUNCTION public.enforce_order_item_qty_within_original();


--
-- Name: brokers brokers_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.brokers
    ADD CONSTRAINT brokers_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: brokers brokers_depot_id_depots_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.brokers
    ADD CONSTRAINT brokers_depot_id_depots_id_fk FOREIGN KEY (depot_id) REFERENCES public.depots(id);


--
-- Name: brokers brokers_pending_edit_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.brokers
    ADD CONSTRAINT brokers_pending_edit_by_users_id_fk FOREIGN KEY (pending_edit_by) REFERENCES public.users(id);


--
-- Name: brokers brokers_reviewed_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.brokers
    ADD CONSTRAINT brokers_reviewed_by_users_id_fk FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- Name: commitment_details commitment_details_commitment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.commitment_details
    ADD CONSTRAINT commitment_details_commitment_id_fkey FOREIGN KEY (commitment_id) REFERENCES public.commitment_main(id);


--
-- Name: commitment_details commitment_details_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.commitment_details
    ADD CONSTRAINT commitment_details_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: commitment_details commitment_details_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.commitment_details
    ADD CONSTRAINT commitment_details_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id);


--
-- Name: commitment_details commitment_details_sku_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.commitment_details
    ADD CONSTRAINT commitment_details_sku_id_fkey FOREIGN KEY (sku_id) REFERENCES public.skus(id);


--
-- Name: commitment_main commitment_main_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.commitment_main
    ADD CONSTRAINT commitment_main_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: customers customers_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: customers customers_depot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_depot_id_fkey FOREIGN KEY (depot_id) REFERENCES public.depots(id);


--
-- Name: customers customers_pending_edit_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pending_edit_by_users_id_fk FOREIGN KEY (pending_edit_by) REFERENCES public.users(id);


--
-- Name: customers customers_reviewed_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_reviewed_by_users_id_fk FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- Name: damage_adjustments damage_adjustments_dispatch_id_dispatches_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.damage_adjustments
    ADD CONSTRAINT damage_adjustments_dispatch_id_dispatches_id_fk FOREIGN KEY (dispatch_id) REFERENCES public.dispatches(id);


--
-- Name: damage_adjustments damage_adjustments_performed_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.damage_adjustments
    ADD CONSTRAINT damage_adjustments_performed_by_user_id_users_id_fk FOREIGN KEY (performed_by_user_id) REFERENCES public.users(id);


--
-- Name: depots depots_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.depots
    ADD CONSTRAINT depots_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: depots depots_pending_edit_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.depots
    ADD CONSTRAINT depots_pending_edit_by_users_id_fk FOREIGN KEY (pending_edit_by) REFERENCES public.users(id);


--
-- Name: depots depots_reviewed_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.depots
    ADD CONSTRAINT depots_reviewed_by_users_id_fk FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- Name: dispatch_plannings dispatch_plannings_cancelled_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.dispatch_plannings
    ADD CONSTRAINT dispatch_plannings_cancelled_by_user_id_users_id_fk FOREIGN KEY (cancelled_by_user_id) REFERENCES public.users(id);


--
-- Name: dispatch_plannings dispatch_plannings_order_item_id_order_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.dispatch_plannings
    ADD CONSTRAINT dispatch_plannings_order_item_id_order_items_id_fk FOREIGN KEY (order_item_id) REFERENCES public.order_items(id);


--
-- Name: dispatch_plannings dispatch_plannings_performed_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.dispatch_plannings
    ADD CONSTRAINT dispatch_plannings_performed_by_user_id_users_id_fk FOREIGN KEY (performed_by_user_id) REFERENCES public.users(id);


--
-- Name: dispatch_plannings dispatch_plannings_preclose_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.dispatch_plannings
    ADD CONSTRAINT dispatch_plannings_preclose_by_user_id_users_id_fk FOREIGN KEY (preclose_by_user_id) REFERENCES public.users(id);


--
-- Name: dispatches dispatches_driver_id_drivers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.dispatches
    ADD CONSTRAINT dispatches_driver_id_drivers_id_fk FOREIGN KEY (driver_id) REFERENCES public.drivers(id);


--
-- Name: dispatches dispatches_order_item_id_order_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.dispatches
    ADD CONSTRAINT dispatches_order_item_id_order_items_id_fk FOREIGN KEY (order_item_id) REFERENCES public.order_items(id);


--
-- Name: dispatches dispatches_performed_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.dispatches
    ADD CONSTRAINT dispatches_performed_by_user_id_users_id_fk FOREIGN KEY (performed_by_user_id) REFERENCES public.users(id);


--
-- Name: dispatches dispatches_transporter_id_transporters_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.dispatches
    ADD CONSTRAINT dispatches_transporter_id_transporters_id_fk FOREIGN KEY (transporter_id) REFERENCES public.transporters(id);


--
-- Name: dispatches dispatches_vehicle_id_vehicles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.dispatches
    ADD CONSTRAINT dispatches_vehicle_id_vehicles_id_fk FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id);


--
-- Name: drivers drivers_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: drivers drivers_pending_edit_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_pending_edit_by_users_id_fk FOREIGN KEY (pending_edit_by) REFERENCES public.users(id);


--
-- Name: drivers drivers_reviewed_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_reviewed_by_users_id_fk FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- Name: gate_outs gate_outs_dispatch_id_dispatches_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.gate_outs
    ADD CONSTRAINT gate_outs_dispatch_id_dispatches_id_fk FOREIGN KEY (dispatch_id) REFERENCES public.dispatches(id);


--
-- Name: gate_outs gate_outs_performed_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.gate_outs
    ADD CONSTRAINT gate_outs_performed_by_user_id_users_id_fk FOREIGN KEY (performed_by_user_id) REFERENCES public.users(id);


--
-- Name: invoices invoices_checked_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_checked_by_user_id_users_id_fk FOREIGN KEY (checked_by_user_id) REFERENCES public.users(id);


--
-- Name: invoices invoices_dispatch_id_dispatches_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_dispatch_id_dispatches_id_fk FOREIGN KEY (dispatch_id) REFERENCES public.dispatches(id);


--
-- Name: invoices invoices_made_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_made_by_user_id_users_id_fk FOREIGN KEY (made_by_user_id) REFERENCES public.users(id);


--
-- Name: material_receipts material_receipts_dispatch_id_dispatches_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.material_receipts
    ADD CONSTRAINT material_receipts_dispatch_id_dispatches_id_fk FOREIGN KEY (dispatch_id) REFERENCES public.dispatches(id);


--
-- Name: material_receipts material_receipts_performed_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.material_receipts
    ADD CONSTRAINT material_receipts_performed_by_user_id_users_id_fk FOREIGN KEY (performed_by_user_id) REFERENCES public.users(id);


--
-- Name: order_approvals order_approvals_approved_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.order_approvals
    ADD CONSTRAINT order_approvals_approved_by_user_id_users_id_fk FOREIGN KEY (approved_by_user_id) REFERENCES public.users(id);


--
-- Name: order_approvals order_approvals_order_item_id_order_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.order_approvals
    ADD CONSTRAINT order_approvals_order_item_id_order_items_id_fk FOREIGN KEY (order_item_id) REFERENCES public.order_items(id);


--
-- Name: order_items order_items_budget_root_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_budget_root_id_fkey FOREIGN KEY (budget_root_id) REFERENCES public.order_items(id);


--
-- Name: order_items order_items_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: order_items order_items_sku_id_skus_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_sku_id_skus_id_fk FOREIGN KEY (sku_id) REFERENCES public.skus(id);


--
-- Name: order_items order_items_split_from_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_split_from_item_id_fkey FOREIGN KEY (split_from_item_id) REFERENCES public.order_items(id);


--
-- Name: orders orders_broker_id_brokers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_broker_id_brokers_id_fk FOREIGN KEY (broker_id) REFERENCES public.brokers(id);


--
-- Name: orders orders_customer_id_customers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_customer_id_customers_id_fk FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: orders orders_depot_id_depots_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_depot_id_depots_id_fk FOREIGN KEY (depot_id) REFERENCES public.depots(id);


--
-- Name: orders orders_order_punch_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_order_punch_user_id_users_id_fk FOREIGN KEY (order_punch_user_id) REFERENCES public.users(id);


--
-- Name: orders orders_salesperson_id_salespersons_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_salesperson_id_salespersons_id_fk FOREIGN KEY (salesperson_id) REFERENCES public.salespersons(id);


--
-- Name: pre_approvals pre_approvals_approved_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.pre_approvals
    ADD CONSTRAINT pre_approvals_approved_by_user_id_users_id_fk FOREIGN KEY (approved_by_user_id) REFERENCES public.users(id);


--
-- Name: pre_approvals pre_approvals_order_item_id_order_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.pre_approvals
    ADD CONSTRAINT pre_approvals_order_item_id_order_items_id_fk FOREIGN KEY (order_item_id) REFERENCES public.order_items(id);


--
-- Name: salespersons salespersons_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.salespersons
    ADD CONSTRAINT salespersons_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: salespersons salespersons_depot_id_depots_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.salespersons
    ADD CONSTRAINT salespersons_depot_id_depots_id_fk FOREIGN KEY (depot_id) REFERENCES public.depots(id);


--
-- Name: salespersons salespersons_pending_edit_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.salespersons
    ADD CONSTRAINT salespersons_pending_edit_by_users_id_fk FOREIGN KEY (pending_edit_by) REFERENCES public.users(id);


--
-- Name: salespersons salespersons_reviewed_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.salespersons
    ADD CONSTRAINT salespersons_reviewed_by_users_id_fk FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- Name: security_guard_checks security_guard_checks_dispatch_id_dispatches_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.security_guard_checks
    ADD CONSTRAINT security_guard_checks_dispatch_id_dispatches_id_fk FOREIGN KEY (dispatch_id) REFERENCES public.dispatches(id);


--
-- Name: security_guard_checks security_guard_checks_performed_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.security_guard_checks
    ADD CONSTRAINT security_guard_checks_performed_by_user_id_users_id_fk FOREIGN KEY (performed_by_user_id) REFERENCES public.users(id);


--
-- Name: sku_selling_price sku_selling_price_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.sku_selling_price
    ADD CONSTRAINT sku_selling_price_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: sku_selling_price sku_selling_price_pending_edit_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.sku_selling_price
    ADD CONSTRAINT sku_selling_price_pending_edit_by_fkey FOREIGN KEY (pending_edit_by) REFERENCES public.users(id);


--
-- Name: sku_selling_price sku_selling_price_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.sku_selling_price
    ADD CONSTRAINT sku_selling_price_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- Name: skus skus_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.skus
    ADD CONSTRAINT skus_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: skus skus_pending_edit_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.skus
    ADD CONSTRAINT skus_pending_edit_by_users_id_fk FOREIGN KEY (pending_edit_by) REFERENCES public.users(id);


--
-- Name: skus skus_reviewed_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.skus
    ADD CONSTRAINT skus_reviewed_by_users_id_fk FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- Name: transporters transporters_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.transporters
    ADD CONSTRAINT transporters_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: transporters transporters_pending_edit_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.transporters
    ADD CONSTRAINT transporters_pending_edit_by_users_id_fk FOREIGN KEY (pending_edit_by) REFERENCES public.users(id);


--
-- Name: transporters transporters_reviewed_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.transporters
    ADD CONSTRAINT transporters_reviewed_by_users_id_fk FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- Name: vehicles vehicles_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: vehicles vehicles_pending_edit_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_pending_edit_by_users_id_fk FOREIGN KEY (pending_edit_by) REFERENCES public.users(id);


--
-- Name: vehicles vehicles_reviewed_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_reviewed_by_users_id_fk FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- Name: vehicles vehicles_transporter_id_transporters_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: o2d
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_transporter_id_transporters_id_fk FOREIGN KEY (transporter_id) REFERENCES public.transporters(id);


--
-- PostgreSQL database dump complete
--

\unrestrict iG79zUM6ojrNi1JDXCGR573MSwn3FRijUfeUZ2bSbVErXO3gAvxcjuef1FeFrdi

