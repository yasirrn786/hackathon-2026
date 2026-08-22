/**
 * Central application configuration.
 *
 * IMPORTANT: This module intentionally throws on startup if required secrets
 * are missing, rather than silently falling back to an insecure default.
 * A hardcoded JWT secret fallback means anyone who reads the source code
 * (e.g. on a public GitHub repo) can forge valid tokens for ANY user,
 * including ADMIN. Never reintroduce a fallback value here.
 */
require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    // Fail loudly and immediately. Do not let the server start in an
    // insecure state.
    // eslint-disable-next-line no-console
    console.error(
      `\nFATAL: Required environment variable "${name}" is not set.\n` +
      `Dayflow will not start without it. Copy .env.example to .env and set ${name}.\n`
    );
    process.exit(1);
  }
  return value;
}

const JWT_SECRET = required('JWT_SECRET');

if (JWT_SECRET.length < 32) {
  console.error(
    '\nFATAL: JWT_SECRET is too short (must be at least 32 characters).\n' +
    'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\n'
  );
  process.exit(1);
}

const NODE_ENV = process.env.NODE_ENV || 'development';

// FRONTEND_URL may be a single origin or a comma-separated list of origins
// (useful when the demo frontend is served from more than one place, e.g.
// a local file server during development and a deployed URL in production).
const FRONTEND_URL = process.env.FRONTEND_URL || '';
const ALLOWED_ORIGINS = FRONTEND_URL
  ? FRONTEND_URL.split(',').map(o => o.trim()).filter(Boolean)
  : [];

if (NODE_ENV === 'production' && ALLOWED_ORIGINS.length === 0) {
  console.error(
    '\nFATAL: FRONTEND_URL is not set. Refusing to start with an open CORS ' +
    'policy in production. Set FRONTEND_URL to a comma-separated list of ' +
    'allowed origins, e.g. https://app.example.com\n'
  );
  process.exit(1);
}

module.exports = {
  NODE_ENV,
  PORT: process.env.PORT || 5000,
  JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  ALLOWED_ORIGINS,
  BCRYPT_SALT_ROUNDS: parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12,
};