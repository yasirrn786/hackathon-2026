const express = require('express');
const router = express.Router();
const { 
  getAllEmployees, 
  getEmployeeById, 
  registerEmployee,
  getAdminStats 
} = require('../controllers/employeeController');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Public or Authenticated routes
router.get('/', authenticateToken, getAllEmployees);
router.get('/stats', authenticateToken, requireRole(['ADMIN', 'HR']), getAdminStats);
router.get('/:id', authenticateToken, getEmployeeById);
router.post('/create-employee', authenticateToken, requireRole(['ADMIN', 'HR']), registerEmployee);

module.exports = router;