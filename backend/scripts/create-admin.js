import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import '../config.js';
import User from '../models/User.js';

try {
    const studentId = process.env.ADMIN_ID;
    const password = process.env.ADMIN_PASSWORD;
    if (!studentId || !password || password.length < 6) {
        throw new Error('Set ADMIN_ID and ADMIN_PASSWORD (at least 6 characters) before running create-admin.');
    }
    if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI in backend/.env.');
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    if (await User.exists({ studentId })) throw new Error('This account already exists; no account was changed.');
    await User.create({ studentId, name: process.env.ADMIN_NAME || 'FOCMS Election Administrator',
        password: await bcrypt.hash(password, 10), role: 'admin' });
    console.log('FOCMS administrator created. Sign in using the configured Admin ID.');
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
} finally {
    await mongoose.disconnect();
}
