const router = require('express').Router();
const { auth } = require('../middleware/auth');
const Referral = require('../models/Referral');

router.get('/mine', auth, async (req, res) => {
  const list = await Referral.find({ referrer: req.user._id }).populate('referred', 'email createdAt');
  res.json({ code: req.user.referralCode, referrals: list, earnings: req.user.referralEarnings });
});

module.exports = router;
