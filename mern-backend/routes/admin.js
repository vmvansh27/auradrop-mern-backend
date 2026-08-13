const router = require('express').Router();
const { auth, admin } = require('../middleware/auth');
const User = require('../models/User');
const Withdrawal = require('../models/Withdrawal');
const Transaction = require('../models/Transaction');
const AdminSettings = require('../models/AdminSettings');
const WalletLog = require('../models/WalletLog');
const NFT = require('../models/NFT');
const Post = require('../models/Post');
const Notification = require('../models/Notification');
const KycSubmission = require('../models/KycSubmission');
const InvestmentPlan = require('../models/InvestmentPlan');
const SocialLink = require('../models/SocialLink');
const RoadmapItem = require('../models/RoadmapItem');
const Investment = require('../models/Investment');
const Referral = require('../models/Referral');

router.use(auth, admin);

router.get('/users', async (req, res) => {
  const search = (req.query.search || '').trim();
  const filter = search ? { email: { $regex: search, $options: 'i' } } : {};
  res.json(await User.find(filter).select('-otp').sort('-createdAt'));
});

router.get('/users/:id/details', async (req, res) => {
  const target = await User.findById(req.params.id).select('-otp');
  if (!target) return res.status(404).json({ error: 'User not found' });
  const [transactions, investments, withdrawals, walletLogs] = await Promise.all([
    Transaction.find({ user: target._id }).sort('-createdAt').limit(200),
    Investment.find({ user: target._id }).sort('-createdAt').limit(100),
    Withdrawal.find({ user: target._id }).sort('-createdAt').limit(100),
    WalletLog.find({ user: target._id }).sort('-createdAt').limit(100),
  ]);

  const dailySeries = new Map();
  for (let offset = 29; offset >= 0; offset -= 1) {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - offset);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    dailySeries.set(key, { date: key, deposits: 0, withdrawals: 0, investments: 0, profits: 0 });
  }

  for (const tx of transactions) {
    const day = new Date(tx.createdAt);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    const entry = dailySeries.get(key);
    if (!entry) continue;
    if (tx.type === 'deposit') entry.deposits += tx.amount;
    if (tx.type === 'withdraw') entry.withdrawals += tx.amount;
    if (tx.type === 'investment') entry.investments += tx.amount;
    if (tx.type === 'profit') entry.profits += tx.amount;
  }

  res.json({
    user: target,
    transactions,
    investments,
    withdrawals,
    walletLogs,
    chart: Array.from(dailySeries.values()),
  });
});

router.delete('/users/by-email', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Email is required' });
  const target = await User.findOne({ email });
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.isAdmin) return res.status(400).json({ error: 'Admin accounts cannot be deleted here' });

  await Promise.all([
    Transaction.deleteMany({ user: target._id }),
    Investment.deleteMany({ user: target._id }),
    Withdrawal.deleteMany({ user: target._id }),
    WalletLog.deleteMany({ user: target._id }),
    KycSubmission.deleteMany({ user: target._id }),
    Referral.deleteMany({ $or: [{ referrer: target._id }, { referred: target._id }] }),
    NFT.updateMany({ owner: target._id }, { $set: { owner: null, listed: true } }),
  ]);
  await User.deleteOne({ _id: target._id });
  res.json({ ok: true });
});

router.post('/users/:id/adjust-balance', async (req, res) => {
  const amount = Number(req.body.amount);
  const reason = (req.body.reason || 'Admin balance adjustment').trim();
  if (!Number.isFinite(amount) || amount === 0) {
    return res.status(400).json({ error: 'Adjustment amount must be a non-zero number' });
  }
  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).end();
  const nextBalance = +(target.balance + amount).toFixed(4);
  if (nextBalance < 0) return res.status(400).json({ error: 'Adjustment would make balance negative' });
  target.balance = nextBalance;
  await target.save();
  const tx = await Transaction.create({
    user: target._id,
    type: amount > 0 ? 'deposit' : 'withdraw',
    amount: Math.abs(amount),
    status: 'completed',
    note: `${reason} (admin:${req.user.email})`,
  });
  res.json({ ok: true, balance: target.balance, transaction: tx });
});

router.get('/settings', async (_req, res) => {
  const s = (await AdminSettings.findOne({ key: 'global' })) || await AdminSettings.create({ key: 'global' });
  res.json(s);
});

router.get('/investment-plans', async (_req, res) => {
  const plans = await InvestmentPlan.find().sort({ order: 1, amount: 1 });
  res.json(plans);
});

router.post('/investment-plans', async (req, res) => {
  const plan = await InvestmentPlan.create(req.body);
  res.json(plan);
});

router.put('/investment-plans/:id', async (req, res) => {
  const plan = await InvestmentPlan.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!plan) return res.status(404).end();
  res.json(plan);
});

