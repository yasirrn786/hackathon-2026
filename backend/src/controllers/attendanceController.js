const pool = require('../db');
const { createNotification, notifyAdmins } = require('./notificationController');

/**
 * Get attendance status for today for logged in user
 */
async function getTodayAttendance(req, res) {
  try {
    const employeeId = req.user.employee_id;
    if (!employeeId) {
      return res.status(400).json({ success: false, error: 'Employee record not found for this user.' });
    }

    const today = new Date().toISOString().split('T')[0];
    const result = await pool.query(
      `SELECT * FROM attendance WHERE employee_id = $1 AND date = $2`,
      [employeeId, today]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        attendance: {
          isClockedIn: false,
          checkInTime: null,
          checkOutTime: null,
          workHours: '0.00',
          status: 'NOT_CHECKED_IN'
        }
      });
    }

    const record = result.rows[0];
    const isClockedIn = record.check_in_time !== null && record.check_out_time === null;

    res.json({
      success: true,
      attendance: {
        id: record.id,
        isClockedIn,
        checkInTime: record.check_in_time,
        checkOutTime: record.check_out_time,
        workHours: record.work_hours || '0.00',
        extraHours: record.extra_hours || '0.00',
        status: record.status
      }
    });
  } catch (err) {
    console.error('getTodayAttendance error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch attendance.' });
  }
}

/**
 * Clock In for today
 */
async function checkIn(req, res) {
  try {
    const employeeId = req.user.employee_id || req.body.employeeId;
    if (!employeeId) {
      return res.status(400).json({ success: false, error: 'Employee ID is required.' });
    }

    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    const existing = await pool.query(
      `SELECT * FROM attendance WHERE employee_id = $1 AND date = $2`,
      [employeeId, today]
    );

    if (existing.rows.length > 0 && existing.rows[0].check_in_time) {
      return res.status(400).json({ 
        success: false, 
        error: 'You have already checked in today at ' + new Date(existing.rows[0].check_in_time).toLocaleTimeString() 
      });
    }

    let result;
    if (existing.rows.length > 0) {
      result = await pool.query(
        `UPDATE attendance SET check_in_time = $1, status = 'PRESENT' 
         WHERE employee_id = $2 AND date = $3 RETURNING *`,
        [now, employeeId, today]
      );
    } else {
      result = await pool.query(
        `INSERT INTO attendance (employee_id, date, check_in_time, status) 
         VALUES ($1, $2, $3, 'PRESENT') RETURNING *`,
        [employeeId, today, now]
      );
    }

    // Check for late check-in (after 09:30 AM)
    const lateThreshold = new Date(now);
    lateThreshold.setHours(9, 30, 0, 0);

    if (now > lateThreshold) {
      const checkInTimeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      // Get employee user_id and name
      const empData = await pool.query(
        `SELECT u.id as user_id, e.first_name, e.last_name FROM employees e 
         JOIN users u ON u.id = e.user_id WHERE e.id = $1`, [employeeId]
      );
      if (empData.rows.length > 0) {
        const { user_id, first_name, last_name } = empData.rows[0];
        const empName = `${first_name} ${last_name}`;
        // Notify the employee
        await createNotification(
          user_id,
          'LATE_ATTENDANCE',
          '⚠️ Late Check-In Recorded',
          `Your check-in at ${checkInTimeStr} is after the standard 9:30 AM. This has been noted.`,
          result.rows[0].id
        );
        // Notify admins
        await notifyAdmins(
          'LATE_ATTENDANCE',
          '⏰ Late Attendance Alert',
          `${empName} checked in late at ${checkInTimeStr} today.`,
          result.rows[0].id
        );
      }
    }

    res.json({
      success: true,
      message: 'Clocked in successfully!',
      attendance: {
        isClockedIn: true,
        checkInTime: result.rows[0].check_in_time,
        status: 'PRESENT'
      }
    });
  } catch (err) {
    console.error('checkIn error:', err);
    res.status(500).json({ success: false, error: 'Check-in failed: ' + err.message });
  }
}


/**
 * Clock Out for today
 */
