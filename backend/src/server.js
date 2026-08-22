const express = require('express');
const cors = require('cors');
require('dotenv').config();
const pool = require('./db');

const authRoutes = require('./routes/authRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const leaveRoutes = require('./routes/leaveRoutes');
const { authenticateToken, requireRole } = require('./middleware/auth');

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
        email VARCHAR(100) NOT NULL,
        phone VARCHAR(20) DEFAULT '',
        job_position VARCHAR(100) NOT NULL,
        department VARCHAR(100) DEFAULT 'General',
        location VARCHAR(100) DEFAULT 'Headquarters',
        status VARCHAR(20) DEFAULT 'ACTIVE',
        avatar_url TEXT DEFAULT 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
        date_of_joining DATE DEFAULT CURRENT_DATE,
        date_of_birth DATE DEFAULT '1995-01-01',
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

      CREATE TABLE IF NOT EXISTS leave_requests (
        id SERIAL PRIMARY KEY,
        employee_id INT REFERENCES employees(id) ON DELETE CASCADE,
        leave_type VARCHAR(50) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        days_count DECIMAL(4,1) DEFAULT 1.0,
        reason TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'PENDING',
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

      -- Migration additions for existing tables
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS email VARCHAR(100);
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS department VARCHAR(100) DEFAULT 'General';
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'ACTIVE';
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80';
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

// Salary calculation endpoint
app.post('/api/salary/calculate', authenticateToken, requireRole(['ADMIN', 'HR']), async (req, res) => {
  try {
    const { employeeId, annualCtc } = req.body;

    if (!employeeId || !annualCtc) {
      return res.status(400).json({ success: false, error: 'Employee ID and Annual CTC are required.' });
    }

    const ctc = parseFloat(annualCtc);
    const monthlyCtc = ctc / 12;
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
        ctc.toFixed(2), 
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
      message: 'Salary structure calculated and saved successfully!',
      breakdown: {
        annualCtc: ctc.toFixed(2),
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
    console.error('Salary calculation error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Root & Health check endpoints
app.get('/', (req, res) => {
  res.json({ message: 'Dayflow HRMS API is running', version: '2.0.0' });
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