router.delete('/investment-plans/:id', async (req, res) => {
  const plan = await InvestmentPlan.findByIdAndDelete(req.params.id);
  if (!plan) return res.status(404).end();
  res.json({ ok: true });
});

router.put('/settings', async (req, res) => {
  if (req.body.adminWallet && !/^0x[a-fA-F0-9]{40}$/.test(req.body.adminWallet)) {
    return res.status(400).json({ error: 'Main deposit wallet must be a valid 0x wallet address' });
  }
  const s = await AdminSettings.findOneAndUpdate({ key: 'global' }, req.body, { upsert: true, new: true });
  res.json(s);
});

router.get('/withdrawals', async (_req, res) => {
  res.json(await Withdrawal.find().populate('user', 'email').sort('-createdAt'));
});

router.get('/nfts', async (_req, res) => {
  res.json(await NFT.find().populate('owner', 'email').sort('-createdAt'));
});

router.post('/nfts', async (req, res) => {
  const nft = await NFT.create({ ...req.body, createdBy: req.user._id });
  res.json(nft);
});

router.put('/nfts/:id', async (req, res) => {
  const nft = await NFT.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!nft) return res.status(404).end();
  res.json(nft);
});

router.delete('/nfts/:id', async (req, res) => {
  const nft = await NFT.findByIdAndDelete(req.params.id);
  if (!nft) return res.status(404).end();
  res.json({ ok: true });
});

router.get('/posts', async (_req, res) => {
  res.json(await Post.find().sort('-createdAt'));
});

router.post('/posts', async (req, res) => {
  const post = await Post.create({ ...req.body, createdBy: req.user._id });
  res.json(post);
});

router.put('/posts/:id', async (req, res) => {
  const post = await Post.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!post) return res.status(404).end();
  res.json(post);
});

router.delete('/posts/:id', async (req, res) => {
  const post = await Post.findByIdAndDelete(req.params.id);
  if (!post) return res.status(404).end();
  res.json({ ok: true });
});

router.get('/notifications', async (_req, res) => {
  res.json(await Notification.find().sort('-createdAt'));
});

router.post('/notifications', async (req, res) => {
  const notification = await Notification.create({ ...req.body, createdBy: req.user._id });
  res.json(notification);
});

router.put('/notifications/:id', async (req, res) => {
  const notification = await Notification.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!notification) return res.status(404).end();
  res.json(notification);
});

router.delete('/notifications/:id', async (req, res) => {
  const notification = await Notification.findByIdAndDelete(req.params.id);
  if (!notification) return res.status(404).end();
  res.json({ ok: true });
});

router.get('/social-links', async (_req, res) => {
  res.json(await SocialLink.find().sort({ order: 1, createdAt: -1 }));
});

router.post('/social-links', async (req, res) => {
  const link = await SocialLink.create({ ...req.body, createdBy: req.user._id });
  res.json(link);
});

router.put('/social-links/:id', async (req, res) => {
  const link = await SocialLink.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!link) return res.status(404).end();
  res.json(link);
});

router.delete('/social-links/:id', async (req, res) => {
  const link = await SocialLink.findByIdAndDelete(req.params.id);
  if (!link) return res.status(404).end();
  res.json({ ok: true });
});

router.get('/roadmap', async (_req, res) => {
  res.json(await RoadmapItem.find().sort({ order: 1, createdAt: -1 }));
});

router.post('/roadmap', async (req, res) => {
  const item = await RoadmapItem.create({ ...req.body, createdBy: req.user._id });
  res.json(item);
});

router.put('/roadmap/:id', async (req, res) => {
  const item = await RoadmapItem.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!item) return res.status(404).end();
  res.json(item);
});

router.delete('/roadmap/:id', async (req, res) => {
  const item = await RoadmapItem.findByIdAndDelete(req.params.id);
  if (!item) return res.status(404).end();
  res.json({ ok: true });
});

router.get('/kyc', async (_req, res) => {
  res.json(await KycSubmission.find().populate('user', 'email kycStatus').sort('-updatedAt'));
});

router.post('/kyc/:id/approve', async (req, res) => {
  const submission = await KycSubmission.findById(req.params.id);
  if (!submission) return res.status(404).end();
  submission.status = 'approved';
  submission.rejectionReason = undefined;
  submission.reviewedBy = req.user._id;
  submission.reviewedAt = new Date();
  await submission.save();
  await User.findByIdAndUpdate(submission.user, { kycStatus: 'approved' });
  res.json({ ok: true, submission });
});

