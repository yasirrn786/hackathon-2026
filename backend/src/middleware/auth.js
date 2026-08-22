const jwt = require('jsonwebtoken');
const pool = require('../db');

/**
 * Middleware to verify JWT token and attach user to request
 */
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Format: Bearer <token>

  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dayflow_super_secret_jwt_key_2026');
    
    // Fetch fresh user & employee data from database
    const userRes = await pool.query(
      `SELECT u.id as user_id, u.login_id, u.email, u.role, u.must_change_password,
              e.id as employee_id, e.first_name, e.last_name, e.job_position, e.department, e.location, e.status, e.avatar_url
       FROM users u
       LEFT JOIN employees e ON e.user_id = u.id
       WHERE u.id = $1`,
      [decoded.id]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'User no longer exists.' });
    }

    req.user = userRes.rows[0];
    next();
  } catch (err) {
    console.error('JWT verification error:', err.message);
    return res.status(403).json({ success: false, error: 'Invalid or expired token.' });
  }
}

/**
 * Middleware to enforce role-based access control
 * @param {string[]} roles Array of permitted roles, e.g. ['ADMIN', 'HR']
 */
function requireRole(roles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized.' });
    }

    const userRole = (req.user.role || '').toUpperCase();
    const normalizedRoles = roles.map(r => r.toUpperCase());

    if (!normalizedRoles.includes(userRole)) {
      return res.status(403).json({ 
        success: false, 
        error: `Access denied. Requires one of: ${roles.join(', ')}` 
      });
    }

    next();
  };
}

module.exports = {
  authenticateToken,
  requireRole
};
