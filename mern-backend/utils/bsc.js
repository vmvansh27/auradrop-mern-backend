const { ethers } = require('ethers');

const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL);
let adminSettingsModel;
const erc20Abi = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];
const transferTopic = ethers.id('Transfer(address,address,uint256)');

async function getAdminWalletAddress() {
  if (!adminSettingsModel) adminSettingsModel = require('../models/AdminSettings');
  const settings = await adminSettingsModel.findOne({ key: 'global' }).lean();
  const address = settings?.adminWallet || process.env.ADMIN_WALLET_ADDRESS;
  if (!address || !ethers.isAddress(address)) {
    throw new Error('Admin wallet address is missing or invalid');
  }
  return ethers.getAddress(address);
}

function validateTxHash(txHash) {
  if (typeof txHash !== 'string') {
    throw new Error('Transaction hash is required');
  }
  const normalized = txHash.trim();
  if (!/^0x[a-fA-F0-9]{64}$/.test(normalized)) {
    throw new Error('Invalid transaction hash format');
  }
  return normalized;
}

function getAssetMode() {
  return (process.env.WALLET_ASSET_MODE || 'native').toLowerCase();
}

function getTokenContract() {
  const address = process.env.TOKEN_CONTRACT_ADDRESS;
  if (!address || !ethers.isAddress(address)) {
    throw new Error('TOKEN_CONTRACT_ADDRESS is required when WALLET_ASSET_MODE=bep20');
  }
  return new ethers.Contract(address, erc20Abi, provider);
}

function getHotWallet() {
  const privateKey = process.env.HOT_WALLET_PRIVATE_KEY;
  if (!privateKey) throw new Error('HOT_WALLET_PRIVATE_KEY is required to approve withdrawals');
  return new ethers.Wallet(privateKey, provider);
}

async function getConfirmations(receipt) {
  const block = await provider.getBlockNumber();
  return Math.max(0, block - receipt.blockNumber + 1);
}

async function verifyNativeDeposit(txHash) {
  const normalizedHash = validateTxHash(txHash);
  const adminAddress = await getAdminWalletAddress();
  const tx = await provider.getTransaction(normalizedHash);
  if (!tx) return { ok: false, reason: 'tx not found' };
  const receipt = await provider.getTransactionReceipt(normalizedHash);
  if (!receipt || receipt.status !== 1) return { ok: false, reason: 'tx failed or pending' };
  const confirmations = await getConfirmations(receipt);
  if (confirmations < (+process.env.BSC_CONFIRMATIONS || 3)) {
    return { ok: false, reason: 'not enough confirmations' };
  }
  if (tx.to?.toLowerCase() !== adminAddress.toLowerCase()) {
    return { ok: false, reason: 'tx was not sent to the platform wallet' };
  }
  const value = Number(ethers.formatEther(tx.value));
  if (!Number.isFinite(value) || value <= 0) return { ok: false, reason: 'tx value is zero' };
  return {
    ok: true,
    assetMode: 'native',
    from: tx.from,
    to: tx.to,
    value,
    confirmations,
  };
}

async function verifyBep20Deposit(txHash) {
  const normalizedHash = validateTxHash(txHash);
  const adminAddress = await getAdminWalletAddress();
  const token = getTokenContract();
  const receipt = await provider.getTransactionReceipt(normalizedHash);
  if (!receipt || receipt.status !== 1) return { ok: false, reason: 'tx failed or pending' };
  const confirmations = await getConfirmations(receipt);
  if (confirmations < (+process.env.BSC_CONFIRMATIONS || 3)) {
    return { ok: false, reason: 'not enough confirmations' };
  }
  const tokenAddress = await token.getAddress();
  const iface = new ethers.Interface(erc20Abi);
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== tokenAddress.toLowerCase()) continue;
    if (log.topics[0] !== transferTopic) continue;
    const parsed = iface.parseLog(log);
    const to = parsed.args.to;
    if (to.toLowerCase() !== adminAddress.toLowerCase()) continue;
    const decimals = Number(process.env.TOKEN_DECIMALS || await token.decimals());
    const value = Number(ethers.formatUnits(parsed.args.value, decimals));
    if (!Number.isFinite(value) || value <= 0) continue;
    return {
      ok: true,
      assetMode: 'bep20',
      from: parsed.args.from,
      to,
      value,
      confirmations,
    };
  }
  return { ok: false, reason: 'no token transfer to platform wallet found' };
}

exports.getPlatformDepositAddress = getAdminWalletAddress;

exports.verifyDeposit = async (txHash) => {
  if (getAssetMode() === 'bep20') return verifyBep20Deposit(txHash);
  return verifyNativeDeposit(txHash);
};

exports.sendWithdrawal = async ({ to, amount }) => {
  if (!ethers.isAddress(to)) throw new Error('Invalid withdrawal address');
  const wallet = getHotWallet();
  if (getAssetMode() === 'bep20') {
    const token = getTokenContract().connect(wallet);
    const decimals = Number(process.env.TOKEN_DECIMALS || await token.decimals());
    const parsedAmount = ethers.parseUnits(String(amount), decimals);
    const tx = await token.transfer(to, parsedAmount);
    const receipt = await tx.wait(+process.env.BSC_CONFIRMATIONS || 1);
    return { hash: tx.hash, status: receipt.status === 1 ? 'processed' : 'failed' };
  }
  const tx = await wallet.sendTransaction({
    to,
    value: ethers.parseEther(String(amount)),
  });
  const receipt = await tx.wait(+process.env.BSC_CONFIRMATIONS || 1);
  return { hash: tx.hash, status: receipt.status === 1 ? 'processed' : 'failed' };
};

exports.generateDepositAddress = async () => getAdminWalletAddress();
