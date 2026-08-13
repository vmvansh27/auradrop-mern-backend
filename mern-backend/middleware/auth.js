const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(payload.id);
    if (!req.user) return res.status(401).json({ error: 'Invalid user' });
    next();
  } catch (e) { res.status(401).json({ error: 'Invalid token' }); }
};

exports.admin = (req, res, next) => {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admin only' });
  next();
};
