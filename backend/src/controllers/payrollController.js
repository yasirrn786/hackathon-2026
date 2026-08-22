const pool = require('../db');

/**
 * Calculate payroll breakdown from annual CTC and attendance
 */
function calculateBreakdown(annualCtc, presentDays, workingDays = 26) {
  const monthlyCtc = annualCtc / 12;
  const basicSalary = monthlyCtc * 0.50;
  const hra = basicSalary * 0.50;
  const providentFund = basicSalary * 0.12;
  const professionalTax = 200.00;
  const fixedAllowance = monthlyCtc - (basicSalary + hra + providentFund + professionalTax);
  const grossSalary = basicSalary + hra + fixedAllowance;

  const lopDays = Math.max(0, workingDays - presentDays);
  const lopDeduction = lopDays > 0 ? (grossSalary / workingDays) * lopDays : 0;
  const totalDeductions = providentFund + professionalTax + lopDeduction;
  const netSalary = grossSalary - totalDeductions;

  return {
    monthlyCtc: +monthlyCtc.toFixed(2),
    basicSalary: +basicSalary.toFixed(2),
    hra: +hra.toFixed(2),
    providentFund: +providentFund.toFixed(2),
    professionalTax: +professionalTax.toFixed(2),
    fixedAllowance: +fixedAllowance.toFixed(2),
    grossSalary: +grossSalary.toFixed(2),
    lopDays: +lopDays.toFixed(1),
    lopDeduction: +lopDeduction.toFixed(2),
    totalDeductions: +totalDeductions.toFixed(2),
    netSalary: +netSalary.toFixed(2)
  };
}

/**
 * GET /api/payroll/summary/:month/:year - Admin: get all employees' payroll for month
 */
