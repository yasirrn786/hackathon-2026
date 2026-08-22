const express = require('express');
const router = express.Router();
const {
  applyLeave,
  getMyLeaves,
  getAllLeaves,
  updateLeaveStatus
} = require('../controllers/leaveController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.post('/', authenticateToken, applyLeave);
router.get('/my', authenticateToken, getMyLeaves);
router.get('/', authenticateToken, requireRole(['ADMIN', 'HR']), getAllLeaves);
router.patch('/:id/status', authenticateToken, requireRole(['ADMIN', 'HR']), updateLeaveStatus);

module.exports = router;
