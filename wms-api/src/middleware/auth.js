// wms-api/src/middleware/auth.js
// Authentication middleware

import jwt from 'jsonwebtoken';

/**
 * Authenticate JWT token
 */
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      code: 'UNAUTHORIZED',
      message: 'Authentication token required'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret');
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({
      code: 'FORBIDDEN',
      message: 'Invalid or expired token'
    });
  }
}

