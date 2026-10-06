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
const cleanOriginString = (val) => {
    if (!val || typeof val !== 'string') return '';
    let cleaned = val.trim().replace(/^['"`]|['"`]$/g, '');
    cleaned = cleaned.replace(/\/+$/, '');
    if ((cleaned.startsWith('http://') || cleaned.startsWith('https://')) && !cleaned.includes('*')) {
        try {
            const parsed = new URL(cleaned);
            cleaned = parsed.origin;
        } catch {
            // keep as is
        }
    }
    return cleaned.toLowerCase();
};

const getAllowedOrigins = () => {
    const rawEnv = [
        process.env.ALLOWED_ORIGINS,
        process.env.ALLOWED_ORIGIN,
        process.env.ALLOWED_URLS,
        process.env.ALLOWED_URL,
        process.env.CORS_ORIGIN,
        process.env.FRONTEND_URL,
        process.env.CLIENT_URL,
    ].filter(Boolean).join(',');

    return Array.from(new Set(
        rawEnv
            .split(/[,;\s]+/)
            .map(cleanOriginString)
            .filter(Boolean)
    ));
};

const originMatches = (origin) => {
    if (!origin) return true;
    const cleanOrigin = cleanOriginString(origin);
    const allowedOrigins = getAllowedOrigins();

    return allowedOrigins.some(pattern => {
        if (pattern === '*' || pattern === cleanOrigin) return true;

        if (!pattern.startsWith('http://') && !pattern.startsWith('https://')) {
            if (`https://${pattern}` === cleanOrigin || `http://${pattern}` === cleanOrigin) {
                return true;
            }
        }

        const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
        if (new RegExp(`^${escaped}$`, 'i').test(cleanOrigin)) return true;

        if (!pattern.startsWith('http://') && !pattern.startsWith('https://')) {
            const escapedWithProto = `https?:\\/\\/${escaped}`;
            if (new RegExp(`^${escapedWithProto}$`, 'i').test(cleanOrigin)) return true;
        }

        return false;
    });
};

const corsOptions = {
    origin: (origin, callback) => callback(null, originMatches(origin)),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    credentials: true,
    optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
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
