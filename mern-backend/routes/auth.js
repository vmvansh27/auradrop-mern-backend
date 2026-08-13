const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Referral = require('../models/Referral');
const AdminSettings = require('../models/AdminSettings');
const { sign } = require('../utils/jwt');
const { generateOtp } = require('../utils/otp');
const { sendOtp } = require('../utils/mailer');
const { generateDepositAddress, getPlatformDepositAddress } = require('../utils/bsc');
const { otpLimiter } = require('../middleware/rateLimit');
const { syncUserLevel, getSettings } = require('../utils/levels');

// Exported so deposit route can call it after a first deposit
async function grantReferralBonus(newUser, depositAmount) {
  if (!newUser.referredBy) return;
  const referrer = await User.findById(newUser.referredBy);
  if (!referrer) return;

  const rewardTargets = [
    { target: referrer, label: 'A', percentKey: 'directReferralPercent' },
  ];
  if (referrer.referredBy) {
    const tierB = await User.findById(referrer.referredBy);
    if (tierB) rewardTargets.push({ target: tierB, label: 'B', percentKey: 'tierBReferralPercent' });
    if (tierB?.referredBy) {
      const tierC = await User.findById(tierB.referredBy);
      if (tierC) rewardTargets.push({ target: tierC, label: 'C', percentKey: 'tierCReferralPercent' });
    }
  }

  for (const rewardTarget of rewardTargets) {
    const { level } = await syncUserLevel(rewardTarget.target);
    const pct = Number(level[rewardTarget.percentKey] || 0);
    if (pct <= 0) continue;
    const reward = +(depositAmount * pct / 100).toFixed(4);
    if (reward <= 0) continue;
    rewardTarget.target.balance += reward;
    rewardTarget.target.referralEarnings += reward;
    await rewardTarget.target.save();
    await Transaction.create({
      user: rewardTarget.target._id,
      type: 'referral',
      amount: reward,
      status: 'completed',
      note: `Level ${rewardTarget.label} referral reward for ${newUser.email} first deposit`,
    });
    if (rewardTarget.label === 'A') {
      await Referral.findOneAndUpdate(
        { referrer: rewardTarget.target._id, referred: newUser._id },
        { reward },
      );
    }
  }
}

function getDemoOtpEmails() {
  return (process.env.DEMO_OTP_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function isDemoOtpEmail(email) {
  return getDemoOtpEmails().includes((email || '').toLowerCase());
}

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

router.post('/request-otp', otpLimiter,
  body('email').isEmail(),
  async (req, res) => {
    const errs = validationResult(req); if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
    const email = normalizeEmail(req.body.email);
    const isDemoMode = process.env.DEMO_MODE === 'true';
    const useDemoOtp = isDemoMode || isDemoOtpEmail(email);
    const isAdmin = email === (process.env.ADMIN_EMAIL || '').toLowerCase();
    const code = useDemoOtp ? (process.env.DEMO_OTP_CODE || '123456') : generateOtp();
    console.log('[auth][request-otp]', { email, isDemoMode, useDemoOtp, isAdmin });
    const expiresAt = new Date(Date.now() + 5 * 60_000);
    await User.findOneAndUpdate({ email }, { email, ...(isAdmin ? { isAdmin: true } : {}), otp: { code, expiresAt } }, { upsert: true });
    if (!useDemoOtp) {
      try {
        const info = await sendOtp(email, code);
        console.log('[auth][mail-sent]', {
          email,
          messageId: info.messageId,
          accepted: info.accepted,
          rejected: info.rejected,
          response: info.response,
        });
      } catch (e) {
        console.error('[auth][mail-error]', {
          email,
          message: e.message,
          response: e.response,
          code: e.code,
        });
        return res.status(502).json({ error: 'OTP email could not be sent. Check SMTP settings or recipient inbox.' });
      }
    }
    res.json({ ok: true, demoCode: useDemoOtp ? code : undefined });
  }
);

router.post('/verify-otp',
  body('email').isEmail(),
  body('code').isLength({ min: 6, max: 6 }),
  body('referralCode').optional().isString(),
  async (req, res) => {
    const errs = validationResult(req); if (!errs.isEmpty()) return res.status(400).json({ errors: errs.array() });
    const email = normalizeEmail(req.body.email);
    const code = (req.body.code || '').trim();
    const { referralCode } = req.body;
    const user = await User.findOne({ email });
    if (!user || !user.otp?.code) return res.status(400).json({ error: 'No OTP requested' });
    const isDemoCodeAllowed = isDemoOtpEmail(email) && code === (process.env.DEMO_OTP_CODE || '123456');
    const isStoredCodeValid = user.otp.code === code && user.otp.expiresAt >= new Date();
    if (!isStoredCodeValid && !isDemoCodeAllowed) return res.status(400).json({ error: 'Invalid or expired OTP' });

    let isNew = !user.referralCode;
    if (isNew) {
      const settings = await getSettings();
      user.referralCode = 'REF' + Math.random().toString(36).slice(2, 8).toUpperCase();
      user.walletAddress = await generateDepositAddress();
      user.balance = settings.signupBonus;
      await Transaction.create({ user: user._id, type: 'signup_bonus', amount: settings.signupBonus, status: 'completed' });

      if (referralCode) {
        const referrer = await User.findOne({ referralCode });
        if (referrer && referrer._id.toString() !== user._id.toString()) {
          user.referredBy = referrer._id;
          // Only create the referral link here; bonus is granted on first deposit
          await Referral.create({ referrer: referrer._id, referred: user._id, reward: 0 });
        }
      }
    }
    user.otp = undefined;
    await user.save();
    await syncUserLevel(user);

    const token = sign(user._id.toString());
    const platformWalletAddress = await getPlatformDepositAddress();
    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name || user.email.split('@')[0],
        isAdmin: user.isAdmin,
        referralCode: user.referralCode,
        walletAddress: platformWalletAddress,
        platformWalletAddress,
        assetMode: (process.env.WALLET_ASSET_MODE || 'native').toLowerCase(),
        balance: user.balance,
      },
    });
  }
);

router.grantReferralBonus = grantReferralBonus;
module.exports = router;
