const pool = require('../db');

/**
 * Apply for leave (Employee)
 */
async function applyLeave(req, res) {
  try {
    const employeeId = req.user.employee_id;
    if (!employeeId) {
      return res.status(400).json({ success: false, error: 'Employee record not found for this user.' });
    }

    const { leaveType, startDate, endDate, reason } = req.body;

    if (!leaveType || !startDate || !endDate || !reason) {
      return res.status(400).json({ 
        success: false, 
        error: 'Leave type, start date, end date, and reason are required.' 
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (end < start) {
      return res.status(400).json({ 
        success: false, 
        error: 'End date cannot be earlier than start date.' 
      });
    }

    const diffMs = Math.abs(end - start);
    const daysCount = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1;

    const result = await pool.query(
      `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, days_count, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDING') RETURNING *`,
      [employeeId, leaveType, startDate, endDate, daysCount, reason]
    );

    res.status(201).json({
      success: true,
      message: 'Leave request submitted successfully!',
      leaveRequest: result.rows[0]
    });
  } catch (err) {
    console.error('applyLeave error:', err);
    res.status(500).json({ success: false, error: 'Failed to submit leave request: ' + err.message });
  }
}

/**
 * Get leave records for logged-in employee
 */
async function getMyLeaves(req, res) {
  try {
    const employeeId = req.user.employee_id;
    if (!employeeId) {
      return res.status(400).json({ success: false, error: 'Employee record not found.' });
    }

    const result = await pool.query(
      `SELECT * FROM leave_requests WHERE employee_id = $1 ORDER BY created_at DESC`,
      [employeeId]
    );

    // Calculate total approved leave days this year
    const approvedRes = await pool.query(
      `SELECT COALESCE(SUM(days_count), 0) as total_taken 
       FROM leave_requests 
       WHERE employee_id = $1 AND status = 'APPROVED' 
       AND EXTRACT(YEAR FROM start_date) = EXTRACT(YEAR FROM CURRENT_DATE)`,
      [employeeId]
    );

    const totalAllocated = 24.0; // standard annual allowance
    const taken = parseFloat(approvedRes.rows[0].total_taken);
    const balance = Math.max(0, totalAllocated - taken);

    const pendingCount = result.rows.filter(r => r.status === 'PENDING').length;

    res.json({
      success: true,
      leaves: result.rows,
      summary: {
        totalAllocated,
        takenDays: taken,
        remainingBalance: balance,
        pendingCount
      }
    });
  } catch (err) {
    console.error('getMyLeaves error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch leave history.' });
  }
}

/**
 * Get all leave requests (Admin / HR)
 */
async function getAllLeaves(req, res) {
  try {
    const { status } = req.query;
    let query = `
      SELECT lr.*, e.first_name, e.last_name, e.job_position, e.department, e.avatar_url, u.login_id
      FROM leave_requests lr
      JOIN employees e ON e.id = lr.employee_id
      JOIN users u ON u.id = e.user_id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      params.push(status.toUpperCase());
      query += ` AND UPPER(lr.status) = $${params.length}`;
    }

    query += ` ORDER BY CASE WHEN lr.status = 'PENDING' THEN 1 ELSE 2 END, lr.created_at DESC`;

    const result = await pool.query(query, params);

    const formatted = result.rows.map(row => ({
      id: row.id,
      employeeId: row.employee_id,
      name: `${row.first_name} ${row.last_name}`.trim(),
      loginId: row.login_id,
      jobPosition: row.job_position,
      department: row.department,
      avatarUrl: row.avatar_url,
      leaveType: row.leave_type,
      startDate: row.start_date,
      endDate: row.end_date,
      daysCount: row.days_count,
      reason: row.reason,
      status: row.status,
      createdAt: row.created_at
    }));

    res.json({
      success: true,
      count: formatted.length,
      leaves: formatted
    });
  } catch (err) {
    console.error('getAllLeaves error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch leave requests.' });
  }
}

/**
 * Approve or Reject Leave Request (Admin / HR)
 */
async function updateLeaveStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'APPROVED' or 'REJECTED'

    if (!['APPROVED', 'REJECTED'].includes((status || '').toUpperCase())) {
      return res.status(400).json({ 
        success: false, 
        error: "Status must be either 'APPROVED' or 'REJECTED'." 
      });
    }

    const cleanStatus = status.toUpperCase();
    const reviewerId = req.user.user_id;

    const result = await pool.query(
      `UPDATE leave_requests 
       SET status = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP 
       WHERE id = $3 RETURNING *`,
      [cleanStatus, reviewerId, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Leave request not found.' });
    }

    const updatedLeave = result.rows[0];

    // If approved and current date falls within leave window, update employee status to ON_LEAVE
    if (cleanStatus === 'APPROVED') {
      const today = new Date().toISOString().split('T')[0];
      const start = new Date(updatedLeave.start_date).toISOString().split('T')[0];
      const end = new Date(updatedLeave.end_date).toISOString().split('T')[0];

      if (today >= start && today <= end) {
        await pool.query(
          `UPDATE employees SET status = 'ON_LEAVE' WHERE id = $1`,
          [updatedLeave.employee_id]
        );
      }
    }

    res.json({
      success: true,
      message: `Leave request ${cleanStatus.toLowerCase()} successfully!`,
      leaveRequest: updatedLeave
    });
  } catch (err) {
    console.error('updateLeaveStatus error:', err);
    res.status(500).json({ success: false, error: 'Failed to update leave status.' });
  }
}

module.exports = {
  applyLeave,
  getMyLeaves,
  getAllLeaves,
  updateLeaveStatus
};
