const router = require('express').Router();
const { auth } = require('../middleware/auth');
const Transaction = require('../models/Transaction');
router.get('/', auth, async (req, res) => {
  const { type } = req.query;
  const filter = { user: req.user._id };
  if (type && type !== 'all') filter.type = type;
  res.json(await Transaction.find(filter).sort('-createdAt').limit(200));
});
module.exports = router;
