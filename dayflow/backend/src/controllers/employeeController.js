const { createEmployeeAccount } = require('../services/employeeService');

async function registerEmployee(req, res) {
  try {
    const { 
      companyId, 
      firstName, 
      lastName, 
      email, 
      phone, 
      jobPosition, 
      location, 
      dateOfJoining, 
      dateOfBirth, 
      departmentId, 
      role 
    } = req.body;

    // Call the service function we created earlier
    const result = await createEmployeeAccount({
      companyId,
      firstName,
      lastName,
      email,
      phone,
      jobPosition,
      location,
      dateOfJoining,
      dateOfBirth,
      departmentId,
      role
    });

    return res.status(201).json({
      success: true,
      message: 'Employee account created successfully!',
      loginId: result.user.loginId,         // The auto-generated ID (e.g., OIJODO20260001)
      tempPassword: result.tempPassword,   // The temporary password to give to the employee
      employee: result.employee
    });
  } catch (error) {
    console.error('Error creating employee:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Server error while creating employee account.' 
    });
  }
}

module.exports = {
  registerEmployee,
};