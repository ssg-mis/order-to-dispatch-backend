# Pre-Approval API Documentation

## Overview

Backend APIs for Stage 2: Pre-Approval workflow

## Base URL

```
http://localhost:5001/api/v1/pre-approval
```

## Endpoints

### 1. Get Pending Pre-Approvals

**Endpoint:** `GET /api/v1/pre-approval/pending`

**Description:** Get orders that are pending pre-approval (planned_1 IS NOT NULL AND actual_1 IS NULL)

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | number | No | Page number (default: 1) |
| limit | number | No | Items per page (default: 10) |
| order_no | string | No | Filter by order number |
| customer_name | string | No | Filter by customer name (partial match) |
| start_date | date | No | Filter by delivery date start (YYYY-MM-DD) |
| end_date | date | No | Filter by delivery date end (YYYY-MM-DD) |

**Example Request:**

```bash
GET /api/v1/pre-approval/pending?page=1&limit=10&customer_name=vikas
```

**Example Response:**

```json
{
  "success": true,
  "message": "Pending pre-approvals fetched successfully",
  "data": {
    "orders": [
      {
        "id": 1,
        "order_no": "DO-001",
        "serial": "A",
        "customer_name": "vikas",
        "product_name": "Rice Bran Oil",
        "oil_type": "Rice Bran Oil",
        "rate_per_15kg": 4565656,
        "delivery_date": "2026-01-17",
        "planned_1": "2026-01-16T05:50:56.054Z",
        "actual_1": null,
        ...
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 4,
      "totalPages": 1
    }
  },
  "timestamp": "2026-01-16T11:45:00.000Z"
}
```

---

### 2. Get Pre-Approval History

**Endpoint:** `GET /api/v1/pre-approval/history`

**Description:** Get completed pre-approvals (planned_1 IS NOT NULL AND actual_1 IS NOT NULL)

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | number | No | Page number (default: 1) |
| limit | number | No | Items per page (default: 10) |
| order_no | string | No | Filter by order number |
| customer_name | string | No | Filter by customer name (partial match) |
| start_date | date | No | Filter by delivery date start (YYYY-MM-DD) |
| end_date | date | No | Filter by delivery date end (YYYY-MM-DD) |

**Example Request:**

```bash
GET /api/v1/pre-approval/history?page=1&limit=10
```

**Example Response:**

```json
{
  "success": true,
  "message": "Pre-approval history fetched successfully",
  "data": {
    "orders": [
      {
        "id": 5,
        "order_no": "DO-002",
        "serial": "B",
        "customer_name": "ABC Corp",
        "product_name": "Palm Oil",
        "oil_type": "Palm Oil",
        "rate_per_15kg": 676767,
        "delivery_date": "2026-01-17",
        "planned_1": "2026-01-16T05:50:56.054Z",
        "actual_1": "2026-01-16T07:30:00.000Z",
        ...
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 15,
      "totalPages": 2
    }
  },
  "timestamp": "2026-01-16T11:45:00.000Z"
}
```

---

### 3. Submit Pre-Approval

**Endpoint:** `POST /api/v1/pre-approval/submit/:id`

**Description:** Submit a pre-approval by setting actual_1 to current timestamp

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | number | Yes | Order ID to submit |

**Request Body:** (Optional)

```json
{
  "remark": "Approved with special conditions",
  "rate_per_15kg": 450000
}
```

**Example Request:**

```bash
POST /api/v1/pre-approval/submit/1
Content-Type: application/json

{
  "remark": "Pre-approval completed successfully"
}
```

**Example Response:**

```json
{
  "success": true,
  "message": "Pre-approval submitted successfully",
  "data": {
    "id": 1,
    "order_no": "DO-001",
    "serial": "A",
    "customer_name": "vikas",
    "product_name": "Rice Bran Oil",
    "planned_1": "2026-01-16T05:50:56.054Z",
    "actual_1": "2026-01-16T11:45:30.123Z",
    "remark": "Pre-approval completed successfully",
    ...
  },
  "timestamp": "2026-01-16T11:45:30.234Z"
}
```

---

## Error Responses

### 404 Not Found

```json
{
  "success": false,
  "message": "Order not found",
  "timestamp": "2026-01-16T11:45:00.000Z"
}
```

### 500 Internal Server Error

```json
{
  "success": false,
  "message": "Failed to fetch pending pre-approvals",
  "timestamp": "2026-01-16T11:45:00.000Z"
}
```

---

## Frontend Integration

### Fetch Pending Orders

```typescript
const fetchPendingOrders = async () => {
  const response = await fetch(
    "http://localhost:5001/api/v1/pre-approval/pending?page=1&limit=10"
  );
  const data = await response.json();

  if (data.success) {
    setPendingOrders(data.data.orders);
    setPagination(data.data.pagination);
  }
};
```

### Fetch History

```typescript
const fetchHistory = async () => {
  const response = await fetch(
    "http://localhost:5001/api/v1/pre-approval/history?page=1&limit=10"
  );
  const data = await response.json();

  if (data.success) {
    setHistoryOrders(data.data.orders);
  }
};
```

### Submit Pre-Approval

```typescript
const submitPreApproval = async (orderId: number) => {
  const response = await fetch(
    `http://localhost:5001/api/v1/pre-approval/submit/${orderId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        remark: "Approved",
      }),
    }
  );

  const data = await response.json();

  if (data.success) {
    toast.success("Pre-approval submitted successfully");
    fetchPendingOrders(); // Refresh pending list
    fetchHistory(); // Refresh history list
  }
};
```

---

## Database Logic

### Pending Condition

```sql
WHERE planned_1 IS NOT NULL
  AND actual_1 IS NULL
```

This means:

- `planned_1` has a timestamp (order created/entered system)
- `actual_1` is NULL (not yet submitted/approved)

### History Condition

```sql
WHERE planned_1 IS NOT NULL
  AND actual_1 IS NOT NULL
```

This means:

- Both `planned_1` and `actual_1` have timestamps
- Order was submitted/approved (actual_1 was set)

### Submit Action

```sql
UPDATE order_dispatch
SET actual_1 = CURRENT_TIMESTAMP
WHERE id = ?
```

This sets the `actual_1` timestamp to mark the order as submitted/approved.

---

## Testing

### Test Pending Endpoint

```bash
curl http://localhost:5001/api/v1/pre-approval/pending
```

### Test History Endpoint

```bash
curl http://localhost:5001/api/v1/pre-approval/history
```

### Test Submit

```bash
curl -X POST http://localhost:5001/api/v1/pre-approval/submit/1 \
  -H "Content-Type: application/json" \
  -d '{"remark": "Test approval"}'
```

---

## Summary

✅ **3 API Endpoints Created:**

1. `GET /pending` - Fetch pending pre-approvals
2. `GET /history` - Fetch completed pre-approvals
3. `POST /submit/:id` - Submit pre-approval

✅ **Features:**

- Pagination support
- Filtering by order number, customer name, date range
- Automatic timestamp handling
- Proper error handling
- Ready for frontend integration
