const express = require('express');
const cors = require('cors');
require('dotenv').config();
const pool = require('./db');

const authRoutes = require('./routes/authRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const leaveRoutes = require('./routes/leaveRoutes');
const payrollRoutes = require('./routes/payrollRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Initialize all required database tables safely
const initDatabase = async () => {
  try {
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
        email VARCHAR(100),
        phone VARCHAR(20) DEFAULT '',
        job_position VARCHAR(100) NOT NULL,
        department VARCHAR(100) DEFAULT 'General',
        location VARCHAR(100) DEFAULT 'Headquarters',
        status VARCHAR(20) DEFAULT 'ACTIVE',
        avatar_url TEXT DEFAULT 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
        date_of_joining DATE DEFAULT CURRENT_DATE,
        date_of_birth DATE,
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
        overtime_approved BOOLEAN DEFAULT FALSE,
        overtime_reason TEXT,
        UNIQUE(employee_id, date)
      );

      CREATE TABLE IF NOT EXISTS leave_requests (
        id SERIAL PRIMARY KEY,
        employee_id INT REFERENCES employees(id) ON DELETE CASCADE,
        leave_type VARCHAR(50) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        days_count DECIMAL(4,1) DEFAULT 1.0,
        reason TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'PENDING',
        rejection_reason TEXT,
        reviewed_by INT REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

      CREATE TABLE IF NOT EXISTS payroll (
        id SERIAL PRIMARY KEY,
        employee_id INT REFERENCES employees(id) ON DELETE CASCADE,
        month INT NOT NULL,
        year INT NOT NULL,
        working_days INT DEFAULT 26,
        present_days INT DEFAULT 0,
        loss_of_pay_days DECIMAL(4,1) DEFAULT 0.0,
        gross_salary DECIMAL(10,2),
        deductions DECIMAL(10,2),
        net_salary DECIMAL(10,2),
        status VARCHAR(20) DEFAULT 'DRAFT',
        processed_by INT REFERENCES users(id) ON DELETE SET NULL,
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(employee_id, month, year)
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        related_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Migrations for existing tables
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS email VARCHAR(100);
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS department VARCHAR(100) DEFAULT 'General';
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'ACTIVE';
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS avatar_url TEXT;
      ALTER TABLE employees ALTER COLUMN date_of_birth DROP NOT NULL;
      ALTER TABLE employees ALTER COLUMN phone DROP NOT NULL;
      ALTER TABLE attendance ADD COLUMN IF NOT EXISTS overtime_approved BOOLEAN DEFAULT FALSE;
      ALTER TABLE attendance ADD COLUMN IF NOT EXISTS overtime_reason TEXT;
      ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
    `);
    console.log('Database tables verified and ready.');
  } catch (err) {
    console.error('Database initialization notice:', err.message);
  }
};

initDatabase();

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/notifications', notificationRoutes);

// Root & Health check endpoints
app.get('/', (req, res) => {
  res.json({ message: 'Dayflow HRMS API is running', version: '3.0.0', features: ['auth', 'employees', 'attendance', 'leaves', 'payroll', 'analytics', 'notifications'] });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'UP', timestamp: new Date() });
});

// Central error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ success: false, error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`Dayflow HRMS API server running on port ${PORT}`);
});