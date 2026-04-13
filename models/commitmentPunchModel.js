/**
 * Commitment Punch Model
 * Represents commitment_punch table structure
 */

class CommitmentPunch {
  constructor(data = {}) {
    this.commitment_no = data.commitment_no || null;
    this.commitment_date = data.commitment_date || null;
    this.party_name = data.party_name || null;
    this.oil_type = data.oil_type || null;
    this.quantity = data.quantity || null;
    this.unit = data.unit || null;
    this.rate = data.rate || null;
    this.planned1 = data.planned1 || null;
    this.actual1 = data.actual1 || null;
    this.delay1 = data.delay1 || null;
    this.po_no = data.po_no || null;
    this.po_date = data.po_date || null;
    this.sku = data.sku || null;
    this.sku_quantity = data.sku_quantity || null;
    this.sku_rate = data.sku_rate || null;
    this.order_type = data.order_type || null;
    this.transport_type = data.transport_type || null;
  }

  toDatabase() {
    return {
      commitment_no: this.commitment_no,
      commitment_date: this.commitment_date,
      party_name: this.party_name,
      oil_type: this.oil_type,
      quantity: this.quantity,
      unit: this.unit,
      rate: this.rate,
      planned1: this.planned1,
      actual1: this.actual1,
      delay1: this.delay1,
      po_no: this.po_no,
      po_date: this.po_date,
      sku: this.sku,
      sku_quantity: this.sku_quantity,
      sku_rate: this.sku_rate,
      order_type: this.order_type,
      transport_type: this.transport_type,
    };
  }
}

module.exports = CommitmentPunch;
