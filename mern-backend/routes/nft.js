const router = require('express').Router();
const { auth } = require('../middleware/auth');
const NFT = require('../models/NFT');
const Transaction = require('../models/Transaction');
const User = require('../models/User');

// Settle matured NFT stakes for a single user and return their matured NFTs
async function settleMaturedNftsForUser(userId) {
  const now = new Date();
  // Find NFTs owned by this user that have a duration and have matured
  const ownedNfts = await NFT.find({ owner: userId, listed: false });
  const matured = [];
  for (const nft of ownedNfts) {
    if (!nft.durationDays || nft.durationDays <= 0) continue;
    if (!nft.stakedAt) continue;
    const maturesAt = new Date(nft.stakedAt);
    maturesAt.setDate(maturesAt.getDate() + nft.durationDays);
    if (now < maturesAt) continue;
    // Already settled check
    if (nft.settled) continue;
    const user = await User.findById(userId);
    if (!user) continue;
    const interest = +(nft.price * (nft.interestPercent || 0) / 100).toFixed(4);
    const totalReturn = +(nft.price + interest).toFixed(4);
    user.balance += totalReturn;
    await user.save();
    nft.settled = true;
    nft.listed = true;
    nft.owner = null;
    await nft.save();
    await Transaction.create({
      user: userId,
      type: 'profit',
      amount: totalReturn,
      status: 'completed',
      note: `NFT stake matured: ${nft.name} | principal ${nft.price} + interest ${interest}`,
    });
    matured.push(nft._id);
  }
  return matured;
}

router.get('/', async (_req, res) => res.json(await NFT.find({ listed: true })));

router.get('/mine', auth, async (req, res) => {
  // Settle any matured NFT stakes before returning
  await settleMaturedNftsForUser(req.user._id).catch((err) => console.error('[nft][settle]', err.message));
  res.json(await NFT.find({ owner: req.user._id }).sort('-updatedAt'));
});

router.get('/:id', async (req, res) => res.json(await NFT.findById(req.params.id)));

router.post('/buy/:id', auth, async (req, res) => {
  const nft = await NFT.findById(req.params.id);
  if (!nft || !nft.listed) return res.status(404).json({ error: 'NFT not available' });
  if (nft.price > req.user.balance) return res.status(400).json({ error: 'Insufficient balance' });
  req.user.balance -= nft.price;
  await req.user.save();
  nft.owner = req.user._id;
  nft.listed = false;
  nft.stakedAt = new Date();
  nft.settled = false;
  await nft.save();
  await Transaction.create({
    user: req.user._id,
    type: 'investment',
    amount: nft.price,
    status: 'completed',
    note: `NFT stake: ${nft.name} | duration ${nft.durationDays}d | interest ${nft.interestPercent}%`,
  });
  res.json({ ok: true, nft });
});

// Admin/cron endpoint to settle all matured NFT stakes globally
router.post('/run-maturity-cron', async (req, res) => {
  if (req.headers['x-cron-key'] !== process.env.JWT_SECRET) return res.status(401).end();
  const now = new Date();
  const ownedNfts = await NFT.find({ listed: false, settled: { $ne: true } });
  let settled = 0;
  for (const nft of ownedNfts) {
    if (!nft.durationDays || nft.durationDays <= 0 || !nft.stakedAt || !nft.owner) continue;
    const maturesAt = new Date(nft.stakedAt);
    maturesAt.setDate(maturesAt.getDate() + nft.durationDays);
    if (now < maturesAt) continue;
    const user = await User.findById(nft.owner);
    if (!user) continue;
    const interest = +(nft.price * (nft.interestPercent || 0) / 100).toFixed(4);
    const totalReturn = +(nft.price + interest).toFixed(4);
    user.balance += totalReturn;
    await user.save();
    nft.settled = true;
    nft.listed = true;
    nft.owner = null;
    await nft.save();
    await Transaction.create({
      user: user._id,
      type: 'profit',
      amount: totalReturn,
      status: 'completed',
      note: `NFT stake matured: ${nft.name} | principal ${nft.price} + interest ${interest}`,
    });
    settled++;
  }
  res.json({ settled });
});

module.exports = router;
