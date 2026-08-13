const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const Investment = require('../models/Investment');
const Transaction = require('../models/Transaction');
const Post = require('../models/Post');
const Notification = require('../models/Notification');
const KycSubmission = require('../models/KycSubmission');
const NFT = require('../models/NFT');
const SocialLink = require('../models/SocialLink');
const RoadmapItem = require('../models/RoadmapItem');
const { getPlatformDepositAddress } = require('../utils/bsc');
const { syncUserLevel, getSettings } = require('../utils/levels');
const { settleDueInvestmentsForUser } = require('../utils/investmentSettlement');

router.get('/me', auth, async (req, res) => {
  await settleDueInvestmentsForUser(req.user._id);
  const freshUser = req.user.constructor ? await req.user.constructor.findById(req.user._id) : req.user;
  const levelInfo = await syncUserLevel(freshUser);
  const investments = await Investment.find({ user: req.user._id, status: 'active' }).sort('-createdAt');
  const txs = await Transaction.find({ user: req.user._id }).sort('-createdAt').limit(20);
  const ownedNfts = await NFT.find({ owner: req.user._id }).sort('-updatedAt');
  const platformWalletAddress = await getPlatformDepositAddress();
  res.json({
    user: {
      ...freshUser.toObject(),
      walletAddress: platformWalletAddress,
      platformWalletAddress,
      assetMode: (process.env.WALLET_ASSET_MODE || 'native').toLowerCase(),
      currentLevel: levelInfo.level.name,
      levelLimits: {
        minWalletBalance: levelInfo.level.minWalletBalance,
        maxInvest: levelInfo.level.maxInvest,
      },
      teamMetrics: levelInfo.metrics,
    },
    balance: freshUser.balance,
    invested: freshUser.invested,
    profit: freshUser.profit,
    referralEarnings: freshUser.referralEarnings,
    investments, transactions: txs, ownedNfts,
  });
});

router.get('/home-feed', auth, async (_req, res) => {
  const [posts, notifications, socialLinks, roadmap] = await Promise.all([
    Post.find({ published: true }).sort('-createdAt').limit(10),
    Notification.find({ active: true }).sort('-createdAt').limit(10),
    SocialLink.find({ active: true }).sort({ order: 1, createdAt: -1 }).limit(12),
    RoadmapItem.find({ active: true }).sort({ order: 1, createdAt: -1 }).limit(12),
  ]);
  res.json({ posts, notifications, socialLinks, roadmap });
});

router.get('/platform-config', auth, async (_req, res) => {
  const settings = await getSettings();
  res.json({
    withdrawalFeePercent: Number(settings.withdrawalFeePercent || 0),
  });
});

router.get('/kyc', auth, async (req, res) => {
  const submission = await KycSubmission.findOne({ user: req.user._id }).sort('-updatedAt');
  res.json({
    status: req.user.kycStatus,
    submission,
  });
});

router.post('/kyc', auth,
  body('fullName').trim().notEmpty(),
  body('phone').trim().notEmpty(),
  body('country').trim().notEmpty(),
  body('documentType').trim().notEmpty(),
  body('documentNumber').trim().notEmpty(),
  body('documentFrontUrl').trim().isURL(),
  body('documentBackUrl').optional({ values: 'falsy' }).trim().isURL(),
  body('selfieUrl').optional({ values: 'falsy' }).trim().isURL(),
  async (req, res) => {
    const errs = validationResult(req); if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
    const existing = await KycSubmission.findOne({ user: req.user._id });
    if (existing?.status === 'approved') {
      return res.status(400).json({ error: 'KYC is already approved for this account' });
    }
    const submission = await KycSubmission.findOneAndUpdate(
      { user: req.user._id },
      {
        user: req.user._id,
        ...req.body,
        status: 'pending',
        rejectionReason: undefined,
        reviewedBy: undefined,
        reviewedAt: undefined,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    req.user.kycStatus = 'pending';
    await req.user.save();
    res.json({ ok: true, submission, status: req.user.kycStatus });
  });

module.exports = router;
