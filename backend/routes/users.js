import express from 'express';
import bcrypt from 'bcrypt';
import User from '../models/User.js';
import Vote from '../models/Vote.js';
import auth from '../middleware/auth.js';
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { generateVoterId, normalizeStudentName } from '../lib/studentIdentity.js';

const router = express.Router();

function normalizeAcademicFields(data) {
    const program = (data.program || /^(BBA|MBA)/i.exec(data.class || '')?.[1]?.toUpperCase() || '').trim();
    const semester = String(data.semester ?? '').replace(/^Semester\s+/i, '').trim() || '1';
    return { program, semester, class: data.class || (program ? `${program}-Sem${semester}` : '') };
}

function validateAcademicFields({ program, semester }) {
    const semesters = { BBA: ['1', '3', '5'], MBA: ['1', '3'] };
    if (program && !semesters[program]) return 'Program must be BBA or MBA.';
    if (program && !semesters[program].includes(semester)) {
        return `${program} does not support semester ${semester}.`;
    }
    return null;
}

async function resolveStudentAccount(id, session) {
    if (mongoose.isValidObjectId(id)) {
        const accountQuery = User.findOne({ _id: id, role: 'student' }).select('_id');
        if (session) accountQuery.session(session);
        const account = await accountQuery;
        if (account) return account;
    }
    const query = User.find({ studentId: id, role: 'student' }).select('_id').limit(2);
    if (session) query.session(session);
    const matches = await query;
    if (matches.length > 1) {
        const error = new Error('Student ID is shared; use the account ID to select one student.');
        error.status = 409;
        throw error;
    }
    return matches[0] || null;
}

router.delete('/bulk/all', auth, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied' });
    await mongoose.connection.transaction(async session => {
        const students = await User.find({ role: 'student' }).session(session);
        await Vote.deleteMany({ userId: { $in: students.map(student => String(student._id)) } }, { session });
        await User.deleteMany({ role: 'student' }, { session });
    });
    res.json({ msg: 'Students and their votes deleted; administrator accounts retained.' });
});

router.post('/bulk/reset-passwords', auth, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied' });
    const students = await User.find({ role: 'student' });
    const credentials = [];
    const updates = [];
    for (const student of students) {
        const password = randomBytes(9).toString('base64url');
        updates.push({ updateOne: { filter: { _id: student._id },
            update: { $set: { password: await bcrypt.hash(password, 12) } } } });
        credentials.push({ voterId: student.voterId, studentId: student.studentId, name: student.name,
            program: student.program, semester: student.semester, password });
    }
    if (updates.length) await User.bulkWrite(updates);
    res.json(credentials);
});

// GET /api/users — Admin: list all students
router.get('/', auth, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied' });
    try {
        const users = await User.find().select('-password');
        res.json(users);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// POST /api/users — Admin: create a student
router.post('/', auth, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied' });

    const { studentId, voterId: requestedVoterId, name, password } = req.body;
    if (typeof studentId !== 'string' || !studentId.trim() || typeof name !== 'string' || !name.trim() ||
        (password !== undefined && typeof password !== 'string') ||
        (requestedVoterId !== undefined &&
            (typeof requestedVoterId !== 'string' || !/^VTR-[A-F0-9]{24}$/.test(requestedVoterId)))) {
        return res.status(400).json({ msg: 'Student ID, name, and a text password are required.' });
    }

    try {
        const academicFields = normalizeAcademicFields(req.body);
        const academicError = validateAcademicFields(academicFields);
        if (academicError) return res.status(400).json({ msg: academicError });
        const nameKey = normalizeStudentName(name);
        const existingName = await User.exists({ role: 'student', nameKey });
        if (existingName) {
            return res.status(409).json({ msg: 'A student with the same name and surname already exists.' });
        }
        if (requestedVoterId && await User.exists({ role: 'student', voterId: requestedVoterId })) {
            return res.status(409).json({ msg: 'Voter ID is already assigned. Refresh the preview and try again.' });
        }

        const user = new User({
            studentId: studentId.trim(),
            voterId: requestedVoterId || generateVoterId(),
            name: name.trim(),
            nameKey,
            password: password || 'password123',
            ...academicFields,
            role: 'student'
        });

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);

        for (let attempt = 0; ; attempt++) {
            try {
                await user.save();
                break;
            } catch (err) {
                if (err.code !== 11000 || !err.keyPattern?.voterId || requestedVoterId || attempt >= 2) throw err;
                user.voterId = generateVoterId();
            }
        }
        const saved = user.toObject();
        delete saved.password;
        delete saved.nameKey;
        res.json(saved);
    } catch (err) {
        console.error(err.message);
        if (err.code === 11000 && err.keyPattern?.nameKey) {
            return res.status(409).json({ msg: 'A student with the same name and surname already exists.' });
        }
        res.status(400).json({ msg: err.message });
    }
});

