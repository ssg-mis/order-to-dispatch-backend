# Order Dispatch API Documentation

## Base URL

```
http://localhost:5001/api/v1
```

## Endpoints

### 1. Create Order (Single Product)

**POST** `/api/v1/orders`

Creates a new order with automatic order number generation (DO-001, DO-002, etc.)

**Request Body:**

```json
{
  "customer_name": "ABC Corporation",
  "order_type": "Bulk",
  "customer_type": "Corporate",
  "order_type_delivery_purpose": "Industrial Use",
  "start_date": "2026-01-16",
  "end_date": "2026-01-30",
  "delivery_date": "2026-01-25",
  "party_so_date": "2026-01-15",
  "product_name": "Sunflower Oil",
  "uom": "Liters",
  "order_quantity": 1000,
  "rate_of_material": 150.5,
  "alternate_uom": "KG",
  "alternate_qty_kg": 920,
  "oil_type": "Refined",
  "rate_per_15kg": 2257.5,
  "rate_per_ltr": 150.5,
  "total_amount_with_gst": 177090.0,
  "type_of_transporting": "Own Vehicle",
  "customer_contact_person_name": "John Doe",
  "customer_contact_person_whatsapp_no": "+919876543210",
  "customer_address": "123, Industrial Area, Mumbai",
  "payment_terms": "30 Days Credit",
  "advance_payment_to_be_taken": true,
  "advance_amount": 50000,
  "is_order_through_broker": false,
  "broker_name": null,
  "upload_so": "https://s3.amazonaws.com/...",
  "remark": "Urgent delivery required",
  "party_credit_status": "Good",
  "dispatch_date_confirmed": true,
  "overall_status_of_order": "Confirmed",
  "order_confirmation_with_customer": true
}
```

**Response:**

```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "order_no": "DO-001",
    "orders": [
      {
        "id": 1,
        "order_no": "DO-001",
        "serial": "A",
        "customer_name": "ABC Corporation",
        ...
      }
    ]
  },
  "timestamp": "2026-01-16T08:30:00.000Z"
}
```

---

### 2. Create Order (Multiple Products)

**POST** `/api/v1/orders`

When submitting multiple products, the same order number (e.g., DO-001) is assigned with different serials (A, B, C, etc.)

**Request Body:**

```json
{
  "customer_name": "ABC Corporation",
  "order_type": "Bulk",
  "customer_type": "Corporate",
  "start_date": "2026-01-16",
  "delivery_date": "2026-01-25",
  "customer_contact_person_name": "John Doe",
  "customer_address": "123, Industrial Area, Mumbai",
  "payment_terms": "30 Days Credit",
  "products": [
    {
      "product_name": "Sunflower Oil",
      "uom": "Liters",
      "order_quantity": 1000,
      "rate_of_material": 150.5,
      "oil_type": "Refined",
      "sku_name": "SUN-REF-1L"
    },
    {
      "product_name": "Mustard Oil",
      "uom": "Liters",
      "order_quantity": 500,
      "rate_of_material": 180.0,
      "oil_type": "Cold Pressed",
      "sku_name": "MUS-CP-1L"
    },
    {
      "product_name": "Coconut Oil",
      "uom": "Liters",
      "order_quantity": 200,
      "rate_of_material": 250.0,
      "oil_type": "Virgin",
      "sku_name": "COC-VIR-1L"
    }
  ]
}
```

**Response:**

```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "order_no": "DO-001",
    "orders": [
      {
        "id": 1,
        "order_no": "DO-001",
        "serial": "A",
        "product_name": "Sunflower Oil",
        "order_quantity": 1000,
        ...
      },
      {
        "id": 2,
        "order_no": "DO-001",
        "serial": "B",
        "product_name": "Mustard Oil",
        "order_quantity": 500,
        ...
      },
      {
        "id": 3,
        "order_no": "DO-001",
        "serial": "C",
        "product_name": "Coconut Oil",
        "order_quantity": 200,
        ...
      }
    ]
  },
  "timestamp": "2026-01-16T08:30:00.000Z"
}
```

---

### 3. Get All Orders

**GET** `/api/v1/orders?page=1&limit=10`

**Query Parameters:**

- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)
- `order_no` (optional): Filter by order number
- `customer_name` (optional): Filter by customer name (partial match)
- `order_type` (optional): Filter by order type

**Response:**

```json
{
  "success": true,
  "message": "Orders fetched successfully",
  "data": {
    "orders": [...],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 50,
      "totalPages": 5
    }
  },
  "timestamp": "2026-01-16T08:30:00.000Z"
}
```

