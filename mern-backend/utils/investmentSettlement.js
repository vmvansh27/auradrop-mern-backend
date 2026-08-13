const Investment = require('../models/Investment');
const Transaction = require('../models/Transaction');
const User = require('../models/User');

async function settleDueInvestmentsForUser(userId) {
  const due = await Investment.find({
    user: userId,
    status: 'active',
    maturesAt: { $lte: new Date() },
  });
  if (due.length === 0) return 0;

  const user = await User.findById(userId);
  if (!user) return 0;

  for (const inv of due) {
    user.balance += inv.expectedReturn;
    user.invested -= inv.amount;
    user.profit += inv.expectedReturn - inv.amount;
    inv.status = 'matured';
    await inv.save();
    await Transaction.create({
      user: user._id,
      type: 'profit',
      amount: inv.expectedReturn - inv.amount,
      status: 'completed',
      note: `Investment matured. Principal ${inv.amount} and profit credited.`,
    });
  }
  await user.save();
  return due.length;
}

module.exports = {
  settleDueInvestmentsForUser,
};
