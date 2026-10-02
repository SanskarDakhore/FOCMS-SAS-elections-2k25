import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import auth from '../middleware/auth.js';
import { getJwtSecret } from '../config.js';

const router = express.Router();

router.post('/login', async (req, res) => {
    const { studentId, password } = req.body;
    if (typeof studentId !== 'string' || typeof password !== 'string' || !password) {
        return res.status(400).json({ message: 'Student ID and password are required' });
    }
    try {
        const user = await User.findOne({ studentId: studentId.trim() });
        if (!user || !/^\$2[aby]\$/.test(user.password) || !await bcrypt.compare(password, user.password)) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        if (user.role === 'student' && user.hasVoted) {
            return res.status(403).json({ message: 'You have already voted and cannot login again' });
        }
        const profile = user.toObject();
        delete profile.password;
        const token = jwt.sign({ user: { id: user.studentId, role: user.role } }, getJwtSecret(), {
            expiresIn: '4h', algorithm: 'HS256',
        });
        res.json({ token, user: profile });
    } catch (error) {
        console.error('Login failed:', error.message);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/user', auth, async (req, res) => {
    const user = await User.findOne({ studentId: req.user.id }).select('-password');
    res.json(user);
});

export default router;
