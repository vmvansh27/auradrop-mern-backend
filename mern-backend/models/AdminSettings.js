const { Schema, model } = require('mongoose');

const levelSchema = new Schema({
  key: { type: String, required: true },
  name: { type: String, required: true },

  minWalletBalance: { type: Number, default: 0 },
  maxInvest: { type: Number, default: 0 },

  roi: { type: Number, default: 1.5 },

  requiredDirectReferrals: { type: Number, default: 0 },
  requiredTeamReferrals: { type: Number, default: 0 },

  directReferralPercent: { type: Number, default: 10 },
  tierBReferralPercent: { type: Number, default: 3 },
  tierCReferralPercent: { type: Number, default: 2 },
}, { _id: false });

module.exports = model('AdminSettings', new Schema({
  key: { type: String, unique: true },
  defaultRoi: { type: Number, default: 1.5 },
  referralBonusPercent: { type: Number, default: 5 },
  signupBonus: { type: Number, default: 5 },
  investmentMinAmount: { type: Number, default: 10 },
  withdrawalFeePercent: { type: Number, default: 0 },
  adminWallet: String,
  levelConfigs: {
    type: [levelSchema],
    default: () => [
      { key: 'level_1', name: 'Level 1', minWalletBalance: 25, roi: 1.5, maxInvest: 489, requiredDirectReferrals: 0, requiredTeamReferrals: 0, directReferralPercent: 10, tierBReferralPercent: 3, tierCReferralPercent: 2 },
      { key: 'level_2', name: 'Level 2', minWalletBalance: 490, roi: 1.8, maxInvest: 1899, requiredDirectReferrals: 3, requiredTeamReferrals: 5, directReferralPercent: 10, tierBReferralPercent: 3, tierCReferralPercent: 2 },
      { key: 'level_3', name: 'Level 3', minWalletBalance: 1900, roi: 2.0, maxInvest: 4899, requiredDirectReferrals: 6, requiredTeamReferrals: 18, directReferralPercent: 10, tierBReferralPercent: 3, tierCReferralPercent: 2 },
      { key: 'level_4', name: 'Level 4', minWalletBalance: 4900, roi: 2.3, maxInvest: 8999, requiredDirectReferrals: 16, requiredTeamReferrals: 37, directReferralPercent: 10, tierBReferralPercent: 3, tierCReferralPercent: 2 },
      { key: 'level_5', name: 'Level 5', minWalletBalance: 9000, roi: 2.5, maxInvest: 28999, requiredDirectReferrals: 25, requiredTeamReferrals: 64, directReferralPercent: 10, tierBReferralPercent: 3, tierCReferralPercent: 2 },
      { key: 'level_6', name: 'Level 6', minWalletBalance: 29000, roi: 2.8, maxInvest: 48999, requiredDirectReferrals: 35, requiredTeamReferrals: 144, directReferralPercent: 10, tierBReferralPercent: 3, tierCReferralPercent: 2 },
      { key: 'level_7', name: 'Level 7', minWalletBalance: 49000, roi: 3.0, maxInvest: 79999, requiredDirectReferrals: 46, requiredTeamReferrals: 284, directReferralPercent: 10, tierBReferralPercent: 3, tierCReferralPercent: 2 },
      { key: 'vip_8', name: 'VIP Level 8', minWalletBalance: 99999, roi: 3.5, maxInvest: 999999999, requiredDirectReferrals: 125, requiredTeamReferrals: 1000, directReferralPercent: 10, tierBReferralPercent: 3, tierCReferralPercent: 2 },
    ],
  },
}, { timestamps: true }));
