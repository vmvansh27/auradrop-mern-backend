# Nova Crypto — MERN Backend

Companion backend for the Nova crypto investment frontend.

Detailed wallet, deposit, OTP, and transaction debugging notes are stored at:

- `C:\Users\vansh\Desktop\crypto-project-v1\PROJECT_DEBUG_QA.md`

## Stack
Node + Express + MongoDB (Mongoose) + Socket.io + ethers.js (BEP20) + Nodemailer (Gmail OTP) + JWT.

## Folder structure
```
config/      MongoDB connection
models/      User, Investment, Transaction, Withdrawal, Referral, NFT, AdminSettings, WalletLog
middleware/  auth, admin, rate-limit
routes/      auth, user, deposit, withdraw, invest, referral, nft, transactions, admin
utils/       jwt, otp, mailer, bsc (on-chain verification)
server.js    Express + Socket.io entrypoint
```

## Setup
```bash
cp .env.example .env   # fill in MongoDB, SMTP, BSC RPC
npm install
npm run dev            # starts on :5000
```

## Key endpoints
- `POST /api/auth/request-otp`  body: { email }
- `POST /api/auth/verify-otp`   body: { email, code, referralCode? } → { token, user }
- `GET  /api/user/me`           (auth)
- `GET  /api/deposit/address`   (auth) → assigned BEP20 address
- `POST /api/deposit/confirm`   (auth) body: { hash } → verifies on-chain
- `POST /api/withdraw`          (auth) body: { amount, address }
- `POST /api/invest`            (auth) body: { amount }  — enforces 12 PM / 5 PM window
- `POST /api/invest/run-maturity-cron`  header: x-cron-key — matures investments at 6 AM
- `GET  /api/transactions?type=deposit|withdraw|...` (auth)
- `GET  /api/nft`, `POST /api/nft/buy/:id` (auth)
- `GET  /api/referral/mine`     (auth)
- Admin (auth + isAdmin): `/api/admin/users`, `/api/admin/withdrawals`, `/api/admin/withdrawals/:id/approve|reject`, `/api/admin/settings`, `/api/admin/analytics`

## Realtime
Socket.io emits `deposit` events to room `user:<userId>`. Subscribe from frontend:
```js
socket.emit('subscribe', userId)
socket.on('deposit', tx => ...)
```

## Investment ROI logic
Configurable per `AdminSettings.defaultRoi`. Investments mature at next-day 6 AM via the maturity cron route (call it from any scheduler hitting `/api/invest/run-maturity-cron` every minute with header `x-cron-key: <JWT_SECRET>`).

## On-chain deposits
`utils/bsc.js#verifyDeposit(txHash)` checks the tx on BSC, validates recipient, requires `BSC_CONFIRMATIONS`. For production, replace `generateDepositAddress` with HD-wallet derivation and run a sweeper that forwards funds to `ADMIN_WALLET_ADDRESS`.

## Security
- Helmet, CORS, rate-limit (global + stricter OTP), express-validator on all inputs.
- JWT auth, admin middleware, anti-replay on deposit hashes (unique index).
- Never commit `.env`.

## Deployment
- DB: MongoDB Atlas
- API: Render / Railway / Fly.io (Node) — set env vars from `.env.example`
- Cron: render.com cron job, GitHub Actions, or `node-cron` hitting `/api/invest/run-maturity-cron`
- Frontend: deploy the Lovable project; set `VITE_API_URL=https://<api-domain>` and point `fetch` calls at it.
