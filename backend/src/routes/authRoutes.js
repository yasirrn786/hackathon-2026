const express = require('express');
const router = express.Router();
const { signin, getMe, changePassword } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');

// No public signup route: accounts are created by HR/Admin only, via
// POST /api/employees/create-employee. See authController.js for details.
router.post('/signin', authLimiter, signin);
router.get('/me', authenticateToken, getMe);
router.post('/change-password', authenticateToken, changePassword);

module.exports = router;