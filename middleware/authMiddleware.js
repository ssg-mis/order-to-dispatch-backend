const jwt = require('jsonwebtoken');
const appConfig = require('../config/app');

const authMiddleware = (req, res, next) => {
  try {
    let token = null;

    // 1. Try to read token from cookies header manually
    if (req.headers.cookie) {
      const cookies = req.headers.cookie.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.split('=').map(c => c.trim());
        if (key && value) acc[key] = decodeURIComponent(value);
        return acc;
      }, {});
      token = cookies.token;
    }

    // 2. Fallback to Authorization header
    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided, authorization denied'
      });
    }

    const decoded = jwt.verify(token, appConfig.jwt.secret);
    req.user = decoded; // { id, username, role }
    next();
  } catch (error) {
    const message = error.name === 'TokenExpiredError'
      ? 'Token expired, please login again'
      : 'Invalid token';
    return res.status(401).json({ success: false, message });
  }
};

module.exports = authMiddleware;
