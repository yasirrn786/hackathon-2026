const pool = require('../db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

/**
 * Generates the automatic Login ID: OI + first2 first + first2 last + year + serial
 */
async function generateLoginId(firstName = 'EM', lastName = 'PL', joiningDate = new Date()) {
  const companyPrefix = 'OI';
  const cleanFirst = (firstName.replace(/[^a-zA-Z]/g, '') || 'EM').padEnd(2, 'X');
  const cleanLast = (lastName.replace(/[^a-zA-Z]/g, '') || 'PL').padEnd(2, 'X');
  
  const firstTwoFirst = cleanFirst.substring(0, 2).toUpperCase();
  const firstTwoLast = cleanLast.substring(0, 2).toUpperCase();
  
  const dateObj = new Date(joiningDate);
  const year = isNaN(dateObj.getFullYear()) ? new Date().getFullYear().toString() : dateObj.getFullYear().toString();

  const startOfYear = `${year}-01-01`;
  const endOfYear = `${year}-12-31`;

  // Count how many employees joined this year
  const countQuery = await pool.query(
    `SELECT COUNT(*) FROM employees WHERE date_of_joining BETWEEN $1 AND $2`,
    [startOfYear, endOfYear]
  );

  const serialNumber = (parseInt(countQuery.rows[0].count, 10) + 1).toString().padStart(4, '0');
  return `${companyPrefix}${firstTwoFirst}${firstTwoLast}${year}${serialNumber}`;
}

/**
 * Creates an employee profile and user account with automated ID & password generation.
 */
async function createEmployeeAccount(input) {
  const loginId = await generateLoginId(input.firstName, input.lastName, input.dateOfJoining);
  
  // Generate temporary password (e.g., "a3f8@123")
  const tempPassword = input.password || (crypto.randomBytes(3).toString('hex') + '@2026');
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(tempPassword, salt);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Insert into users table
    const userResult = await client.query(
      `INSERT INTO users (login_id, email, password_hash, role, must_change_password) 
       VALUES ($1, $2, $3, $4, TRUE) RETURNING id, login_id, email, role`,
      [loginId, input.email, passwordHash, (input.role || 'EMPLOYEE').toUpperCase()]
    );
    const userId = userResult.rows[0].id;

    // 2. Insert into employees table
    const employeeResult = await client.query(
      `INSERT INTO employees (
        user_id, first_name, last_name, email, phone, job_position, department, location, 
        date_of_joining, date_of_birth, status, avatar_url
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [
        userId, 
        input.firstName, 
        input.lastName, 
        input.email,
        input.phone || '', 
        input.jobPosition || 'Employee', 
        input.department || 'General',
        input.location || 'Remote', 
        input.dateOfJoining || new Date().toISOString().split('T')[0], 
        input.dateOfBirth || '1995-01-01',
        input.status || 'ACTIVE',
        input.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80'
      ]
    );

    // 3. Optional: Insert initial salary if annualCtc is passed
    if (input.annualCtc) {
      const annualCtc = parseFloat(input.annualCtc);
      const monthlyCtc = annualCtc / 12;
      const basicSalary = monthlyCtc * 0.50;
      const hra = basicSalary * 0.50;
      const providentFund = basicSalary * 0.12;
      const professionalTax = 200.00;
      const fixedAllowance = monthlyCtc - (basicSalary + hra + providentFund + professionalTax);
      const netMonthlyTakeHome = (basicSalary + hra + fixedAllowance) - (providentFund + professionalTax);

      await client.query(
        `INSERT INTO salaries (employee_id, annual_ctc, basic_salary, hra, provident_fund, professional_tax, fixed_allowance, net_monthly_take_home)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          employeeResult.rows[0].id,
          annualCtc.toFixed(2),
          basicSalary.toFixed(2),
          hra.toFixed(2),
          providentFund.toFixed(2),
          professionalTax.toFixed(2),
          fixedAllowance.toFixed(2),
          netMonthlyTakeHome.toFixed(2)
        ]
      );
    }

    await client.query('COMMIT');
    return { user: userResult.rows[0], employee: employeeResult.rows[0], tempPassword, loginId };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  generateLoginId,
  createEmployeeAccount,
};