async function getPayrollSummary(req, res) {
  try {
    const { month, year } = req.params;

    // Get all active employees with their salary and attendance for the month
    const result = await pool.query(`
      SELECT 
        e.id as employee_id,
        e.first_name, e.last_name, e.job_position, e.department, e.avatar_url,
        u.login_id,
        s.annual_ctc,
        COALESCE(
          (SELECT COUNT(*) FROM attendance a 
           WHERE a.employee_id = e.id 
           AND EXTRACT(MONTH FROM a.date) = $1 
           AND EXTRACT(YEAR FROM a.date) = $2
           AND a.status IN ('PRESENT', 'HALF_DAY')), 0
        ) as present_days,
        COALESCE(
          (SELECT SUM(a.extra_hours) FROM attendance a
           WHERE a.employee_id = e.id
           AND EXTRACT(MONTH FROM a.date) = $1
           AND EXTRACT(YEAR FROM a.date) = $2), 0
        ) as total_overtime_hours,
        p.id as payroll_id,
        p.status as payroll_status,
        p.net_salary as processed_net_salary
      FROM employees e
      JOIN users u ON u.id = e.user_id
      LEFT JOIN salaries s ON s.employee_id = e.id
      LEFT JOIN payroll p ON p.employee_id = e.id AND p.month = $1 AND p.year = $2
      WHERE e.status = 'ACTIVE'
      ORDER BY e.first_name
    `, [parseInt(month), parseInt(year)]);

    const payrollData = result.rows.map(emp => {
      const ctc = parseFloat(emp.annual_ctc) || 60000;
      const presentDays = parseInt(emp.present_days) || 0;
      const breakdown = calculateBreakdown(ctc, presentDays);

      return {
        employeeId: emp.employee_id,
        name: `${emp.first_name} ${emp.last_name}`,
        loginId: emp.login_id,
        jobPosition: emp.job_position,
        department: emp.department,
        avatarUrl: emp.avatar_url,
        annualCtc: ctc,
        presentDays,
        overtimeHours: parseFloat(emp.total_overtime_hours) || 0,
        payrollId: emp.payroll_id,
        payrollStatus: emp.payroll_status || 'DRAFT',
        ...breakdown
      };
    });

    res.json({
      success: true,
      month: parseInt(month),
      year: parseInt(year),
      totalEmployees: payrollData.length,
      totalNetPayout: payrollData.reduce((sum, e) => sum + e.netSalary, 0).toFixed(2),
      payroll: payrollData
    });
  } catch (err) {
    console.error('getPayrollSummary error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * POST /api/payroll/process - Admin: process/finalize payroll for month
 */
async function processPayroll(req, res) {
  try {
    const { month, year, workingDays = 26 } = req.body;
    const processedBy = req.user.id;

    if (!month || !year) {
      return res.status(400).json({ success: false, error: 'Month and year are required.' });
    }

    // Get all active employees
    const empResult = await pool.query(`
      SELECT e.id, s.annual_ctc,
        COALESCE((
          SELECT COUNT(*) FROM attendance a 
          WHERE a.employee_id = e.id 
          AND EXTRACT(MONTH FROM a.date) = $1 
          AND EXTRACT(YEAR FROM a.date) = $2
          AND a.status IN ('PRESENT', 'HALF_DAY')
        ), 0) as present_days
      FROM employees e
      LEFT JOIN salaries s ON s.employee_id = e.id
      WHERE e.status = 'ACTIVE'
    `, [month, year]);

    let processed = 0;
    for (const emp of empResult.rows) {
      const ctc = parseFloat(emp.annual_ctc) || 60000;
      const presentDays = parseInt(emp.present_days) || 0;
      const bd = calculateBreakdown(ctc, presentDays, workingDays);

      await pool.query(`
        INSERT INTO payroll (employee_id, month, year, working_days, present_days, 
          loss_of_pay_days, gross_salary, deductions, net_salary, status, processed_by, processed_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PROCESSED', $10, CURRENT_TIMESTAMP)
        ON CONFLICT (employee_id, month, year) 
        DO UPDATE SET
          present_days = EXCLUDED.present_days,
          loss_of_pay_days = EXCLUDED.loss_of_pay_days,
          gross_salary = EXCLUDED.gross_salary,
          deductions = EXCLUDED.deductions,
          net_salary = EXCLUDED.net_salary,
          status = 'PROCESSED',
          processed_by = EXCLUDED.processed_by,
          processed_at = CURRENT_TIMESTAMP
      `, [
        emp.id, month, year, workingDays, presentDays,
        bd.lopDays, bd.grossSalary, bd.totalDeductions, bd.netSalary,
        processedBy
      ]);
      processed++;
    }

    res.json({
      success: true,
      message: `Payroll processed for ${processed} employees for ${month}/${year}`,
      processed
    });
  } catch (err) {
    console.error('processPayroll error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * GET /api/payroll/me/:month/:year - Employee: get own payslip
 */
async function getMyPayslip(req, res) {
  try {
    const { month, year } = req.params;
    const employeeId = req.user.employee_id;

    if (!employeeId) {
      return res.status(400).json({ success: false, error: 'Employee record not found.' });
    }

    // Get employee details and salary
    const empResult = await pool.query(`
      SELECT e.*, u.login_id, u.email as user_email,
        s.annual_ctc, s.basic_salary, s.hra, s.provident_fund, 
        s.professional_tax, s.fixed_allowance, s.net_monthly_take_home
      FROM employees e
      JOIN users u ON u.id = e.user_id
      LEFT JOIN salaries s ON s.employee_id = e.id
      WHERE e.id = $1
    `, [employeeId]);

    if (empResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Employee not found.' });
    }

    const emp = empResult.rows[0];

    // Get attendance for the month
    const attResult = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'PRESENT') as present_days,
        COUNT(*) FILTER (WHERE status = 'ABSENT') as absent_days,
        COUNT(*) FILTER (WHERE status = 'HALF_DAY') as half_days,
        COALESCE(SUM(extra_hours), 0) as overtime_hours,
        COALESCE(SUM(work_hours), 0) as total_work_hours
      FROM attendance 
      WHERE employee_id = $1
        AND EXTRACT(MONTH FROM date) = $2
        AND EXTRACT(YEAR FROM date) = $3
    `, [employeeId, parseInt(month), parseInt(year)]);

    const att = attResult.rows[0];
    const presentDays = parseInt(att.present_days) || 0;
    const ctc = parseFloat(emp.annual_ctc) || 60000;
    const breakdown = calculateBreakdown(ctc, presentDays);

    res.json({
      success: true,
      payslip: {
        employee: {
          id: emp.id,
          loginId: emp.login_id,
          name: `${emp.first_name} ${emp.last_name}`,
          email: emp.email || emp.user_email,
          phone: emp.phone,
          jobPosition: emp.job_position,
          department: emp.department,
          location: emp.location,
          dateOfJoining: emp.date_of_joining,
          avatarUrl: emp.avatar_url
        },
        period: {
          month: parseInt(month),
          year: parseInt(year),
          monthName: new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long' })
        },
        attendance: {
          workingDays: 26,
          presentDays,
          absentDays: parseInt(att.absent_days) || 0,
          halfDays: parseInt(att.half_days) || 0,
          overtimeHours: parseFloat(att.overtime_hours) || 0,
          totalWorkHours: parseFloat(att.total_work_hours) || 0
        },
        salary: {
          annualCtc: ctc,
          ...breakdown
        }
      }
    });
  } catch (err) {
    console.error('getMyPayslip error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * GET /api/payroll/slip/:employeeId/:month/:year - Admin: get any employee's payslip
 */
async function getEmployeePayslip(req, res) {
  try {
    const { employeeId, month, year } = req.params;

    // Reuse logic by substituting employee
    req.user.employee_id = parseInt(employeeId);
    req.params.month = month;
    req.params.year = year;
    return getMyPayslip(req, res);
  } catch (err) {
    console.error('getEmployeePayslip error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  getPayrollSummary,
  processPayroll,
  getMyPayslip,
  getEmployeePayslip
};
