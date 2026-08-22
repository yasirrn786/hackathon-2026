const pool = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

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
      process.env.JWT_SECRET || 'dayflow_super_secret_jwt_key_2026',
      { expiresIn: '7d' }
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

// Sign Up User (Optional manual route)
const signup = async (req, res) => {
  try {
    const { login_id, email, password, role, firstName, lastName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and password are required." });
    }

    const userExists = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1) OR (login_id = $2 AND $2 IS NOT NULL)', 
      [email, login_id || null]
    );

    if (userExists.rows.length > 0) {
      return res.status(400).json({ success: false, error: "User with this email or Login ID already exists." });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const userLoginId = login_id || `OI${Date.now().toString().slice(-8)}`;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const newUser = await client.query(
        'INSERT INTO users (login_id, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, login_id, email, role',
        [userLoginId, email, hashedPassword, (role || 'EMPLOYEE').toUpperCase()]
      );

      const newEmp = await client.query(
        `INSERT INTO employees (user_id, first_name, last_name, email, job_position, department, location, date_of_joining, date_of_birth)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE, '1995-01-01') RETURNING *`,
        [newUser.rows[0].id, firstName || 'New', lastName || 'User', email, 'Staff', 'General', 'Office']
      );

      await client.query('COMMIT');

      res.status(201).json({
        success: true,
        message: "User registered successfully!",
        user: newUser.rows[0],
        employee: newEmp.rows[0]
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Signup error:", err.message);
    res.status(500).json({ success: false, error: "Server error during registration." });
  }
};

module.exports = { signin, getMe, signup };