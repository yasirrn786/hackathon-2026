const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { Client } = require('pg');
const pool = require('./db');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const authRoutes = require('./routes/authRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());

// Function to automatically create database and all necessary tables safely
const createTables = async () => {
    try {
        const tempClient = new Client({
            connectionString: 'postgresql://postgres:postgres@localhost:5432/postgres'
        });
        await tempClient.connect();
        
        const res = await tempClient.query(`SELECT 1 FROM pg_database WHERE datname = 'dayflow_db'`);
        if (res.rowCount === 0) {
            await tempClient.query(`CREATE DATABASE dayflow_db;`);
            console.log("Database 'dayflow_db' created successfully!");
        }
        await tempClient.end();

        // Drop old tables to clear out outdated schemas and rebuild fresh
        await pool.query(`DROP TABLE IF EXISTS salaries, attendance, employees, users CASCADE;`);

        // Create all tables matching your HRMS specifications using pool
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                login_id VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(20) DEFAULT 'EMPLOYEE',
                must_change_password BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS employees (
                id SERIAL PRIMARY KEY,
                user_id INT REFERENCES users(id) ON DELETE CASCADE,
                first_name VARCHAR(50) NOT NULL,
                last_name VARCHAR(50) NOT NULL,
                phone VARCHAR(20) NOT NULL,
                job_position VARCHAR(100) NOT NULL,
                location VARCHAR(100) NOT NULL,
                date_of_joining DATE NOT NULL,
                date_of_birth DATE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS attendance (
                id SERIAL PRIMARY KEY,
                employee_id INT REFERENCES employees(id) ON DELETE CASCADE,
                date DATE NOT NULL,
                check_in_time TIMESTAMP,
                check_out_time TIMESTAMP,
                work_hours DECIMAL(5,2) DEFAULT 0.00,
                extra_hours DECIMAL(5,2) DEFAULT 0.00,
                status VARCHAR(20) DEFAULT 'ABSENT',
                UNIQUE(employee_id, date)
            );

            CREATE TABLE IF NOT EXISTS salaries (
                id SERIAL PRIMARY KEY,
                employee_id INT REFERENCES employees(id) ON DELETE CASCADE,
                annual_ctc DECIMAL(12,2) NOT NULL,
                basic_salary DECIMAL(10,2) NOT NULL,
                hra DECIMAL(10,2) NOT NULL,
                provident_fund DECIMAL(10,2) NOT NULL,
                professional_tax DECIMAL(10,2) NOT NULL,
                fixed_allowance DECIMAL(10,2) NOT NULL,
                net_monthly_take_home DECIMAL(10,2) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("Database and tables verified/created successfully!");
    } catch (err) {
        console.error("Error setting up database:", err.message);
    }
};

createTables();

// Use Auth Routes
app.use('/api/auth', authRoutes);

// 1. Employee Registration Route (Automatically generates Login ID & Temp Password)
app.post('/api/employees/create', async (req, res) => {
    try {
        const { firstName, lastName, email, phone, jobPosition, location, dateOfJoining, dateOfBirth, role } = req.body;

        const companyPrefix = 'OI';
        const firstTwoFirst = firstName.substring(0, 2).toUpperCase();
        const firstTwoLast = lastName.substring(0, 2).toUpperCase();
        const year = new Date(dateOfJoining).getFullYear().toString();

        const startOfYear = `${year}-01-01`;
        const endOfYear = `${year}-12-31`;

        const countQuery = await pool.query(
            `SELECT COUNT(*) FROM employees WHERE date_of_joining BETWEEN $1 AND $2`,
            [startOfYear, endOfYear]
        );
        const serialNumber = (parseInt(countQuery.rows[0].count) + 1).toString().padStart(4, '0');
        const loginId = `${companyPrefix}${firstTwoFirst}${firstTwoLast}${year}${serialNumber}`;

        const tempPassword = crypto.randomBytes(4).toString('hex') + '@123';
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(tempPassword, salt);

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const userResult = await client.query(
                `INSERT INTO users (login_id, email, password_hash, role, must_change_password) 
                 VALUES ($1, $2, $3, $4, TRUE) RETURNING id, login_id`,
                [loginId, email, passwordHash, role || 'EMPLOYEE']
            );
            const userId = userResult.rows[0].id;

            const employeeResult = await client.query(
                `INSERT INTO employees (user_id, first_name, last_name, phone, job_position, location, date_of_joining, date_of_birth) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
                [userId, firstName, lastName, phone, jobPosition, location, dateOfJoining, dateOfBirth]
            );

            await client.query('COMMIT');

            res.status(201).json({
                success: true,
                loginId: loginId,
                tempPassword: tempPassword,
                employee: employeeResult.rows[0]
            });
        } catch (dbError) {
            await client.query('ROLLBACK');
            throw dbError;
        } finally {
            client.release();
        }

    } catch (err) {
        console.error("Error creating employee:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. Attendance Check-In Route
app.post('/api/attendance/check-in', async (req, res) => {
    try {
        const { employeeId } = req.body;
        const today = new Date().toISOString().split('T')[0];
        const now = new Date();

        const existing = await pool.query(
            `SELECT * FROM attendance WHERE employee_id = $1 AND date = $2`,
            [employeeId, today]
        );

        if (existing.rows.length > 0 && existing.rows[0].check_in_time) {
            return res.status(400).json({ success: false, error: "Already checked in today!" });
        }

        let result;
        if (existing.rows.length > 0) {
            result = await pool.query(
                `UPDATE attendance SET check_in_time = $1, status = 'PRESENT' 
                 WHERE employee_id = $2 AND date = $3 RETURNING *`,
                [now, employeeId, today]
            );
        } else {
            result = await pool.query(
                `INSERT INTO attendance (employee_id, date, check_in_time, status) 
                 VALUES ($1, $2, $3, 'PRESENT') RETURNING *`,
                [employeeId, today, now]
            );
        }

        res.json({ success: true, message: "Checked in successfully!", attendance: result.rows[0] });
    } catch (err) {
        console.error("Check-in error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. Attendance Check-Out Route
app.post('/api/attendance/check-out', async (req, res) => {
    try {
        const { employeeId } = req.body;
        const today = new Date().toISOString().split('T')[0];
        const now = new Date();

        const record = await pool.query(
            `SELECT * FROM attendance WHERE employee_id = $1 AND date = $2`,
            [employeeId, today]
        );

        if (record.rows.length === 0 || !record.rows[0].check_in_time) {
            return res.status(400).json({ success: false, error: "You haven't checked in yet today!" });
        }

        const checkInTime = new Date(record.rows[0].check_in_time);
        const diffMs = now - checkInTime;
        const workHours = (diffMs / (1000 * 60 * 60)).toFixed(2);
        const extraHours = workHours > 8 ? (workHours - 8).toFixed(2) : 0.00;

        const updated = await pool.query(
            `UPDATE attendance SET check_out_time = $1, work_hours = $2, extra_hours = $3 
             WHERE employee_id = $4 AND date = $5 RETURNING *`,
            [now, workHours, extraHours, employeeId, today]
        );

        res.json({ success: true, message: "Checked out successfully!", attendance: updated.rows[0] });
    } catch (err) {
        console.error("Check-out error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4. Automated Salary Calculation Route
app.post('/api/salary/calculate', async (req, res) => {
    try {
        const { employeeId, annualCtc } = req.body;

        if (!employeeId || !annualCtc) {
            return res.status(400).json({ success: false, error: "Employee ID and Annual CTC are required." });
        }

        const monthlyCtc = annualCtc / 12;
        const basicSalary = monthlyCtc * 0.50;
        const hra = basicSalary * 0.50;
        const providentFund = basicSalary * 0.12;
        const professionalTax = 200.00;
        const fixedAllowance = monthlyCtc - (basicSalary + hra + providentFund + professionalTax);
        const netMonthlyTakeHome = (basicSalary + hra + fixedAllowance) - (providentFund + professionalTax);

        const result = await pool.query(
            `INSERT INTO salaries (employee_id, annual_ctc, basic_salary, hra, provident_fund, professional_tax, fixed_allowance, net_monthly_take_home) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [
                employeeId, 
                annualCtc, 
                basicSalary.toFixed(2), 
                hra.toFixed(2), 
                providentFund.toFixed(2), 
                professionalTax.toFixed(2), 
                fixedAllowance.toFixed(2), 
                netMonthlyTakeHome.toFixed(2)
            ]
        );

        res.status(201).json({
            success: true,
            message: "Salary structure calculated and saved successfully!",
            breakdown: {
                monthlyCtc: monthlyCtc.toFixed(2),
                basicSalary: basicSalary.toFixed(2),
                hra: hra.toFixed(2),
                providentFund: providentFund.toFixed(2),
                professionalTax: professionalTax.toFixed(2),
                fixedAllowance: fixedAllowance.toFixed(2),
                netMonthlyTakeHome: netMonthlyTakeHome.toFixed(2)
            },
            record: result.rows[0]
        });

    } catch (err) {
        console.error("Salary calculation error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Test route
app.get('/', (req, res) => {
    res.json({ message: "Dayflow HRMS API is running!" });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});