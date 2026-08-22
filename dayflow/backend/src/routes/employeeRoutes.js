const express = require('express');
const router = express.Router();
const { registerEmployee } = require('../controllers/employeeController');

// When a POST request comes into /create-employee, send it to the registerEmployee chef
router.post('/create-employee', registerEmployee);

module.exports = router;