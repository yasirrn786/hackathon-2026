const pool = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Register User (Employee or HR/Admin)
const signup = async (req, res) => {
    try {
        const { employee_id, email, password, role } = req.body;

        // Check if user already exists
        const userExists = await pool.query('SELECT * FROM users WHERE email = $1 OR employee_id = $2', [email, employee_id]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ error: "User with this email or Employee ID already exists." });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Insert into database
        const newUser = await pool.query(
            'INSERT INTO users (employee_id, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, employee_id, email, role',
            [employee_id, email, hashedPassword, role || 'employee']
        );

        res.status(201).json({
            message: "User registered successfully!",
            user: newUser.rows[0]
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server error during registration." });
    }
};

// Sign In User
const signin = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check if user exists
        const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (user.rows.length === 0) {
            return res.status(400).json({ error: "Invalid email or password." }); //[cite: 1]
        }

        // Validate password
        const validPassword = await bcrypt.compare(password, user.rows[0].password_hash);
        if (!validPassword) {
            return res.status(400).json({ error: "Invalid email or password." }); //[cite: 1]
        }

        // Create JWT Token
        const token = jwt.sign(
            { id: user.rows[0].id, role: user.rows[0].role },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '1d' }
        );

        res.json({
            message: "Logged in successfully!",
            token,
            role: user.rows[0].role,
            employee_id: user.rows[0].employee_id
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server error during login." });
    }
};

module.exports = { signup, signin };