async function checkOut(req, res) {
  try {
    const employeeId = req.user.employee_id || req.body.employeeId;
    if (!employeeId) {
      return res.status(400).json({ success: false, error: 'Employee ID is required.' });
    }

    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    const existing = await pool.query(
      `SELECT * FROM attendance WHERE employee_id = $1 AND date = $2`,
      [employeeId, today]
    );

    if (existing.rows.length === 0 || !existing.rows[0].check_in_time) {
      return res.status(400).json({ success: false, error: 'You have not checked in yet today!' });
    }

    if (existing.rows[0].check_out_time) {
      return res.status(400).json({ 
        success: false, 
        error: 'You have already clocked out today at ' + new Date(existing.rows[0].check_out_time).toLocaleTimeString() 
      });
    }

    const checkInTime = new Date(existing.rows[0].check_in_time);
    const diffMs = Math.max(0, now - checkInTime);
    const workHours = (diffMs / (1000 * 60 * 60)).toFixed(2);
    const extraHours = parseFloat(workHours) > 8 ? (parseFloat(workHours) - 8).toFixed(2) : '0.00';

    const result = await pool.query(
      `UPDATE attendance 
       SET check_out_time = $1, work_hours = $2, extra_hours = $3 
       WHERE employee_id = $4 AND date = $5 RETURNING *`,
      [now, workHours, extraHours, employeeId, today]
    );

    res.json({
      success: true,
      message: 'Clocked out successfully!',
      attendance: {
        isClockedIn: false,
        checkInTime: result.rows[0].check_in_time,
        checkOutTime: result.rows[0].check_out_time,
        workHours: result.rows[0].work_hours,
        extraHours: result.rows[0].extra_hours,
        status: 'SHIFT_COMPLETED'
      }
    });
  } catch (err) {
    console.error('checkOut error:', err);
    res.status(500).json({ success: false, error: 'Check-out failed: ' + err.message });
  }
}

/**
 * Get attendance history for employee
 */
async function getAttendanceHistory(req, res) {
  try {
    const employeeId = req.user.employee_id || req.query.employeeId;
    const result = await pool.query(
      `SELECT * FROM attendance 
       WHERE employee_id = $1 
       ORDER BY date DESC LIMIT 30`,
      [employeeId]
    );

    res.json({
      success: true,
      history: result.rows
    });
  } catch (err) {
    console.error('getAttendanceHistory error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch attendance history.' });
  }
}

/**
 * Get live attendance status for today across all employees (Admin)
 */
async function getLiveAttendance(req, res) {
  try {
    const today = new Date().toISOString().split('T')[0];

    const result = await pool.query(
      `SELECT e.id as employee_id, e.first_name, e.last_name, e.job_position, e.department, e.avatar_url,
              u.login_id,
              a.check_in_time, a.check_out_time, a.work_hours, a.status as attendance_status
       FROM employees e
       JOIN users u ON u.id = e.user_id
       LEFT JOIN attendance a ON a.employee_id = e.id AND a.date = $1
       ORDER BY a.check_in_time DESC NULLS LAST, e.first_name ASC`,
      [today]
    );

    const liveData = result.rows.map(row => {
      let liveStatus = 'ABSENT';
      let checkInFormatted = '--';
      let checkOutFormatted = '--';

      if (row.check_in_time) {
        const inTime = new Date(row.check_in_time);
        checkInFormatted = inTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        // 9:00 AM threshold for On-Time vs Late
        const inHour = inTime.getHours();
        const inMin = inTime.getMinutes();
        const isLate = (inHour > 9) || (inHour === 9 && inMin > 15);

        if (row.check_out_time) {
          liveStatus = 'COMPLETED';
          checkOutFormatted = new Date(row.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else {
          liveStatus = isLate ? 'LATE' : 'ON_TIME';
        }
      }

      return {
        employeeId: row.employee_id,
        loginId: row.login_id,
        name: `${row.first_name} ${row.last_name}`.trim(),
        jobPosition: row.job_position,
        department: row.department,
        avatarUrl: row.avatar_url,
        checkIn: checkInFormatted,
        checkOut: checkOutFormatted,
        workHours: row.work_hours || '0.00',
        liveStatus
      };
    });

    res.json({
      success: true,
      date: today,
      liveAttendance: liveData
    });
  } catch (err) {
    console.error('getLiveAttendance error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch live attendance.' });
  }
}

module.exports = {
  getTodayAttendance,
  checkIn,
  checkOut,
  getAttendanceHistory,
  getLiveAttendance
};