router.post('/kyc/:id/reject', async (req, res) => {
  const submission = await KycSubmission.findById(req.params.id);
  if (!submission) return res.status(404).end();
  submission.status = 'rejected';
  submission.rejectionReason = req.body.reason || 'KYC details did not pass review';
  submission.reviewedBy = req.user._id;
  submission.reviewedAt = new Date();
  await submission.save();
  await User.findByIdAndUpdate(submission.user, { kycStatus: 'rejected' });
  res.json({ ok: true, submission });
});

router.post('/withdrawals/:id/approve', async (req, res) => {
  try {
    const w = await Withdrawal.findById(req.params.id);
    if (!w) return res.status(404).end();
    if (w.status !== 'pending') return res.status(400).json({ error: 'Withdrawal already reviewed' });
    const txHash = (req.body.txHash || '').trim();
    if (!txHash) return res.status(400).json({ error: 'Transaction hash is required to approve a withdrawal' });
    w.status = 'approved'; w.txHash = txHash; w.reviewedBy = req.user._id; w.reviewedAt = new Date();
    await w.save();
    await WalletLog.create({ user: w.user, direction: 'out', amount: w.amount, hash: txHash, to: w.address, status: 'confirmed' });
    await Transaction.findOneAndUpdate(
      { user: w.user, type: 'withdraw', status: 'pending', note: { $regex: `withdrawal:${w._id}` } },
      { status: 'completed', hash: txHash },
    );
    res.json({ ok: true, txHash });
  } catch (error) {
    console.error('[admin][approve-withdrawal]', error.message);
    res.status(500).json({ error: error.message || 'Withdrawal approval failed' });
  }
});

router.post('/withdrawals/:id/reject', async (req, res) => {
  const w = await Withdrawal.findById(req.params.id);
  if (!w) return res.status(404).end();
  if (w.status !== 'pending') return res.status(400).json({ error: 'Withdrawal already reviewed' });
  w.status = 'rejected'; w.reviewedBy = req.user._id; w.reviewedAt = new Date();
  await w.save();
  // refund
  const user = await User.findById(w.user); user.balance += w.grossAmount || w.amount; await user.save();
  await Transaction.findOneAndUpdate(
    { user: w.user, type: 'withdraw', status: 'pending', note: { $regex: `withdrawal:${w._id}` } },
    { status: 'rejected' },
  );
  res.json({ ok: true });
});

router.get('/analytics', async (_req, res) => {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const chartStart = new Date(todayStart); chartStart.setDate(chartStart.getDate() - 6);
  const [users, totalBalance, totalInvested, txCount, transactionTotals, dailyFlow] = await Promise.all([
    User.countDocuments(),
    User.aggregate([{ $group: { _id: null, sum: { $sum: '$balance' } } }]),
    User.aggregate([{ $group: { _id: null, sum: { $sum: '$invested' } } }]),
    Transaction.countDocuments(),
    Transaction.aggregate([
      { $match: { type: { $in: ['deposit', 'withdraw'] }, status: { $ne: 'rejected' }, createdAt: { $gte: sevenDaysAgo } } },
      { $group: {
        _id: '$type',
        daily: { $sum: { $cond: [{ $gte: ['$createdAt', todayStart] }, '$amount', 0] } },
        sevenDays: { $sum: '$amount' },
      } },
    ]),
    Transaction.aggregate([
      { $match: { type: { $in: ['deposit', 'withdraw'] }, status: { $ne: 'rejected' }, createdAt: { $gte: chartStart } } },
      { $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          type: '$type',
        },
        amount: { $sum: '$amount' },
      } },
      { $sort: { '_id.date': 1 } },
    ]),
  ]);
  const totalsFor = (type) => transactionTotals.find((item) => item._id === type) || {};
  const flowByDay = new Map();
  for (let offset = 0; offset < 7; offset += 1) {
    const day = new Date(chartStart); day.setDate(day.getDate() + offset);
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    flowByDay.set(date, { date, deposits: 0, withdrawals: 0 });
  }
  for (const item of dailyFlow) {
    const day = flowByDay.get(item._id.date);
    if (day) day[item._id.type === 'deposit' ? 'deposits' : 'withdrawals'] = item.amount;
  }
  res.json({
    users,
    platformBalance: totalBalance[0]?.sum || 0,
    totalAccountsBalance: totalBalance[0]?.sum || 0,
    totalInvested: totalInvested[0]?.sum || 0,
    transactions: txCount,
    dailyDeposits: totalsFor('deposit').daily || 0,
    dailyWithdrawals: totalsFor('withdraw').daily || 0,
    sevenDayDeposits: totalsFor('deposit').sevenDays || 0,
    sevenDayWithdrawals: totalsFor('withdraw').sevenDays || 0,
    dailyFlow: Array.from(flowByDay.values()),
  });
});

module.exports = router;
