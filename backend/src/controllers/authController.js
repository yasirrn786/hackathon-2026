const pool = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_EXPIRES_IN, BCRYPT_SALT_ROUNDS } = require('../config');

// Sign In User (Supports Email OR Login ID)
const signin = async (req, res) => {
  try {
    const { email, login_id, identifier, password } = req.body;
    const loginCredential = (identifier || email || login_id || '').trim();

    if (!loginCredential || !password) {
      return res.status(400).json({ success: false, error: "Please provide your Email/Login ID and password." });
    }

    // Find user by either email or login_id (case insensitive for email)
    const userRes = await pool.query(
      `SELECT u.id, u.login_id, u.email, u.password_hash, u.role, u.must_change_password,
              e.id as employee_id, e.first_name, e.last_name, e.job_position, e.department, e.location, e.avatar_url
       FROM users u
       LEFT JOIN employees e ON e.user_id = u.id
       WHERE LOWER(u.email) = LOWER($1) OR UPPER(u.login_id) = UPPER($1)`,
      [loginCredential]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({ success: false, error: "Invalid Email/Login ID or password." });
    }

    const user = userRes.rows[0];

    // Validate password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ success: false, error: "Invalid Email/Login ID or password." });
    }

    // Create JWT Token
    const token = jwt.sign(
      { id: user.id, role: user.role, login_id: user.login_id },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      success: true,
      message: "Logged in successfully!",
      token,
      role: user.role,
      loginId: user.login_id,
      user: {
        userId: user.id,
        employeeId: user.employee_id,
        loginId: user.login_id,
        email: user.email,
        role: user.role,
        firstName: user.first_name || 'User',
        lastName: user.last_name || '',
        fullName: `${user.first_name || 'User'} ${user.last_name || ''}`.trim(),
        jobPosition: user.job_position || 'Staff Member',
        department: user.department || 'General',
        location: user.location || 'Remote',
        avatarUrl: user.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
        mustChangePassword: user.must_change_password
      }
    });
  } catch (err) {
    console.error("Sign in error:", err.message);
    res.status(500).json({ success: false, error: "Server error during login." });
  }
};

// Get Current Logged-in User Profile
const getMe = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: "Unauthorized." });
    }

    res.json({
      success: true,
      user: {
        userId: req.user.user_id,
        employeeId: req.user.employee_id,
        loginId: req.user.login_id,
        email: req.user.email,
        role: req.user.role,
        firstName: req.user.first_name || 'User',
        lastName: req.user.last_name || '',
        fullName: `${req.user.first_name || 'User'} ${req.user.last_name || ''}`.trim(),
        jobPosition: req.user.job_position || 'Staff Member',
        department: req.user.department || 'General',
        location: req.user.location || 'Remote',
        status: req.user.status || 'ACTIVE',
        avatarUrl: req.user.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
        mustChangePassword: req.user.must_change_password
      }
    });
  } catch (err) {
    console.error("getMe error:", err.message);
    res.status(500).json({ success: false, error: "Server error fetching profile." });
  }
};

// NOTE: There is intentionally no public signup/registration endpoint here.
//
// Dayflow does not allow unauthenticated users to create their own account
// or choose their own role. All accounts (EMPLOYEE, HR, ADMIN) are created
// by an existing HR/Admin user via POST /api/employees/create-employee,
// which is protected by authenticateToken + requireRole(['ADMIN','HR']) and
// always derives the role from a controlled input, never from an anonymous
// request body. If a public signup route is ever reintroduced, it becomes
// a privilege-escalation vector (an anonymous user posting {"role":"ADMIN"}).

/**
 * Change own password. Requires the current password to be supplied so a
 * hijacked-but-still-valid session can't silently lock the real owner out,
 * and clears must_change_password once the user has set a new one.
 */
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Current and new password are required.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, error: 'New password must be at least 8 characters.' });
    }

    const userRes = await pool.query('SELECT id, password_hash FROM users WHERE id = $1', [req.user.user_id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const validCurrent = await bcrypt.compare(currentPassword, userRes.rows[0].password_hash);
    if (!validCurrent) {
      return res.status(401).json({ success: false, error: 'Current password is incorrect.' });
    }

    const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);
    const newHash = await bcrypt.hash(newPassword, salt);

    await pool.query(
      `UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2`,
      [newHash, req.user.user_id]
    );

    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    console.error('changePassword error:', err.message);
    res.status(500).json({ success: false, error: 'Server error while updating password.' });
  }
};

module.exports = { signin, getMe, changePassword };