import express from 'express';
import Setting from '../models/Settings.js';
import auth from '../middleware/auth.js';

const router = express.Router();

router.get('/:key', async (req, res) => {
    try {
        const setting = await Setting.findOne({ key: req.params.key });
        if (!setting) return res.json({});
        res.json(setting.value);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.post('/', auth, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied' });

    const { key, value } = req.body;
    if (key === 'votingSchedule') {
        const start = new Date(value?.votingStart);
        const end = new Date(value?.votingEnd);
        if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end ||
            typeof value?.isActive !== 'boolean') {
            return res.status(400).json({ msg: 'Provide a valid voting start, end, and active flag.' });
        }
    }

    try {
        const setting = await Setting.findOneAndUpdate(
            { key },
            { value },
            { returnDocument: 'after', upsert: true }
        );
        res.json(setting);
    } catch (err) {
        res.status(500).send('Server Error: ' + err.message);
    }
});

export default router;
