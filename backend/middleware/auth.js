import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { getJwtSecret } from '../config.js';
import mongoose from 'mongoose';

const auth = async (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ message: 'No token, authorization denied' });
    }

    try {
        const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
        const accountId = decoded.user?.id;
        let user = mongoose.isValidObjectId(accountId)
            ? await User.findById(accountId).select('-password')
            : null;
        if (!user && typeof accountId === 'string') {
            const legacyMatches = await User.find({ studentId: accountId }).select('-password').limit(2);
            if (legacyMatches.length === 1) user = legacyMatches[0];
        }
        if (!user || user.disabled) return res.status(401).json({ message: 'Account no longer exists or is disabled' });
        req.user = { id: String(user._id), studentId: user.studentId, name: user.name, role: user.role };
        next();
    } catch {
        res.status(401).json({ message: 'Token is not valid' });
    }
};

export default auth;
