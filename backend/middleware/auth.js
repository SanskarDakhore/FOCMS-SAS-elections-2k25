import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { getJwtSecret } from '../config.js';

const auth = async (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ message: 'No token, authorization denied' });
    }

    try {
        const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
        const user = await User.findOne({ studentId: decoded.user?.id }).select('-password');
        if (!user || user.disabled) return res.status(401).json({ message: 'Account no longer exists or is disabled' });
        req.user = { id: user.studentId, role: user.role };
        next();
    } catch {
        res.status(401).json({ message: 'Token is not valid' });
    }
};

export default auth;
