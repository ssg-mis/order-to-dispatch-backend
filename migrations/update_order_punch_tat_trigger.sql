CREATE OR REPLACE FUNCTION set_planned_by_order_type()
RETURNS TRIGGER AS $$
DECLARE
    pre_approval_tat INTERVAL;
    approval_of_order_tat INTERVAL;
BEGIN
    -- Get Pre Approval TAT (for planned_1 on pre-approval orders)
    SELECT stage_time INTO pre_approval_tat
    FROM process_stages
    WHERE lower(replace(trim(stage_name), ' ', '')) = 'preapproval'
    ORDER BY submitted_at DESC, id DESC
    LIMIT 1;

    -- Get Approval of Order TAT (for planned_2 on regular orders)
    SELECT stage_time INTO approval_of_order_tat
    FROM process_stages
    WHERE lower(replace(trim(stage_name), ' ', '')) = 'approvaloforder'
    ORDER BY submitted_at DESC, id DESC
    LIMIT 1;

    IF lower(trim(NEW.order_type)) = 'regular' THEN
        NEW.planned_2 := (CURRENT_TIMESTAMP + COALESCE(approval_of_order_tat, INTERVAL '0'))::TEXT;

    ELSIF lower(trim(NEW.order_type)) IN ('pre approval', 'pre-approval') THEN
        NEW.planned_1 := (CURRENT_TIMESTAMP + COALESCE(pre_approval_tat, INTERVAL '0'))::TEXT;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
