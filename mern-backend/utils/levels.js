const User = require('../models/User');
const AdminSettings = require('../models/AdminSettings');

async function getSettings() {
  return (await AdminSettings.findOne({ key: 'global' })) || await AdminSettings.create({ key: 'global' });
}

async function buildDownlineMap(rootUserId) {
  const allUsers = await User.find({ referredBy: { $exists: true, $ne: null } }).select('_id referredBy');
  const childrenByParent = new Map();
  for (const user of allUsers) {
    const parentId = user.referredBy?.toString();
    if (!parentId) continue;
    const list = childrenByParent.get(parentId) || [];
    list.push(user._id.toString());
    childrenByParent.set(parentId, list);
  }

  const directChildren = childrenByParent.get(rootUserId.toString()) || [];
  let deeperCount = 0;
  const queue = [...directChildren];
  while (queue.length > 0) {
    const currentId = queue.shift();
    const children = childrenByParent.get(currentId) || [];
    deeperCount += children.length;
    queue.push(...children);
  }

  return {
    directCount: directChildren.length,
    teamCount: directChildren.length + deeperCount,
    deeperCount,
  };
}

async function resolveUserLevel(user) {
  const settings = await getSettings();
  const metrics = await buildDownlineMap(user._id);
  const sortedLevels = [...(settings.levelConfigs || [])].sort((a, b) => a.minWalletBalance - b.minWalletBalance);
  let current = sortedLevels[0] || {
    key: 'level_1',
    name: 'Level 1',
    minWalletBalance: 0,
    maxInvest: Infinity,
    requiredDirectReferrals: 0,
    requiredTeamReferrals: 0,
    directReferralPercent: 10,
    tierBReferralPercent: 3,
    tierCReferralPercent: 2,
  };

  for (const level of sortedLevels) {
    const qualifies =
      user.balance >= level.minWalletBalance &&
      metrics.directCount >= level.requiredDirectReferrals &&
      metrics.deeperCount >= level.requiredTeamReferrals;
    if (qualifies) current = level;
  }

  return { level: current, metrics, settings };
}

async function syncUserLevel(user) {
  const { level, metrics, settings } = await resolveUserLevel(user);
  if (user.currentLevel !== level.name) {
    user.currentLevel = level.name;
    await user.save();
  }
  return { level, metrics, settings };
}

module.exports = {
  getSettings,
  buildDownlineMap,
  resolveUserLevel,
  syncUserLevel,
};
