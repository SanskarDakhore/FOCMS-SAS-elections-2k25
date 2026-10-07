import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import auth from '../middleware/auth.js';
import { getJwtSecret } from '../config.js';
import { verifyFirebasePassword } from '../lib/firebaseCredentials.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();
const loginRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    keyGenerator: req => String(req.body?.voterId || req.body?.studentId || 'unknown').trim().toLowerCase(),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Too many login attempts for this account. Try again in 15 minutes.' }
});

router.post('/login', loginRateLimit, async (req, res) => {
    const { voterId, studentId, password } = req.body;
    const isStudentLogin = typeof voterId === 'string' && voterId.trim();
    const loginId = isStudentLogin ? voterId.trim().toUpperCase() : studentId;
    if (typeof loginId !== 'string' || !loginId.trim() || typeof password !== 'string' || !password) {
        return res.status(400).json({ message: 'Voter ID (students) or admin ID, and password are required' });
    }
    try {
        const id = loginId.trim();
        const user = isStudentLogin
            ? await User.findOne({ role: 'student', voterId: id }).select('+passwordSalt')
            : await User.findOne({ role: 'admin', $or: [
                { studentId: id }, { email: id.toLowerCase() },
            ] }).select('+passwordSalt');
        if (!user || user.disabled) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        const valid = user.passwordAlgorithm === 'firebase-scrypt'
            ? user.role === 'admin' && await verifyFirebasePassword(password, user.password, user.passwordSalt)
            : /^\$2[aby]\$/.test(user.password) && await bcrypt.compare(password, user.password);
        if (!valid) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        if (user.passwordAlgorithm === 'firebase-scrypt') {
            const hash = await bcrypt.hash(password, 12);
            // A simultaneous password change must win over migration of an older credential.
            const updated = await User.updateOne({ _id: user._id, disabled: { $ne: true },
                password: user.password, passwordAlgorithm: 'firebase-scrypt' },
            { $set: { password: hash, passwordAlgorithm: 'bcrypt' }, $unset: { passwordSalt: '' } });
            if (!updated.modifiedCount) return res.status(400).json({ message: 'Please sign in again.' });
        }
        if (user.role === 'student' && user.hasVoted) {
            return res.status(403).json({ message: 'You have already voted and cannot login again' });
        }
        const profile = user.toObject();
        delete profile.password;
        delete profile.passwordSalt;
        const token = jwt.sign({ user: { id: String(user._id), role: user.role } }, getJwtSecret(), {
            expiresIn: '4h', algorithm: 'HS256',
        });
        res.json({ token, user: profile });
    } catch (error) {
        console.error('Login failed:', error.message);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/user', auth, async (req, res) => {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
});

export default router;
