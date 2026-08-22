const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { getNotifications, markAsRead, markAllAsRead } = require('../controllers/notificationController');

router.get('/', authenticateToken, getNotifications);
router.patch('/read-all', authenticateToken, markAllAsRead);
router.patch('/:id/read', authenticateToken, markAsRead);

module.exports = router;
