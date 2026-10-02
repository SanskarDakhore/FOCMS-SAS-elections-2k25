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

const app = express();
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS ||
    'http://localhost:5173,http://127.0.0.1:5173').split(',').map(origin => origin.trim()));

app.use(cors({
    origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '1mb' }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', portal: 'FOCMS Election Portal' }));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/positions', positionRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/votes', voteRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/announcements', announcementRoutes);

export default app;
