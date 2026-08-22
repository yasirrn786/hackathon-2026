const pool = require('../db');

/**
 * Create a notification for a specific user
 */
async function createNotification(userId, type, title, message, relatedId = null) {
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, related_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, type, title, message, relatedId]
    );
  } catch (err) {
    console.error('createNotification error:', err.message);
  }
}

/**
 * Create notification for all admins and HR
 */
async function notifyAdmins(type, title, message, relatedId = null) {
  try {
    const admins = await pool.query(
      `SELECT id FROM users WHERE role IN ('ADMIN', 'HR')`
    );
    for (const admin of admins.rows) {
      await createNotification(admin.id, type, title, message, relatedId);
    }
  } catch (err) {
    console.error('notifyAdmins error:', err.message);
  }
}

/**
 * GET /api/notifications - Get notifications for logged-in user
 */
async function getNotifications(req, res) {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT * FROM notifications WHERE user_id = $1
       ORDER BY is_read ASC, created_at DESC
       LIMIT 50`,
      [userId]
    );

    const unreadCount = result.rows.filter(n => !n.is_read).length;

    res.json({
      success: true,
      notifications: result.rows,
      unreadCount
    });
  } catch (err) {
    console.error('getNotifications error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch notifications.' });
  }
}

/**
 * PATCH /api/notifications/:id/read - Mark one notification as read
 */
async function markAsRead(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    res.json({ success: true, message: 'Notification marked as read.' });
  } catch (err) {
    console.error('markAsRead error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to mark notification.' });
  }
}

/**
 * PATCH /api/notifications/read-all - Mark all notifications as read
 */
async function markAllAsRead(req, res) {
  try {
    const userId = req.user.id;

    await pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE user_id = $1`,
      [userId]
    );

    res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (err) {
    console.error('markAllAsRead error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to mark all notifications.' });
  }
}

module.exports = {
  createNotification,
  notifyAdmins,
  getNotifications,
  markAsRead,
  markAllAsRead
};
