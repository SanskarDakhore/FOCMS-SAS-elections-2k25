import './config.js';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import positionRoutes from './routes/positions.js';
import candidateRoutes from './routes/candidates.js';
import voteRoutes from './routes/votes.js';
import settingRoutes from './routes/settings.js';
import announcementRoutes from './routes/announcements.js';
import rateLimit from 'express-rate-limit';

const app = express();
app.set('trust proxy', 1);
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS ||
    'http://localhost:5173,http://127.0.0.1:5173').split(',').map(origin => origin.trim()));
const vercelPreviewOrigin = /^https:\/\/focms-sas-elections-2k25-[a-z0-9-]+-sanskar-dakhores-projects\.vercel\.app$/;

app.use(cors({
    origin: (origin, callback) => callback(null,
        !origin || allowedOrigins.has(origin) || vercelPreviewOrigin.test(origin)),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use('/api', rateLimit({
    windowMs: 60 * 1000,
    limit: 1200,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { msg: 'Too many requests. Please retry shortly.' }
}));
app.use(express.json({ limit: '1mb' }));
app.get('/api/health', (req, res) => res.json({
    status: 'ok',
    portal: 'FOCMS Election Portal',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
}));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/positions', positionRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/votes', voteRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/announcements', announcementRoutes);

export default app;
