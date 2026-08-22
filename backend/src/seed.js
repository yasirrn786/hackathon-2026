const pool = require('./db');
const bcrypt = require('bcryptjs');

async function seed() {
  console.log('Starting Dayflow database seeding...');

  try {
    // Ensure all tables and columns exist
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

      ALTER TABLE employees ADD COLUMN IF NOT EXISTS email VARCHAR(100);
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS department VARCHAR(100) DEFAULT 'General';
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'ACTIVE';
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80';
      ALTER TABLE employees ALTER COLUMN date_of_birth DROP NOT NULL;
      ALTER TABLE employees ALTER COLUMN phone DROP NOT NULL;

      -- Clean tables for fresh demo seed
      TRUNCATE TABLE leave_requests, attendance, salaries, employees, users RESTART IDENTITY CASCADE;
    `);

    const salt = await bcrypt.genSalt(10);
    const adminPass = await bcrypt.hash('admin123', salt);
    const userPass = await bcrypt.hash('password123', salt);

    // 1. Insert Admin (Alex Morgan)
    const adminUser = await pool.query(
      `INSERT INTO users (login_id, email, password_hash, role, must_change_password)
       VALUES ('ADM-2026-001', 'alex.morgan@dayflow.com', $1, 'ADMIN', FALSE) RETURNING id`,
      [adminPass]
    );

    await pool.query(
      `INSERT INTO employees (user_id, first_name, last_name, email, phone, job_position, department, location, status, avatar_url, date_of_joining, date_of_birth)
       VALUES ($1, 'Alex', 'Morgan', 'alex.morgan@dayflow.com', '+1 (555) 234-5678', 'HR Administrator', 'Human Resources', 'Headquarters', 'ACTIVE', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=150&q=80', '2023-01-15', '1990-05-12')`,
      [adminUser.rows[0].id]
    );

    // 2. Insert Main Demo Employee (Marcus Thompson)
    const marcusUser = await pool.query(
      `INSERT INTO users (login_id, email, password_hash, role, must_change_password)
       VALUES ('EMP-8842', 'marcus.t@dayflow.com', $1, 'EMPLOYEE', FALSE) RETURNING id`,
      [userPass]
    );

    const marcusEmp = await pool.query(
      `INSERT INTO employees (user_id, first_name, last_name, email, phone, job_position, department, location, status, avatar_url, date_of_joining, date_of_birth)
       VALUES ($1, 'Marcus', 'Thompson', 'marcus.t@dayflow.com', '+1 (555) 345-6789', 'Product Designer', 'Design', 'San Francisco, CA', 'ACTIVE', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80', '2024-03-01', '1994-08-20') RETURNING id`,
      [marcusUser.rows[0].id]
    );

    // 3. Insert Additional Team Members
    const team = [
      { first: 'Sophia', last: 'Chen', email: 'sophia.c@dayflow.com', phone: '+1 (555) 456-7890', loginId: 'EMP-001', role: 'Senior Engineer', dept: 'Engineering', img: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=80&q=80' },
      { first: 'James', last: 'Wilson', email: 'james.w@dayflow.com', phone: '+1 (555) 567-8901', loginId: 'EMP-002', role: 'UI Designer', dept: 'Design', img: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=80&q=80' },
      { first: 'Amara', last: 'Okafor', email: 'amara.o@dayflow.com', phone: '+1 (555) 678-9012', loginId: 'EMP-003', role: 'HR Specialist', dept: 'Human Resources', img: 'https://images.unsplash.com/photo-1633332755192-727a05c4013d?auto=format&fit=crop&w=80&q=80' },
      { first: 'Liam', last: 'Davies', email: 'liam.d@dayflow.com', phone: '+1 (555) 789-0123', loginId: 'EMP-004', role: 'Backend Lead', dept: 'Engineering', img: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&q=80' },
      { first: 'Elena', last: 'Rossi', email: 'elena.r@dayflow.com', phone: '+1 (555) 890-1234', loginId: 'EMP-005', role: 'Product Manager', dept: 'Product', img: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=80&q=80' }
    ];

    const teamEmpIds = [];
    for (const member of team) {
      const uRes = await pool.query(
        `INSERT INTO users (login_id, email, password_hash, role, must_change_password)
         VALUES ($1, $2, $3, 'EMPLOYEE', FALSE) RETURNING id`,
        [member.loginId, member.email, userPass]
      );
      const eRes = await pool.query(
        `INSERT INTO employees (user_id, first_name, last_name, email, phone, job_position, department, location, status, avatar_url, date_of_joining, date_of_birth)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'Office', 'ACTIVE', $8, '2024-01-10', '1996-02-14') RETURNING id`,
        [uRes.rows[0].id, member.first, member.last, member.email, member.phone, member.role, member.dept, member.img]
      );
      teamEmpIds.push(eRes.rows[0].id);
    }

    // 4. Seed Attendance Records for Today
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    
    // Marcus clocked in today at 08:52 AM
    const checkInMarcus = new Date(now);
    checkInMarcus.setHours(8, 52, 14, 0);

    await pool.query(
      `INSERT INTO attendance (employee_id, date, check_in_time, status)
       VALUES ($1, $2, $3, 'PRESENT')`,
      [marcusEmp.rows[0].id, today, checkInMarcus]
    );

    // Sophia & Liam clocked in
    if (teamEmpIds.length >= 4) {
      const in1 = new Date(now); in1.setHours(8, 45, 0, 0);
      const in2 = new Date(now); in2.setHours(8, 30, 0, 0);
      await pool.query(`INSERT INTO attendance (employee_id, date, check_in_time, status) VALUES ($1, $2, $3, 'PRESENT')`, [teamEmpIds[0], today, in1]);
      await pool.query(`INSERT INTO attendance (employee_id, date, check_in_time, status) VALUES ($1, $2, $3, 'PRESENT')`, [teamEmpIds[3], today, in2]);
    }

    // 5. Seed Leave Requests
    await pool.query(
      `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, days_count, reason, status)
       VALUES 
       ($1, 'Casual Leave', '2026-09-14', '2026-09-15', 2.0, 'Family event arrangement', 'PENDING'),
       ($1, 'Sick Leave', '2026-08-10', '2026-08-11', 1.0, 'Dental clinical checkup', 'APPROVED')`,
      [marcusEmp.rows[0].id]
    );

    if (teamEmpIds.length >= 2) {
      await pool.query(
        `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, days_count, reason, status)
         VALUES 
         ($1, 'Annual Leave', '2026-11-05', '2026-11-10', 5.0, 'Annual family holiday vacation', 'PENDING'),
         ($2, 'Casual Leave', '2026-10-31', '2026-10-31', 1.0, 'Personal errand appointment', 'PENDING')`,
        [teamEmpIds[1], teamEmpIds[2]]
      );
    }

    // 6. Seed Salary for Marcus
    await pool.query(
      `INSERT INTO salaries (employee_id, annual_ctc, basic_salary, hra, provident_fund, professional_tax, fixed_allowance, net_monthly_take_home)
       VALUES ($1, 75000.00, 3125.00, 1562.50, 375.00, 200.00, 987.50, 5100.00)`,
      [marcusEmp.rows[0].id]
    );

    console.log('Dayflow demo database seeded successfully!');
    console.log('----------------------------------------------------');
    console.log('Admin Account:    alex.morgan@dayflow.com / admin123 (or ADM-2026-001)');
    console.log('Employee Account: marcus.t@dayflow.com / password123 (or EMP-8842)');
    console.log('----------------------------------------------------');
  } catch (err) {
    console.error('Error during database seed:', err);
  } finally {
    await pool.end();
  }
}

seed();
