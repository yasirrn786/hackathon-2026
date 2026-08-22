const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const {
  getPayrollSummary,
  processPayroll,
  getMyPayslip,
  getEmployeePayslip
} = require('../controllers/payrollController');

// Employee: view own payslip
router.get('/me/:month/:year', authenticateToken, getMyPayslip);

// Admin/HR: view any employee's payslip
router.get('/slip/:employeeId/:month/:year', authenticateToken, requireRole(['ADMIN', 'HR']), getEmployeePayslip);

// Admin/HR: get full payroll summary for a month
router.get('/summary/:month/:year', authenticateToken, requireRole(['ADMIN', 'HR']), getPayrollSummary);

// Admin/HR: process/finalize payroll
router.post('/process', authenticateToken, requireRole(['ADMIN', 'HR']), processPayroll);

module.exports = router;
