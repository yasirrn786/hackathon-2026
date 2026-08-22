const rateLimit = require('express-rate-limit');

/**
 * Strict limiter for the login endpoint: slows down credential-stuffing /
 * brute-force attempts without needing an external store (fine for a
 * single-instance hackathon deployment; swap the store for Redis if this
 * ever runs behind multiple instances).
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many login attempts. Please try again in a few minutes.',
  },
});

/**
 * Looser general-purpose limiter for the rest of the API, mainly to blunt
 * accidental client-side retry storms and scripted abuse.
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests. Please slow down.',
  },
});

module.exports = { authLimiter, apiLimiter };