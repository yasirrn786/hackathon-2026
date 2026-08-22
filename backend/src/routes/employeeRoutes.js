const express = require('express');
const router = express.Router();
const { 
  getAllEmployees, 
  getEmployeeById, 
  registerEmployee,
  getAdminStats 
} = require('../controllers/employeeController');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Employee directory / search is an HR+ capability, not something every
// authenticated employee should be able to browse.
router.get('/', authenticateToken, requireRole(['ADMIN', 'HR']), getAllEmployees);
router.get('/stats', authenticateToken, requireRole(['ADMIN', 'HR']), getAdminStats);
// Individual profile: role/self-access check happens inside the controller,
// since an EMPLOYEE is allowed to fetch their own record by id.
router.get('/:id', authenticateToken, getEmployeeById);
router.post('/create-employee', authenticateToken, requireRole(['ADMIN', 'HR']), registerEmployee);

module.exports = router;