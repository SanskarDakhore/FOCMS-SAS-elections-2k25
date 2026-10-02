import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    studentId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    password: { type: String, required: true },
    passwordAlgorithm: { type: String, enum: ['bcrypt', 'firebase-scrypt'], default: 'bcrypt' },
    passwordSalt: { type: String, select: false },
    firebaseUid: { type: String, unique: true, sparse: true },
    email: { type: String, lowercase: true },
    disabled: { type: Boolean, default: false },
    role: { type: String, enum: ['student', 'admin'], default: 'student' },
    class: { type: String },
    program: { type: String, enum: ['BBA', 'MBA'] },
    semester: { type: String },
    hasVoted: { type: Boolean, default: false },
    voteTimestamp: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('User', userSchema);