---

### 4. Get Order by Order Number

**GET** `/api/v1/orders/:orderNo`

Get all rows for a specific order number (returns all products A, B, C, etc.)

**Example:**

```
GET /api/v1/orders/DO-001
```

**Response:**

```json
{
  "success": true,
  "message": "Order fetched successfully",
  "data": [
    {
      "id": 1,
      "order_no": "DO-001",
      "serial": "A",
      "product_name": "Sunflower Oil",
      ...
    },
    {
      "id": 2,
      "order_no": "DO-001",
      "serial": "B",
      "product_name": "Mustard Oil",
      ...
    }
  ],
  "timestamp": "2026-01-16T08:30:00.000Z"
}
```

---

### 5. Update Order

**PUT** `/api/v1/orders/update/:id`

Update a specific order row by ID

**Request Body:**

```json
{
  "overall_status_of_order": "Dispatched",
  "actual_dispatch": "2026-01-20",
  "remark": "Delivered on time"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Order updated successfully",
  "data": {
    "id": 1,
    "order_no": "DO-001",
    "serial": "A",
    "overall_status_of_order": "Dispatched",
    ...
  },
  "timestamp": "2026-01-16T08:30:00.000Z"
}
```

---

### 6. Delete Order

**DELETE** `/api/v1/orders/delete/:id`

Delete a specific order row by ID

**Response:**

```json
{
  "success": true,
  "message": "Order deleted successfully",
  "data": null,
  "timestamp": "2026-01-16T08:30:00.000Z"
}
```

---

## Frontend Integration

### Example: Create Order with Axios

```javascript
import axios from "axios";

const API_URL = "http://localhost:5001/api/v1";

// Single Product Order
const createSingleProductOrder = async (orderData) => {
  try {
    const response = await axios.post(`${API_URL}/orders`, orderData);
    console.log("Order created:", response.data);
    return response.data;
  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
    throw error;
  }
};

// Multiple Products Order
const createMultipleProductsOrder = async (orderData, products) => {
  try {
    const response = await axios.post(`${API_URL}/orders`, {
      ...orderData,
      products: products,
    });
    console.log("Order created:", response.data);
    return response.data;
  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
    throw error;
  }
};

// Get All Orders
const getAllOrders = async (page = 1, limit = 10, filters = {}) => {
  try {
    const response = await axios.get(`${API_URL}/orders`, {
      params: { page, limit, ...filters },
    });
    return response.data;
  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
    throw error;
  }
};

// Get Order by Number
const getOrderByNumber = async (orderNo) => {
  try {
    const response = await axios.get(`${API_URL}/orders/${orderNo}`);
    return response.data;
  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
    throw error;
  }
};
```

### Example: React Form Submission

```jsx
const handleSubmit = async (e) => {
  e.preventDefault();

  const orderData = {
    customer_name: formData.customer_name,
    order_type: formData.order_type,
    delivery_date: formData.delivery_date,
    // ... other fields
  };

  const products = [
    {
      product_name: "Sunflower Oil",
      order_quantity: 1000,
      rate_of_material: 150.5,
    },
    {
      product_name: "Mustard Oil",
      order_quantity: 500,
      rate_of_material: 180.0,
    },
  ];

  try {
    const result = await createMultipleProductsOrder(orderData, products);
    alert(`Order ${result.data.order_no} created successfully!`);
  } catch (error) {
    alert("Failed to create order");
  }
};
```

---

## Error Responses

### Validation Error (422)

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "customer_name",
      "message": "customer_name is required"
    }
  ],
  "timestamp": "2026-01-16T08:30:00.000Z"
}
```

### Not Found (404)

```json
{
  "success": false,
  "message": "Order not found",
  "timestamp": "2026-01-16T08:30:00.000Z"
}
```

### Server Error (500)

```json
{
  "success": false,
  "message": "Internal Server Error",
  "timestamp": "2026-01-16T08:30:00.000Z"
}
```

---

## Key Features

✅ **Automatic Order Number Generation**: DO-001, DO-002, DO-003, etc.  
✅ **Serial Letter Generation**: A, B, C for multiple products  
✅ **Transaction Support**: All products inserted atomically  
✅ **Pagination**: Efficient data loading  
✅ **Filtering**: Search by order number, customer, type  
✅ **Validation**: Comprehensive input validation  
✅ **Error Handling**: Detailed error messages

## CORS Configuration

The backend is configured to accept requests from any origin during development. For production, update `CORS_ORIGIN` in `.env` to your frontend URL.
