import mongoose from 'mongoose';
import { generateVoterId } from '../lib/studentIdentity.js';

const userSchema = new mongoose.Schema({
    studentId: { type: String, required: true },
    voterId: { type: String, required: function () { return this.role === 'student'; } },
    nameKey: { type: String, select: false },
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

userSchema.index({ studentId: 1 });
userSchema.index({ voterId: 1 }, {
    unique: true,
    partialFilterExpression: { role: 'student', voterId: { $type: 'string' } },
    name: 'student_voter_id_unique'
});
userSchema.index({ nameKey: 1 }, {
    unique: true,
    partialFilterExpression: { role: 'student', nameKey: { $type: 'string' } },
    name: 'student_name_key_unique'
});
userSchema.pre('validate', function () {
    if (this.role === 'student') {
        this.nameKey = String(this.name ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
        if (!this.voterId) this.voterId = generateVoterId();
    }
});

export default mongoose.model('User', userSchema);
