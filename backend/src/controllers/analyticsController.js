const pool = require('../db');

/**
 * GET /api/analytics/attendance-trends - Attendance % over last 30 days
 */
async function getAttendanceTrends(req, res) {
  try {
    const result = await pool.query(`
      WITH date_series AS (
        SELECT generate_series(
          CURRENT_DATE - INTERVAL '29 days',
          CURRENT_DATE,
          INTERVAL '1 day'
        )::DATE as date
      ),
      daily_totals AS (
        SELECT 
          a.date,
          COUNT(*) FILTER (WHERE a.status = 'PRESENT') as present,
          COUNT(*) FILTER (WHERE a.status = 'ABSENT') as absent,
          COUNT(*) FILTER (WHERE a.status = 'HALF_DAY') as half_day,
          COUNT(DISTINCT e.id) as total_employees
        FROM date_series ds
        LEFT JOIN attendance a ON a.date = ds.date
        LEFT JOIN employees e ON e.id = a.employee_id AND e.status = 'ACTIVE'
        GROUP BY a.date
      ),
      active_count AS (SELECT COUNT(*) as cnt FROM employees WHERE status = 'ACTIVE')
      SELECT 
        ds.date,
        COALESCE(dt.present, 0) as present,
        COALESCE(dt.absent, 0) as absent,
        COALESCE(dt.half_day, 0) as half_day,
        (SELECT cnt FROM active_count) as total_employees,
        CASE 
          WHEN (SELECT cnt FROM active_count) > 0 
          THEN ROUND((COALESCE(dt.present, 0)::NUMERIC / (SELECT cnt FROM active_count)) * 100, 1)
          ELSE 0 
        END as attendance_pct
      FROM date_series ds
      LEFT JOIN daily_totals dt ON dt.date = ds.date
      ORDER BY ds.date
    `);

    res.json({
      success: true,
      trends: result.rows.map(row => ({
        date: row.date,
        present: parseInt(row.present),
        absent: parseInt(row.absent),
        halfDay: parseInt(row.half_day),
        totalEmployees: parseInt(row.total_employees),
        attendancePct: parseFloat(row.attendance_pct)
      }))
    });
  } catch (err) {
    console.error('getAttendanceTrends error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * GET /api/analytics/leave-stats - Leave breakdown by type and status
 */
async function getLeaveStats(req, res) {
  try {
    const byType = await pool.query(`
      SELECT leave_type, status, COUNT(*) as count, COALESCE(SUM(days_count), 0) as total_days
      FROM leave_requests
      WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE)
      GROUP BY leave_type, status
      ORDER BY leave_type, status
    `);

    const monthly = await pool.query(`
      SELECT 
        EXTRACT(MONTH FROM created_at) as month,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'APPROVED') as approved,
        COUNT(*) FILTER (WHERE status = 'REJECTED') as rejected,
        COUNT(*) FILTER (WHERE status = 'PENDING') as pending
      FROM leave_requests
      WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE)
      GROUP BY EXTRACT(MONTH FROM created_at)
      ORDER BY month
    `);

    const overview = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'APPROVED') as approved,
        COUNT(*) FILTER (WHERE status = 'REJECTED') as rejected,
        COUNT(*) FILTER (WHERE status = 'PENDING') as pending,
        COALESCE(SUM(days_count) FILTER (WHERE status = 'APPROVED'), 0) as total_approved_days
      FROM leave_requests
      WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE)
    `);

    res.json({
      success: true,
      overview: overview.rows[0],
      byType: byType.rows,
      monthly: monthly.rows
    });
  } catch (err) {
    console.error('getLeaveStats error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * GET /api/analytics/department-stats - Per-department headcount, attendance rate, tenure
 */
async function getDepartmentStats(req, res) {
  try {
    const result = await pool.query(`
      SELECT 
        e.department,
        COUNT(DISTINCT e.id) as headcount,
        ROUND(AVG(DATE_PART('day', CURRENT_DATE - e.date_of_joining) / 365.0), 1) as avg_tenure_years,
        ROUND(
          COUNT(a.id) FILTER (WHERE a.status = 'PRESENT' AND a.date >= CURRENT_DATE - INTERVAL '30 days')::NUMERIC
          / NULLIF(COUNT(DISTINCT e.id) * 22, 0) * 100, 1
        ) as attendance_rate_30d,
        COUNT(DISTINCT e.id) FILTER (WHERE e.status = 'ON_LEAVE') as on_leave_count
      FROM employees e
      LEFT JOIN attendance a ON a.employee_id = e.id
      WHERE e.status IN ('ACTIVE', 'ON_LEAVE')
      GROUP BY e.department
      ORDER BY headcount DESC
    `);

    res.json({
      success: true,
      departments: result.rows.map(row => ({
        department: row.department,
        headcount: parseInt(row.headcount),
        avgTenureYears: parseFloat(row.avg_tenure_years) || 0,
        attendanceRate30d: parseFloat(row.attendance_rate_30d) || 0,
        onLeaveCount: parseInt(row.on_leave_count)
      }))
    });
  } catch (err) {
    console.error('getDepartmentStats error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * GET /api/analytics/overtime-stats - Overtime hours by employee this month
 */
async function getOvertimeStats(req, res) {
  try {
    const result = await pool.query(`
      SELECT 
        e.id, e.first_name, e.last_name, e.job_position, e.department, e.avatar_url,
        COALESCE(SUM(a.extra_hours) FILTER (
          WHERE EXTRACT(MONTH FROM a.date) = EXTRACT(MONTH FROM CURRENT_DATE)
          AND EXTRACT(YEAR FROM a.date) = EXTRACT(YEAR FROM CURRENT_DATE)
        ), 0) as this_month_overtime,
        COALESCE(SUM(a.extra_hours) FILTER (
          WHERE EXTRACT(YEAR FROM a.date) = EXTRACT(YEAR FROM CURRENT_DATE)
        ), 0) as ytd_overtime,
        COALESCE(AVG(a.work_hours) FILTER (
          WHERE a.date >= CURRENT_DATE - INTERVAL '30 days'
        ), 0) as avg_daily_hours
      FROM employees e
      LEFT JOIN attendance a ON a.employee_id = e.id
      WHERE e.status IN ('ACTIVE', 'ON_LEAVE')
      GROUP BY e.id, e.first_name, e.last_name, e.job_position, e.department, e.avatar_url
      ORDER BY this_month_overtime DESC
      LIMIT 20
    `);

    const totals = await pool.query(`
      SELECT 
        COALESCE(SUM(extra_hours) FILTER (
          WHERE EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM CURRENT_DATE)
          AND EXTRACT(YEAR FROM date) = EXTRACT(YEAR FROM CURRENT_DATE)
        ), 0) as total_this_month,
        COALESCE(AVG(extra_hours) FILTER (WHERE extra_hours > 0), 0) as avg_per_day
      FROM attendance
    `);

    res.json({
      success: true,
      totals: {
        totalOvertimeThisMonth: parseFloat(totals.rows[0].total_this_month).toFixed(1),
        avgOvertimePerDay: parseFloat(totals.rows[0].avg_per_day).toFixed(1)
      },
      employees: result.rows.map(row => ({
        id: row.id,
        name: `${row.first_name} ${row.last_name}`,
        jobPosition: row.job_position,
        department: row.department,
        avatarUrl: row.avatar_url,
        thisMonthOvertime: parseFloat(row.this_month_overtime).toFixed(1),
        ytdOvertime: parseFloat(row.ytd_overtime).toFixed(1),
        avgDailyHours: parseFloat(row.avg_daily_hours).toFixed(1)
      }))
    });
  } catch (err) {
    console.error('getOvertimeStats error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  getAttendanceTrends,
  getLeaveStats,
  getDepartmentStats,
  getOvertimeStats
};
