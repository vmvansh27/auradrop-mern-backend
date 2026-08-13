const rateLimit = require('express-rate-limit');
exports.apiLimiter = rateLimit({ windowMs: 60_000, max: 100 });
exports.otpLimiter = rateLimit({ windowMs: 60_000, max: 5 });
