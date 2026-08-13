const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const Transaction = require('../models/Transaction');
const WalletLog = require('../models/WalletLog');
const { getPlatformDepositAddress, verifyDeposit } = require('../utils/bsc');
const { grantReferralBonus } = require('./auth');

router.get('/address', auth, async (_req, res) => {
  try {
    res.json({ address: await getPlatformDepositAddress() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// User submits txHash after sending crypto. Server verifies on-chain.
router.post('/confirm', auth, body('hash').isString(), body('amount').optional().isFloat({ gt: 0 }), async (req, res) => {
  try {
    const errs = validationResult(req); if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
    const { hash } = req.body;
    const exists = await Transaction.findOne({ hash });
    if (exists) return res.status(400).json({ error: 'Hash already used' });

    const platformWalletAddress = await getPlatformDepositAddress();
    const result = process.env.DEMO_MODE === 'true'
      ? { ok: true, value: Number(req.body.amount), from: 'demo', to: platformWalletAddress, confirmations: 1 }
      : await verifyDeposit(hash);
    if (!result.ok) return res.status(400).json({ error: result.reason });
    if (!Number.isFinite(result.value) || result.value <= 0) return res.status(400).json({ error: 'Invalid deposit amount' });

    await WalletLog.create({ user: req.user._id, direction: 'in', amount: result.value, hash, from: result.from, to: result.to, confirmations: result.confirmations, status: 'confirmed' });

    req.user.balance += result.value;
    await req.user.save();
    const tx = await Transaction.create({ user: req.user._id, type: 'deposit', amount: result.value, status: 'completed', hash });

    // Grant referral bonus on the referred user's FIRST deposit only
    const isFirstDeposit = await Transaction.countDocuments({ user: req.user._id, type: 'deposit', status: 'completed' }) === 1;
    if (isFirstDeposit) {
      await grantReferralBonus(req.user, result.value).catch((err) => console.error('[deposit][referral-bonus]', err.message));
    }

    req.app.get('io').to('user:' + req.user._id).emit('deposit', tx);
    res.json({ ok: true, transaction: tx });
  } catch (error) {
    console.error('[deposit][confirm]', error.message);
    const status = /TOKEN_CONTRACT_ADDRESS|required|invalid/i.test(error.message) ? 400 : 500;
    res.status(status).json({ error: error.message || 'Deposit verification failed' });
  }
});

module.exports = router;
