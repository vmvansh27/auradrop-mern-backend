const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const Withdrawal = require('../models/Withdrawal');
const Transaction = require('../models/Transaction');
const { getSettings } = require('../utils/levels');

router.post('/', auth,
  body('amount').isFloat({ gt: 0 }),
  body('address').isString().isLength({ min: 10, max: 100 }),
  async (req, res) => {
    const errs = validationResult(req); if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
    const { amount, address } = req.body;
    const settings = await getSettings();
    if (amount > req.user.balance) return res.status(400).json({ error: 'Insufficient balance' });
    const feePercent = Number(settings.withdrawalFeePercent || 0);
    const feeAmount = +(amount * feePercent / 100).toFixed(4);
    const netAmount = +(amount - feeAmount).toFixed(4);
    if (netAmount <= 0) return res.status(400).json({ error: 'Withdrawal amount is too low after fees' });
    req.user.balance -= amount;
    await req.user.save();
    const w = await Withdrawal.create({ user: req.user._id, amount: netAmount, address, status: 'pending', feeAmount, grossAmount: amount });
    await Transaction.create({
      user: req.user._id,
      type: 'withdraw',
      amount,
      status: 'pending',
      note: `withdrawal:${w._id} | ${address} | fee ${feeAmount}`,
    });
    res.json({ ok: true, withdrawal: w });
  }
);

router.get('/mine', auth, async (req, res) => {
  res.json(await Withdrawal.find({ user: req.user._id }).sort('-createdAt'));
});

module.exports = router;
