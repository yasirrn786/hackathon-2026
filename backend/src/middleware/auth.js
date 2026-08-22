const jwt = require('jsonwebtoken');
const pool = require('../db');
const { JWT_SECRET } = require('../config');

/**
 * Middleware to verify JWT token and attach user to request.
 *
 * Security notes:
 * - No fallback secret is used. If JWT_SECRET is ever unset, config.js
 *   already refuses to let the process start at all, so we never reach a
 *   state where an insecure default is in use here.
 * - Token expiration is enforced by jwt.verify() itself (it throws
 *   TokenExpiredError once `exp` has passed), and we surface that as a
 *   distinct, actionable error rather than a generic "invalid token".
 * - User existence is re-checked against the database on every request
 *   (not just trusted from the token payload), so a deleted/deactivated
 *   account can't keep using an old, still-unexpired token.
 * - Employee association (req.user.employee_id) is attached when present;
 *   routes that require it check for it explicitly, since ADMIN/HR users
 *   are not required to have a linked employee record.
 */
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Fetch fresh user & employee data from database on every request.
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

    const user = userRes.rows[0];

    if (user.status === 'INACTIVE') {
      return res.status(403).json({ success: false, error: 'This account has been deactivated.' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Your session has expired. Please sign in again.' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(403).json({ success: false, error: 'Invalid authentication token.' });
    }
    console.error('JWT verification error:', err.message);
    return res.status(403).json({ success: false, error: 'Authentication failed.' });
  }
}

/**
 * Middleware to require that the authenticated user has a linked employee
 * record (true for EMPLOYEE, and typically for HR too, but not guaranteed
 * for ADMIN service accounts). Use on routes like check-in/check-out/leave
 * that operate on "my own" employee record.
 */
function requireEmployeeRecord(req, res, next) {
  if (!req.user || !req.user.employee_id) {
    return res.status(400).json({
      success: false,
      error: 'This account is not linked to an employee record.',
    });
  }
  next();
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
  requireRole,
  requireEmployeeRecord
};
