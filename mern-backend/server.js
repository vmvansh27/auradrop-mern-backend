require('dotenv').config();

process.on('uncaughtException', (error) => {
  console.log('Uncaught startup exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.log('Unhandled startup rejection:', error);
  process.exit(1);
});

const requiredEnv = ['MONGODB_URI', 'JWT_SECRET'];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length) {
  console.log(`Missing required environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
const { Server } = require('socket.io');
const connectDB = require('./config/db');
const { apiLimiter } = require('./middleware/rateLimit');

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://nova-frontend-jmwy.onrender.com',
  'http://localhost:8080',
  'http://localhost:8083',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:8083'
].filter(Boolean);
app.use(cors({ origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)), credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.use('/api', apiLimiter);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/user', require('./routes/user'));
app.use('/api/deposit', require('./routes/deposit'));
app.use('/api/withdraw', require('./routes/withdraw'));
app.use('/api/invest', require('./routes/invest'));
app.use('/api/referral', require('./routes/referral'));
app.use('/api/nft', require('./routes/nft'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/admin', require('./routes/admin'));

app.get('/health', (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.FRONTEND_URL || '*' } });
app.set('io', io);

io.on('connection', (s) => {
  console.log('socket connected:', s.id);
  s.on('subscribe', (userId) => s.join('user:' + userId));
});

const PORT = process.env.PORT || 5000;
console.log(`Starting API on port ${PORT}`);
connectDB().then(() => {
  server.listen(PORT, () => console.log(`API running on :${PORT}`));
}).catch((error) => {
  console.log('Failed to start API:', error);
  process.exit(1);
});
