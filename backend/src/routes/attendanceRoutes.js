const express = require('express');
const router = express.Router();
const {
  getTodayAttendance,
  checkIn,
  checkOut,
  getAttendanceHistory,
  getLiveAttendance
} = require('../controllers/attendanceController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.get('/today', authenticateToken, getTodayAttendance);
router.post('/check-in', authenticateToken, checkIn);
router.post('/check-out', authenticateToken, checkOut);
router.get('/history', authenticateToken, getAttendanceHistory);
router.get('/live', authenticateToken, requireRole(['ADMIN', 'HR']), getLiveAttendance);

module.exports = router;
