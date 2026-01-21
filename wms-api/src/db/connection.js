// wms-api/src/db/connection.js
// Database connection pool

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { logger } from '../utils/logger.js';

dotenv.config();

// Log database configuration (without password)
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'wms_db',
};

logger.info('📊 Database Configuration', {
  Host: dbConfig.host,
  Port: dbConfig.port,
  User: dbConfig.user,
  Password: dbConfig.password ? '***' : '(empty)',
  Database: dbConfig.database
});

// Create connection pool
const pool = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  connectTimeout: 30000 // 30 seconds connection timeout (valid option)
});

// Add error handlers to the pool
pool.on('connection', (connection) => {
  logger.success('New database connection established');
});

pool.on('error', (err) => {
  logger.error('Database pool error', {
    code: err.code,
    message: err.message,
    error: err
  });
});

/**
 * Get a connection from the pool
 */
export async function getConnection() {
  try {
    logger.debug('Requesting database connection from pool');
    const connection = await pool.getConnection();
    logger.debug('Database connection obtained from pool');
    return connection;
  } catch (error) {
    logger.error('Failed to get database connection', {
      code: error.code,
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Execute a query
 */
export async function query(sql, params) {
  const [results] = await pool.execute(sql, params);
  return results;
}

export default pool;

