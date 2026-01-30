/**
 * Order Dispatch Model
 * Represents order_dispatch table structure
 */

class OrderDispatch {
  constructor(data = {}) {
    this.id = data.id || null;
    this.timestamp_created = data.timestamp_created || new Date();
    this.order_no = data.order_no || null;
    // serial column removed - now part of order_no (e.g., DO-001A)
    
    this.order_type_delivery_purpose = data.order_type_delivery_purpose || null;
    this.depo_name = data.depo_name || null;
    this.order_punch_remarks = data.order_punch_remarks || null;
    
    this.start_date = data.start_date || null;
    this.end_date = data.end_date || null;
    this.delivery_date = data.delivery_date || null;
    
    this.order_type = data.order_type || null;
    this.customer_type = data.customer_type || null;
    
    this.party_so_date = data.party_so_date || null;
    this.customer_name = data.customer_name || null;
    this.product_name = data.product_name || null;
    
    this.uom = data.uom || null;
    this.order_quantity = data.order_quantity || null;
    this.rate_of_material = data.rate_of_material || null;
    
    this.alternate_uom = data.alternate_uom || null;
    this.alternate_qty_kg = data.alternate_qty_kg || null;
    
    this.oil_type = data.oil_type || null;
    this.rate_per_15kg = data.rate_per_15kg || null;
    this.rate_per_ltr = data.rate_per_ltr || null;
    
    this.total_amount_with_gst = data.total_amount_with_gst || null;
    
    this.type_of_transporting = data.type_of_transporting || null;
    
    this.customer_contact_person_name = data.customer_contact_person_name || null;
    this.customer_contact_person_whatsapp_no = data.customer_contact_person_whatsapp_no || null;
    
    this.customer_address = data.customer_address || null;
    
    this.payment_terms = data.payment_terms || null;
    this.advance_payment_to_be_taken = data.advance_payment_to_be_taken || false;
    this.advance_amount = data.advance_amount || null;
    
    this.is_order_through_broker = data.is_order_through_broker || false;
    this.broker_name = data.broker_name || null;
    
    this.upload_so = data.upload_so || null;
    
    // Stage 1 columns (renamed from planned_time, actual_time, time_delay)
    this.planned_1 = data.planned_1 || null;
    this.actual_1 = data.actual_1 || null;
    this.delay_1 = data.delay_1 || null;
    
    this.sku_name = data.sku_name || null;
    this.approval_qty = data.approval_qty || null;
    
    this.take_required_rates_each_item = data.take_required_rates_each_item || false;
    
    this.remark = data.remark || null;
    
    // Stage 2 columns (renamed from planned_dispatch, actual_dispatch, delay_dispatch)
    this.planned_2 = data.planned_2 || null;
    this.actual_2 = data.actual_2 || null;
    this.delay_2 = data.delay_2 || null;
    
    this.rate_is_rightly_as_per_current_market_rate = data.rate_is_rightly_as_per_current_market_rate || false;
    this.we_are_dealing_in_ordered_sku = data.we_are_dealing_in_ordered_sku || false;
    
    this.party_credit_status = data.party_credit_status || null;
    this.dispatch_date_confirmed = data.dispatch_date_confirmed || false;
    
    this.overall_status_of_order = data.overall_status_of_order || null;
    this.order_confirmation_with_customer = data.order_confirmation_with_customer || false;
    
    // Stage 3 columns (renamed from planned_4, actual_4, time_delay_4)
    this.planned_3 = data.planned_3 || null;
    this.actual_3 = data.actual_3 || null;
    this.delay_3 = data.delay_3 || null;
    
    this.remaining_dispatch_qty = data.remaining_dispatch_qty !== undefined ? data.remaining_dispatch_qty : null;
    
    this.created_at = data.created_at || new Date();
  }

  /**
   * Convert to database format
   * @returns {Object}
   */
  toDatabase() {
    return {
      timestamp_created: this.timestamp_created,
      order_no: this.order_no,
      // serial column removed - now part of order_no (e.g., DO-001A)
      order_type_delivery_purpose: this.order_type_delivery_purpose,
      depo_name: this.depo_name,
      order_punch_remarks: this.order_punch_remarks,
      start_date: this.start_date,
      end_date: this.end_date,
      delivery_date: this.delivery_date,
      order_type: this.order_type,
      customer_type: this.customer_type,
      party_so_date: this.party_so_date,
      customer_name: this.customer_name,
      product_name: this.product_name,
      uom: this.uom,
      order_quantity: this.order_quantity,
      rate_of_material: this.rate_of_material,
      alternate_uom: this.alternate_uom,
      alternate_qty_kg: this.alternate_qty_kg,
      oil_type: this.oil_type,
      rate_per_15kg: this.rate_per_15kg,
      rate_per_ltr: this.rate_per_ltr,
      total_amount_with_gst: this.total_amount_with_gst,
      type_of_transporting: this.type_of_transporting,
      customer_contact_person_name: this.customer_contact_person_name,
      customer_contact_person_whatsapp_no: this.customer_contact_person_whatsapp_no,
      customer_address: this.customer_address,
      payment_terms: this.payment_terms,
      advance_payment_to_be_taken: this.advance_payment_to_be_taken,
      advance_amount: this.advance_amount,
      is_order_through_broker: this.is_order_through_broker,
      broker_name: this.broker_name,
      upload_so: this.upload_so,
      planned_1: this.planned_1,
      actual_1: this.actual_1,
      delay_1: this.delay_1,
      sku_name: this.sku_name,
      approval_qty: this.approval_qty,
      take_required_rates_each_item: this.take_required_rates_each_item,
      remark: this.remark,
      planned_2: this.planned_2,
      actual_2: this.actual_2,
      delay_2: this.delay_2,
      rate_is_rightly_as_per_current_market_rate: this.rate_is_rightly_as_per_current_market_rate,
      we_are_dealing_in_ordered_sku: this.we_are_dealing_in_ordered_sku,
      party_credit_status: this.party_credit_status,
      dispatch_date_confirmed: this.dispatch_date_confirmed,
      overall_status_of_order: this.overall_status_of_order,
      order_confirmation_with_customer: this.order_confirmation_with_customer,
      planned_3: this.planned_3,
      actual_3: this.actual_3,
      delay_3: this.delay_3,
      remaining_dispatch_qty: this.remaining_dispatch_qty
    };
  }
}

module.exports = OrderDispatch;
