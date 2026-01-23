# Order Dispatch Backend

Professional Node.js and Express backend with layered architecture for the Order Dispatch System.

## 🚀 Getting Started

### Installation

```bash
npm install
```

### Running the Server

**Development mode (with auto-restart):**

```bash
npm run dev
```

**Production mode:**

```bash
npm start
```

The server will run on `http://localhost:5001` by default.

## 📁 Project Structure

```
backend/
├── server.js                    # Main Express application
├── package.json                 # Dependencies and scripts
├── .env                         # Environment variables
├── .gitignore                  # Git ignore rules
│
├── config/                      # Configuration files
│   ├── app.js                   # Application config
│   ├── database.js              # Database config
│   └── index.js                 # Config exports
│
├── routes/                      # API routes (URL mapping)
│   └── sampleRoute.js          # Sample CRUD routes
│
├── controllers/                 # Request handlers
│   └── sampleController.js     # Sample controller
│
├── services/                    # Business logic layer
│   └── sampleService.js        # Sample service
│
├── models/                      # Data models/schemas
│   ├── sampleModel.js          # Sample model
│   └── index.js                 # Model exports
│
├── validators/                  # Input validation
│   ├── commonValidator.js      # Reusable validators
│   └── sampleValidator.js      # Sample validators
│
├── middleware/                  # Custom middleware
│   ├── authMiddleware.js       # Authentication
│   ├── errorHandler.js         # Global error handler
│   └── requestLogger.js        # Request logging
│
└── utils/                       # Utility functions
    ├── responseUtil.js         # Standardized responses
    ├── logger.js               # Logging utility
    └── index.js                # Utility exports
```

## 🏗️ Architecture Pattern

This backend follows a **layered architecture** with separation of concerns:

### 1. **Routes Layer** (`routes/`)

- Defines API endpoints
- Maps URLs to controllers
- Applies validation middleware
- Handles authentication

### 2. **Controllers Layer** (`controllers/`)

- Handles HTTP requests/responses
- Validates input
- Calls service layer
- Returns formatted responses

### 3. **Services Layer** (`services/`)

- Contains business logic
- Database operations
- Data transformations
- Reusable across controllers

### 4. **Models Layer** (`models/`)

- Data structures
- Schema definitions
- Model validation

### 5. **Validators Layer** (`validators/`)

- Input validation
- Data sanitization
- Validation middleware

### 6. **Utils Layer** (`utils/`)

- Response formatting
- Logging
- Helper functions

## 🌐 API Endpoints

### Base URL

`http://localhost:5001/api/v1`

### Sample Endpoints

| Method | Endpoint              | Description     |
| ------ | --------------------- | --------------- |
| GET    | `/health`             | Health check    |
| GET    | `/api/v1/samples`     | Get all items   |
| GET    | `/api/v1/samples/:id` | Get item by ID  |
| POST   | `/api/v1/samples`     | Create new item |
| PUT    | `/api/v1/samples/:id` | Update item     |
| DELETE | `/api/v1/samples/:id` | Delete item     |

## ⚙️ Environment Variables

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=5001
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=order_dispatch
DB_PORT=3306

# JWT Configuration
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# CORS
CORS_ORIGIN=*

# API
API_PREFIX=/api/v1
```

## 📝 Creating New Features

### 1. Create a Model (`models/yourModel.js`)

```javascript
class YourModel {
  constructor(data = {}) {
    this.id = data.id || null;
    this.name = data.name || "";
    // Add your fields
  }
}
module.exports = YourModel;
```

### 2. Create a Service (`services/yourService.js`)

```javascript
class YourService {
  async getAll() {
    // Business logic here
  }
}
module.exports = new YourService();
```

### 3. Create a Controller (`controllers/yourController.js`)

```javascript
const yourService = require("../services/yourService");
const { ResponseUtil } = require("../utils");

const getAll = async (req, res, next) => {
  try {
    const result = await yourService.getAll();
    return ResponseUtil.success(res, result.data);
  } catch (error) {
    next(error);
  }
};

module.exports = { getAll };
```

### 4. Create Routes (`routes/yourRoute.js`)

```javascript
const express = require("express");
const router = express.Router();
const controller = require("../controllers/yourController");

router.get("/", controller.getAll);

module.exports = router;
```

### 5. Register Routes in `server.js`

```javascript
const yourRoutes = require("./routes/yourRoute");
app.use(`${appConfig.apiPrefix}/yours`, yourRoutes);
```

## 🛠️ Built With

- **Express.js** - Web framework
- **dotenv** - Environment variables
- **cors** - Cross-Origin Resource Sharing
- **body-parser** - Request body parsing
- **nodemon** - Development auto-restart

## 🔐 Security Best Practices

1. Always use environment variables for sensitive data
2. Enable CORS only for trusted origins in production
3. Implement JWT authentication (see `authMiddleware.js`)
4. Validate all user inputs
5. Use HTTPS in production
6. Keep dependencies updated

## 🐛 Error Handling

The application uses a centralized error handler (`middleware/errorHandler.js`) that:

- Catches all errors
- Logs errors with context
- Returns standardized error responses
- Handles specific error types (validation, JWT, etc.)

## 📊 Logging

All requests and errors are logged using the Logger utility:

- Request/response logging
- Error tracking with stack traces
- Timestamp and metadata
- Environment-based logging levels

## 🚦 Response Format

All API responses follow a standardized format:

**Success Response:**

```json
{
  "success": true,
  "message": "Success message",
  "data": {...},
  "timestamp": "2026-01-16T12:00:00.000Z"
}
```

**Error Response:**

```json
{
  "success": false,
  "message": "Error message",
  "errors": [...],
  "timestamp": "2026-01-16T12:00:00.000Z"
}
```

## 📚 Additional Resources

- [Express.js Documentation](https://expressjs.com/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)

## 👥 Contributing

1. Create new features in appropriate layers
2. Follow the existing code structure
3. Add proper JSDoc comments
4. Test your endpoints
5. Update documentation

---

**Happy Coding! 🎉**
