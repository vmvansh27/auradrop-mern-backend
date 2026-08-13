const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const Investment = require('../models/Investment');
const InvestmentPlan = require('../models/InvestmentPlan');
const Transaction = require('../models/Transaction');
const { resolveUserLevel, getSettings } = require('../utils/levels');
const { settleDueInvestmentsForUser } = require('../utils/investmentSettlement');

function isWindowOpen() {
  const h = new Date().getHours();
  return h < 12 || h >= 17;
}

async function ensureDefaultPlans() {
  const existing = await InvestmentPlan.countDocuments();
  if (existing > 0) return;
  await InvestmentPlan.insertMany([
    { name: 'Starter 10', amount: 10, roi: 1.5, order: 1 },
    { name: 'Starter 20', amount: 20, roi: 1.5, order: 2 },
    { name: 'Growth 50', amount: 50, roi: 1.8, order: 3 },
    { name: 'Growth 100', amount: 100, roi: 2.0, order: 4 },
    { name: 'Pro 250', amount: 250, roi: 2.3, order: 5 },
    { name: 'Pro 500', amount: 500, roi: 2.6, order: 6 },
    { name: 'Elite 1000', amount: 1000, roi: 3.0, order: 7 },
  ]);
}

router.get('/plans', auth, async (_req, res) => {
  await ensureDefaultPlans();
  res.json(await InvestmentPlan.find({ active: true }).sort({ order: 1, amount: 1 }));
});

router.get('/quote', auth, async (req, res) => {
  const amount = Number(req.query.amount);
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Enter a valid amount' });
  const settings = await getSettings();
  const { level, metrics } = await resolveUserLevel(req.user);
  // if (req.user.balance < level.minWalletBalance) {
  //   return res.status(400).json({ error: `You need at least $${level.minWalletBalance} wallet balance for ${level.name}` });
  // }
  // if (amount > level.maxInvest) {
  //   return res.status(400).json({ error: `${level.name} max investment is $${level.maxInvest}` });
  // }
  // if (amount < settings.investmentMinAmount) {
  //   return res.status(400).json({ error: `Minimum investment is $${settings.investmentMinAmount}` });
  // }
  // Only validate that the entered amount is sensible.
  // Do NOT check wallet balance here.
  // The actual investment route will perform all validations.

  if (amount < settings.investmentMinAmount) {
    return res.status(400).json({
      error: `Minimum investment is $${settings.investmentMinAmount}`
    });
  }

  if (amount > level.maxInvest) {
    return res.status(400).json({
      error: `${level.name} max investment is $${level.maxInvest}`
    });
  }

  const price = Number(req.query.price || 64608.29);
  const btcQuantity = +(amount / price).toFixed(8);
  const roi = level.roi ?? settings.defaultRoi;
  const profit = +(amount * roi / 100).toFixed(4);
  const nextDayPayout = +(amount + profit).toFixed(4);
  const activeInvestment = await Investment.findOne({
    user: req.user._id,
    status: "active",
  });
  res.json({
    amount,
    btcQuantity,
    roi,
    profit,
    nextDayPayout,

    canInvest:
      !activeInvestment &&
      req.user.balance >= level.minWalletBalance &&
      req.user.balance >= amount,

    reason:
      activeInvestment
        ? "You already have an active investment."
        : req.user.balance < level.minWalletBalance
          ? `Minimum wallet balance is $${level.minWalletBalance}`
          : req.user.balance < amount
            ? "Insufficient balance"
            : null,

    level: {
      name: level.name,
      minWalletBalance: level.minWalletBalance,
      maxInvest: level.maxInvest,
      teamMetrics: metrics,
    },
  });
});

router.post('/', auth, body('amount').isFloat({ gt: 0 }), body('price').optional().isFloat({ gt: 0 }), body('planId').optional().isString(), async (req, res) => {
  const errs = validationResult(req); if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
  if (!isWindowOpen()) return res.status(400).json({ error: 'Window closed (12 PM - 5 PM)' });
  await settleDueInvestmentsForUser(req.user._id);
  await ensureDefaultPlans();
  const selectedPlan = req.body.planId ? await InvestmentPlan.findById(req.body.planId) : null;
  if (req.body.planId && !selectedPlan) return res.status(404).json({ error: 'Investment plan not found' });
  const amount = selectedPlan ? selectedPlan.amount : Number(req.body.amount);
  const settings = await getSettings();
  const { level } = await resolveUserLevel(req.user);
  console.log("Current User ID:", req.user._id);

  const activeInvestment = await Investment.findOne({
    user: req.user._id,
    status: "active",
  });

  console.log("Found Active Investment:", activeInvestment);
  if (activeInvestment) {
    return res.status(400).json({
      error: "You already have an active investment.",
      nextInvestmentAt: activeInvestment.maturesAt,
    });
  }
  if (amount < settings.investmentMinAmount) return res.status(400).json({ error: `Min $${settings.investmentMinAmount}` });
  if (req.user.balance < level.minWalletBalance) return res.status(400).json({ error: `You need at least $${level.minWalletBalance} wallet balance for ${level.name}` });
  if (amount > level.maxInvest) return res.status(400).json({ error: `${level.name} max investment is $${level.maxInvest}` });
  if (amount > req.user.balance) return res.status(400).json({ error: 'Insufficient balance' });

  const roi = selectedPlan
    ? selectedPlan.roi
    : (level.roi ?? settings.defaultRoi);
  const expectedReturn = +(amount * (1 + roi / 100)).toFixed(4);
  const matures = new Date(); matures.setDate(matures.getDate() + 1); matures.setHours(6, 0, 0, 0);
  const entryPrice = Number(req.body.price || 64608.29);
  const btcQuantity = +(amount / entryPrice).toFixed(8);

  req.user.balance -= amount;
  req.user.invested += amount;
  await req.user.save();

  const inv = await Investment.create({
    user: req.user._id,
    plan: selectedPlan?._id,
    amount,
    roi,
    expectedReturn,
    maturesAt: matures,
  });
  await Transaction.create({
    user: req.user._id,
    type: 'investment',
    amount,
    status: 'active',
    note: `Bought ${btcQuantity} BTC @ ${entryPrice}`,
  });
  res.json({ ok: true, investment: inv });
});

router.get('/mine', auth, async (req, res) => {
  res.json(await Investment.find({ user: req.user._id }).sort('-createdAt'));
});

// Cron job (call this on a schedule) to mature investments and credit profits.
router.post('/run-maturity-cron', async (req, res) => {
  if (req.headers['x-cron-key'] !== process.env.JWT_SECRET) return res.status(401).end();
  const due = await Investment.find({ status: 'active', maturesAt: { $lte: new Date() } });
  const User = require('../models/User');
  for (const inv of due) {
    const user = await User.findById(inv.user);
    if (!user) continue;
    user.balance += inv.expectedReturn;
    user.invested -= inv.amount;
    user.profit += inv.expectedReturn - inv.amount;
    await user.save();
    inv.status = 'matured'; await inv.save();
    await Transaction.create({ user: user._id, type: 'profit', amount: inv.expectedReturn - inv.amount, status: 'completed' });
  }
  res.json({ matured: due.length });
});

module.exports = router;
