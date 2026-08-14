const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const Withdrawal = require('../models/Withdrawal');
const Transaction = require('../models/Transaction');
const { getSettings } = require('../utils/levels');

const WITHDRAWAL_COOLDOWN_DAYS = 7;

router.post('/', auth,
  body('amount').isFloat({ gt: 0 }),
  body('address').isString().isLength({ min: 10, max: 100 }),
  async (req, res) => {
    const errs = validationResult(req); if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
    const { amount, address } = req.body;

    // Block if user already has a pending withdrawal (one at a time)
    const existingPending = await Withdrawal.findOne({ user: req.user._id, status: 'pending' });
    if (existingPending) {
      return res.status(400).json({
        error: 'You already have a pending withdrawal request. Please wait for it to be reviewed before submitting another.',
      });
    }

    // Enforce 7-day cooldown after a previously approved withdrawal
    if (req.user.lastWithdrawalApprovedAt) {
      const cooldownMs = WITHDRAWAL_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
      const nextAllowedAt = new Date(req.user.lastWithdrawalApprovedAt.getTime() + cooldownMs);
      if (new Date() < nextAllowedAt) {
        return res.status(400).json({
          error: `You must wait 7 days between withdrawals. Next withdrawal allowed at: ${nextAllowedAt.toISOString()}`,
          nextWithdrawalAt: nextAllowedAt.toISOString(),
        });
      }
    }

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
  const cooldownMs = WITHDRAWAL_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  let nextWithdrawalAt = null;
  if (req.user.lastWithdrawalApprovedAt) {
    const next = new Date(req.user.lastWithdrawalApprovedAt.getTime() + cooldownMs);
    if (new Date() < next) nextWithdrawalAt = next.toISOString();
  }
  const withdrawals = await Withdrawal.find({ user: req.user._id }).sort('-createdAt');
  const hasPendingRequest = withdrawals.some((w) => w.status === 'pending');
  res.json({ withdrawals, nextWithdrawalAt, hasPendingRequest });
});

module.exports = router;
