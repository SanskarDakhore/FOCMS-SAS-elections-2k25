import express from 'express';
import bcrypt from 'bcrypt';
import User from '../models/User.js';
import Vote from '../models/Vote.js';
import auth from '../middleware/auth.js';
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';

const router = express.Router();

function normalizeAcademicFields(data) {
    const program = data.program || /^(BBA|MBA)/i.exec(data.class || '')?.[1]?.toUpperCase();
    const semester = String(data.semester || '1').replace(/^Semester\s+/i, '');
    if (program && (!['BBA', 'MBA'].includes(program) ||
        !(program === 'BBA' ? ['1', '3', '5'] : ['1', '3']).includes(semester))) {
        throw new Error('FOCMS programs support BBA semesters 1, 3, 5 and MBA semesters 1, 3.');
    }
    return { program, semester, class: data.class || (program ? `${program}-Sem${semester}` : '') };
}

router.delete('/bulk/all', auth, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied' });
    await mongoose.connection.transaction(async session => {
        const students = await User.find({ role: 'student' }).session(session);
        await Vote.deleteMany({ userId: { $in: students.map(student => student.studentId) } }, { session });
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
        credentials.push({ studentId: student.studentId, name: student.name,
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

    const { studentId, name, password } = req.body;
    if (typeof studentId !== 'string' || !studentId.trim() || typeof name !== 'string' || !name.trim() ||
        (password !== undefined && typeof password !== 'string')) {
        return res.status(400).json({ msg: 'Student ID, name, and a text password are required.' });
    }

    try {
        let user = await User.findOne({ studentId });
        if (user) {
            return res.status(400).json({ msg: 'User already exists' });
        }

        user = new User({
            studentId,
            name,
            password: password || 'password123',
            ...normalizeAcademicFields(req.body),
            role: 'student'
        });

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);

        await user.save();
        const saved = user.toObject();
        delete saved.password;
        res.json(saved);
    } catch (err) {
        console.error(err.message);
        res.status(400).json({ msg: err.message });
    }
});

// PUT /api/users/:id — Admin: update a student
router.put('/:id', auth, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied' });
    const { name, password } = req.body;

    try {
        const userFields = {};
        if (name) userFields.name = name;
        if (req.body.class || req.body.program || req.body.semester) {
            Object.assign(userFields, normalizeAcademicFields(req.body));
        }
        if (password) {
            const salt = await bcrypt.genSalt(10);
            userFields.password = await bcrypt.hash(password, salt);
        }

        const user = await User.findOneAndUpdate(
            { studentId: req.params.id, role: 'student' },
            { $set: userFields },
            { returnDocument: 'after' }
        ).select('-password');

        if (!user) return res.status(404).json({ msg: 'User not found' });
        res.json(user);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// DELETE /api/users/:id — Admin: delete a student and their votes
router.delete('/:id', auth, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied' });
    try {
        let user;
        await mongoose.connection.transaction(async session => {
            user = await User.findOneAndDelete({ studentId: req.params.id, role: 'student' }, { session });
            if (user) await Vote.deleteMany({ userId: req.params.id }, { session });
        });
        if (!user) return res.status(404).json({ msg: 'User not found' });
        res.json({ msg: 'User and associated votes removed' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// DELETE /api/users/:id/votes — Admin: reset a student's vote (so they can vote again)
router.delete('/:id/votes', auth, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied' });
    try {
        let user;
        await mongoose.connection.transaction(async session => {
            user = await User.findOneAndUpdate({ studentId: req.params.id, role: 'student' },
                { hasVoted: false, voteTimestamp: null }, { returnDocument: 'after', session });
            if (user) await Vote.deleteMany({ userId: req.params.id }, { session });
        });
        if (!user) return res.status(404).json({ msg: 'User not found' });


        res.json({ msg: `Votes reset for student ${req.params.id}` });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

export default router;
