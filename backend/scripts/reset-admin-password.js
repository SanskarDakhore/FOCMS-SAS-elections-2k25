import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import '../config.js';
import User from '../models/User.js';

const identifier = process.argv[2];
const newPassword = process.argv[3];

if (!identifier || !newPassword) {
    console.error('Usage: node scripts/reset-admin-password.js <email_or_adminId> <new_password>');
    process.exit(1);
}

try {
    await mongoose.connect(process.env.MONGODB_URI);
    const hash = await bcrypt.hash(newPassword, 12);
    
    const result = await User.updateOne(
        { 
            role: 'admin', 
            $or: [{ email: identifier.toLowerCase() }, { studentId: identifier }] 
        },
        { 
            $set: { password: hash, passwordAlgorithm: 'bcrypt' },
            $unset: { passwordSalt: '' }
        }
    );

    if (result.matchedCount === 0) {
        console.log(`No admin found matching "${identifier}".`);
    } else {
        console.log(`Password successfully updated for ${identifier}`);
    }
} catch (err) {
    console.error('Error:', err.message);
} finally {
    await mongoose.disconnect();
}
