const pool = require('../db');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

/**
 * Generates the automatic Login ID: OI + first2 first + first2 last + year + serial
 */
async function generateLoginId(firstName, lastName, joiningDate) {
  const companyPrefix = 'OI';
  const firstTwoFirst = firstName.substring(0, 2).toUpperCase();
  const firstTwoLast = lastName.substring(0, 2).toUpperCase();
  const year = new Date(joiningDate).getFullYear().toString();

  const startOfYear = `${year}-01-01`;
  const endOfYear = `${year}-12-31`;

  // Count how many employees joined this year using SQL pool
  const countQuery = await pool.query(
    `SELECT COUNT(*) FROM employees WHERE date_of_joining BETWEEN $1 AND $2`,
    [startOfYear, endOfYear]
  );

  const serialNumber = (parseInt(countQuery.rows[0].count) + 1).toString().padStart(4, '0');
  return `${companyPrefix}${firstTwoFirst}${firstTwoLast}${year}${serialNumber}`;
}

/**
 * Creates an employee profile and user account with automated ID & password generation.
 */
async function createEmployeeAccount(input) {
  const loginId = await generateLoginId(input.firstName, input.lastName, input.dateOfJoining);
  
  // Generate temporary password (e.g., "a3f8@123")
  const tempPassword = crypto.randomBytes(4).toString('hex') + '@123';
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(tempPassword, salt);

  // Use a transaction client from the pool to save both User and Employee safely
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Insert into users table
    const userResult = await client.query(
      `INSERT INTO users (login_id, email, password_hash, role, must_change_password) 
       VALUES ($1, $2, $3, $4, TRUE) RETURNING id, login_id`,
      [loginId, input.email, passwordHash, input.role || 'EMPLOYEE']
    );
    const userId = userResult.rows[0].id;

    // 2. Insert into employees table
    const employeeResult = await client.query(
      `INSERT INTO employees (user_id, first_name, last_name, phone, job_position, location, date_of_joining, date_of_birth) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        userId, 
        input.firstName, 
        input.lastName, 
        input.phone, 
        input.jobPosition, 
        input.location, 
        input.dateOfJoining, 
        input.dateOfBirth
      ]
    );

    await client.query('COMMIT');
    return { user: userResult.rows[0], employee: employeeResult.rows[0], tempPassword };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  createEmployeeAccount,
};