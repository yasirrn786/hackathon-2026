const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const {
  getAttendanceTrends,
  getLeaveStats,
  getDepartmentStats,
  getOvertimeStats
} = require('../controllers/analyticsController');

router.get('/attendance-trends', authenticateToken, requireRole(['ADMIN', 'HR']), getAttendanceTrends);
router.get('/leave-stats', authenticateToken, requireRole(['ADMIN', 'HR']), getLeaveStats);
router.get('/department-stats', authenticateToken, requireRole(['ADMIN', 'HR']), getDepartmentStats);
router.get('/overtime-stats', authenticateToken, requireRole(['ADMIN', 'HR']), getOvertimeStats);

module.exports = router;
