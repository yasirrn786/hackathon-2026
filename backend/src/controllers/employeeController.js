const pool = require('../db');
const { createEmployeeAccount } = require('../services/employeeService');

/**
 * List all employees with search & filtering
 */
async function getAllEmployees(req, res) {
  try {
    const { search, department, status } = req.query;
    let query = `
      SELECT e.id, e.user_id, e.first_name, e.last_name, e.email, e.phone,
             e.job_position, e.department, e.location, e.status, e.avatar_url,
             e.date_of_joining, e.date_of_birth, u.login_id, u.role
      FROM employees e
      JOIN users u ON u.id = e.user_id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (
        LOWER(e.first_name) LIKE LOWER($${params.length}) OR 
        LOWER(e.last_name) LIKE LOWER($${params.length}) OR 
        LOWER(e.email) LIKE LOWER($${params.length}) OR 
        LOWER(e.job_position) LIKE LOWER($${params.length}) OR 
        LOWER(e.department) LIKE LOWER($${params.length}) OR 
        LOWER(u.login_id) LIKE LOWER($${params.length})
      )`;
    }

    if (department) {
      params.push(department);
      query += ` AND LOWER(e.department) = LOWER($${params.length})`;
    }

    if (status) {
      params.push(status);
      query += ` AND UPPER(e.status) = UPPER($${params.length})`;
    }

    query += ` ORDER BY e.id ASC`;

    const result = await pool.query(query, params);
    
    // Format output
    const employees = result.rows.map(emp => ({
      id: emp.id,
      userId: emp.user_id,
      loginId: emp.login_id,
      name: `${emp.first_name} ${emp.last_name}`.trim(),
      firstName: emp.first_name,
      lastName: emp.last_name,
      email: emp.email,
      phone: emp.phone,
      jobPosition: emp.job_position,
      department: emp.department,
      location: emp.location,
      status: emp.status,
      role: emp.role,
      avatarUrl: emp.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=80&q=80',
      dateOfJoining: emp.date_of_joining,
      dateOfBirth: emp.date_of_birth
    }));

    return res.json({
      success: true,
      count: employees.length,
      employees
    });
  } catch (error) {
    console.error('Error fetching employees:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch employees.' });
  }
}

/**
 * Get employee by ID.
 *
 * Access rules:
 * - ADMIN / HR can view any employee's profile.
 * - EMPLOYEE can only view their OWN profile (matched against
 *   req.user.employee_id from the verified token, never trusted from the
 *   URL alone).
 * - Salary data is never returned from this generic profile endpoint,
 *   regardless of role, to avoid leaking it through a route that wasn't
 *   designed to be salary-access-controlled. Salary/payroll has its own
 *   dedicated, permission-checked endpoints.
 */
async function getEmployeeById(req, res) {
  try {
    const { id } = req.params;
    const requestedId = parseInt(id, 10);
    const requesterRole = (req.user.role || '').toUpperCase();
    const isHrOrAdmin = requesterRole === 'ADMIN' || requesterRole === 'HR';

    if (!isHrOrAdmin && req.user.employee_id !== requestedId) {
      return res.status(403).json({
        success: false,
        error: "You don't have permission to view this employee's profile."
      });
    }

    const result = await pool.query(
      `SELECT e.id, e.user_id, e.first_name, e.last_name, e.email, e.phone,
              e.job_position, e.department, e.location, e.status, e.avatar_url,
              e.date_of_joining, e.date_of_birth, u.login_id, u.role
       FROM employees e
       JOIN users u ON u.id = e.user_id
       WHERE e.id = $1`,
      [requestedId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Employee not found.' });
    }

    return res.json({ success: true, employee: result.rows[0] });
  } catch (error) {
    console.error('Error fetching employee:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch employee details.' });
  }
}

/**
 * Register new employee with automated ID and password
 */
async function registerEmployee(req, res) {
  try {
    const { 
      firstName, 
      lastName, 
      email, 
      phone, 
      jobPosition, 
      department,
      location, 
      dateOfJoining, 
      dateOfBirth, 
      role,
      annualCtc,
      avatarUrl
    } = req.body;

    if (!firstName || !lastName || !email) {
      return res.status(400).json({ 
        success: false, 
        error: 'First name, last name, and email are required.' 
      });
    }

    // Check if email already exists
    const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'An account with this email already exists.' 
      });
    }

    const result = await createEmployeeAccount({
      firstName,
      lastName,
      email,
      phone,
      jobPosition: jobPosition || 'Staff Member',
      department: department || 'General',
      location: location || 'Headquarters',
      dateOfJoining: dateOfJoining || new Date().toISOString().split('T')[0],
      dateOfBirth: dateOfBirth || '1995-01-01',
      role: role || 'EMPLOYEE',
      annualCtc: annualCtc ? parseFloat(annualCtc) : null,
      avatarUrl
    });

    return res.status(201).json({
      success: true,
      message: 'Employee account created successfully!',
      loginId: result.loginId,
      tempPassword: result.tempPassword,
      employee: {
        id: result.employee.id,
        name: `${result.employee.first_name} ${result.employee.last_name}`,
        loginId: result.loginId,
        email: result.employee.email,
        jobPosition: result.employee.job_position,
        department: result.employee.department,
        status: result.employee.status
      }
    });
  } catch (error) {
    console.error('Error creating employee:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Server error while creating employee account: ' + error.message 
    });
  }
}

/**
 * Get dashboard statistics for Admin Hub
 */
async function getAdminStats(req, res) {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Total headcount
    const countRes = await pool.query(`SELECT COUNT(*) FROM employees WHERE status != 'INACTIVE'`);
    const totalHeadcount = parseInt(countRes.rows[0].count, 10);

    // Present today
    const presentRes = await pool.query(
      `SELECT COUNT(*) FROM attendance WHERE date = $1 AND status = 'PRESENT'`,
      [today]
    );
    const presentToday = parseInt(presentRes.rows[0].count, 10);

    // Pending leaves
    const leavesRes = await pool.query(
      `SELECT COUNT(*) FROM leave_requests WHERE status = 'PENDING'`
    );
    const pendingLeaves = parseInt(leavesRes.rows[0].count, 10);

    // Department breakdown
    const deptRes = await pool.query(
      `SELECT department, COUNT(*) as count FROM employees GROUP BY department`
    );

    res.json({
      success: true,
      stats: {
        totalHeadcount,
        presentToday,
        attendanceRate: totalHeadcount > 0 ? ((presentToday / totalHeadcount) * 100).toFixed(1) : '0.0',
        pendingLeaves,
        departments: deptRes.rows
      }
    });
  } catch (error) {
    console.error('Error getting admin stats:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve admin stats.' });
  }
}

module.exports = {
  getAllEmployees,
  getEmployeeById,
  registerEmployee,
  getAdminStats
};