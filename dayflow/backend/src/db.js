const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/dayflow_db'
});

pool.on('connect', () => {
    console.log('Connected to the PostgreSQL database successfully!');
});

module.exports = pool;