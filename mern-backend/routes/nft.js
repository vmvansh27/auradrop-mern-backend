const router = require('express').Router();
const { auth } = require('../middleware/auth');
const NFT = require('../models/NFT');
const Transaction = require('../models/Transaction');
const User = require('../models/User');

router.get('/', async (_req, res) => res.json(await NFT.find({ listed: true })));

router.get('/mine', auth, async (req, res) => {
  const now = new Date();
  const nfts = await NFT.find({ owner: req.user._id }).sort('-updatedAt');
  // Attach a computed maturesAt and isMature flag for each NFT
  const enriched = nfts.map((nft) => {
    const obj = nft.toObject();
    if (nft.durationDays > 0 && nft.stakedAt) {
      const maturesAt = new Date(nft.stakedAt);
      maturesAt.setDate(maturesAt.getDate() + nft.durationDays);
      obj.maturesAt = maturesAt.toISOString();
      obj.isMature = now >= maturesAt;
    } else {
      obj.maturesAt = null;
      obj.isMature = false;
    }
    return obj;
  });
  res.json(enriched);
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

// User manually claims a matured NFT stake – returns principal + interest
router.post('/claim/:id', auth, async (req, res) => {
  try {
    const nft = await NFT.findOne({ _id: req.params.id, owner: req.user._id, listed: false });
    if (!nft) return res.status(404).json({ error: 'NFT not found in your collection' });
    if (nft.settled) return res.status(400).json({ error: 'This NFT has already been claimed' });
    if (!nft.durationDays || nft.durationDays <= 0) return res.status(400).json({ error: 'This NFT has no staking duration' });
    if (!nft.stakedAt) return res.status(400).json({ error: 'Stake start date missing' });

    const maturesAt = new Date(nft.stakedAt);
    maturesAt.setDate(maturesAt.getDate() + nft.durationDays);
    if (new Date() < maturesAt) {
      return res.status(400).json({
        error: `NFT stake has not matured yet. Matures at: ${maturesAt.toISOString()}`,
        maturesAt: maturesAt.toISOString(),
      });
    }

    const interest = +(nft.price * (nft.interestPercent || 0) / 100).toFixed(4);
    const totalReturn = +(nft.price + interest).toFixed(4);

    req.user.balance += totalReturn;
    await req.user.save();

    nft.settled = true;
    nft.listed = true;
    nft.owner = null;
    await nft.save();

    await Transaction.create({
      user: req.user._id,
      type: 'profit',
      amount: totalReturn,
      status: 'completed',
      note: `NFT claimed: ${nft.name} | principal ${nft.price} + interest ${interest}`,
    });

    res.json({ ok: true, principal: nft.price, interest, totalReturn });
  } catch (error) {
    console.error('[nft][claim]', error.message);
    res.status(500).json({ error: error.message || 'Claim failed' });
  }
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
