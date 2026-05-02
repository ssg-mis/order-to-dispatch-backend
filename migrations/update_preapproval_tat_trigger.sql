CREATE OR REPLACE FUNCTION set_planned2_from_actual1()
RETURNS TRIGGER AS $$
DECLARE
    approval_of_order_tat INTERVAL;
BEGIN
    SELECT stage_time
    INTO approval_of_order_tat
    FROM process_stages
    WHERE lower(replace(trim(stage_name), ' ', '')) = 'approvaloforder'
    ORDER BY submitted_at DESC, id DESC
    LIMIT 1;

    IF NEW.actual_1 IS NOT NULL
       AND NEW.approval_qty IS NOT NULL
       AND NEW.approval_qty > 0 THEN

        NEW.planned_2 := (NEW.actual_1::timestamptz + COALESCE(approval_of_order_tat, INTERVAL '0'))::TEXT;

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
