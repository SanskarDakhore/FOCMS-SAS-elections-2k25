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
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(origin => origin.trim()).filter(Boolean);

const originMatches = (origin) => {
    if (!origin) return true;
    return allowedOrigins.some(pattern => {
        if (pattern === origin) return true;
        const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*');
        return new RegExp(`^${escaped}$`, 'i').test(origin);
    });
};

app.use(cors({
    origin: (origin, callback) => callback(null, originMatches(origin)),
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