// PUT /api/users/:id — Admin: update a student
router.put('/:id', auth, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied' });
    const { name, password } = req.body;
    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
        return res.status(400).json({ msg: 'Student name must be a non-empty string.' });
    }

    try {
        const userFields = {};
        if (name) {
            userFields.name = name.trim();
            userFields.nameKey = normalizeStudentName(name);
        }
        if (req.body.class || req.body.program || req.body.semester) {
            const academicFields = normalizeAcademicFields(req.body);
            const academicError = validateAcademicFields(academicFields);
            if (academicError) return res.status(400).json({ msg: academicError });
            Object.assign(userFields, academicFields);
        }
        if (password) {
            const salt = await bcrypt.genSalt(10);
            userFields.password = await bcrypt.hash(password, salt);
        }

        const account = await resolveStudentAccount(req.params.id);
        if (!account) return res.status(404).json({ msg: 'User not found' });
        const user = await User.findOneAndUpdate(
            { _id: account._id, role: 'student' },
            { $set: userFields },
            { returnDocument: 'after' }
        ).select('-password');

        if (!user) return res.status(404).json({ msg: 'User not found' });
        res.json(user);
    } catch (err) {
        console.error(err.message);
        if (err.status === 409) return res.status(409).json({ msg: err.message });
        if (err.code === 11000 && err.keyPattern?.nameKey) {
            return res.status(409).json({ msg: 'A student with the same name and surname already exists.' });
        }
        res.status(500).json({ msg: 'Server Error' });
    }
});

// DELETE /api/users/:id — Admin: delete a student and their votes
router.delete('/:id', auth, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied' });
    try {
        let user;
        await mongoose.connection.transaction(async session => {
            const account = await resolveStudentAccount(req.params.id, session);
            if (account) user = await User.findOneAndDelete({ _id: account._id, role: 'student' }, { session });
            if (user) await Vote.deleteMany({ userId: String(user._id) }, { session });
        });
        if (!user) return res.status(404).json({ msg: 'User not found' });
        res.json({ msg: 'User and associated votes removed' });
    } catch (err) {
        console.error(err.message);
        if (err.status === 409) return res.status(409).json({ msg: err.message });
        res.status(500).json({ msg: 'Server Error' });
    }
});

// DELETE /api/users/:id/votes — Admin: reset a student's vote (so they can vote again)
router.delete('/:id/votes', auth, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied' });
    try {
        let user;
        await mongoose.connection.transaction(async session => {
            const account = await resolveStudentAccount(req.params.id, session);
            if (account) user = await User.findOneAndUpdate({ _id: account._id, role: 'student' },
                { hasVoted: false, voteTimestamp: null }, { returnDocument: 'after', session });
            if (user) await Vote.deleteMany({ userId: String(user._id) }, { session });
        });
        if (!user) return res.status(404).json({ msg: 'User not found' });


        res.json({ msg: `Votes reset for student ${req.params.id}` });
    } catch (err) {
        console.error(err.message);
        if (err.status === 409) return res.status(409).json({ msg: err.message });
        res.status(500).json({ msg: 'Server Error' });
    }
});

export default router;
