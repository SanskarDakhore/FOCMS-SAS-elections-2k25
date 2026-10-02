import express from 'express';
import Vote from '../models/Vote.js';
import User from '../models/User.js';
import Position from '../models/Position.js';
import Candidate from '../models/Candidate.js';
import auth from '../middleware/auth.js';
import mongoose from 'mongoose';
import Setting from '../models/Settings.js';
import { isVotingActive, validateBallot } from '../lib/voting.js';

const router = express.Router();

// PUBLIC — no auth required — used by landing page stats
router.get('/stats', async (req, res) => {
    try {
        const totalVoters = await User.countDocuments({ role: 'student' });
        const totalVoted = await User.countDocuments({ role: 'student', hasVoted: true });
        const turnoutPercentage = totalVoters > 0
            ? parseFloat(((totalVoted / totalVoters) * 100).toFixed(1))
            : 0;
        res.json({ totalVoters, totalVoted, turnoutPercentage });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// Results remain private to FOCMS election administrators.
router.get('/results', auth, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied' });
    try {
        const [positions, candidates] = await Promise.all([
            Position.find().lean(),
            Candidate.find().lean()
        ]);

        // Aggregate vote counts per candidate per position
        const voteCounts = await Vote.aggregate([
            {
                $group: {
                    _id: { positionId: '$positionId', candidateId: '$candidateId' },
                    count: { $sum: 1 }
                }
            }
        ]);

        // Build lookup maps
        const countMap = {};
        const totalByPosition = {};
        for (const vc of voteCounts) {
            const key = `${vc._id.positionId}_${vc._id.candidateId}`;
            countMap[key] = vc.count;
            const posKey = String(vc._id.positionId);
            totalByPosition[posKey] = (totalByPosition[posKey] || 0) + vc.count;
        }

        const results = positions.map(position => {
            const posId = String(position._id);
            const positionCandidates = candidates
                .filter(c => String(c.positionId) === posId)
                .map(c => {
                    const votes = countMap[`${posId}_${c._id}`] || 0;
                    const total = totalByPosition[posId] || 0;
                    return {
                        candidate: {
                            _id: c._id,
                            name: c.name,
                            class: c.class,
                            photoURL: c.photoURL || null
                        },
                        votes,
                        percentage: total > 0
                            ? parseFloat(((votes / total) * 100).toFixed(1))
                            : 0
                    };
                })
                .sort((a, b) => b.votes - a.votes);

            const winner = positionCandidates.length > 0 && positionCandidates[0].votes > 0
                ? positionCandidates[0]
                : null;

            return {
                position: { _id: position._id, id: position._id, name: position.name },
                winner,
                totalVotes: totalByPosition[posId] || 0,
                allCandidates: positionCandidates
            };
        }).filter(r => r.winner !== null);

        res.json(results);
    } catch (err) {
        console.error('Results error:', err);
        res.status(500).send('Server Error');
    }
});

// ADMIN ONLY — full raw vote records
router.get('/', auth, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied' });
    try {
        const votes = await Vote.find();
        res.json(votes);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.post('/', auth, async (req, res) => {
    if (req.user.role !== 'student') return res.status(403).json({ msg: 'Only students can vote' });
    try {
        await mongoose.connection.transaction(async session => {
            const setting = await Setting.findOne({ key: 'votingSchedule' }).session(session);
            if (!isVotingActive(setting?.value)) throw new Error('Voting is not currently active.');
            const user = await User.findOne({ studentId: req.user.id, role: 'student' }).session(session);
            if (!user || user.hasVoted) throw new Error('You have already voted or your account is unavailable.');
            const positions = await Position.find().session(session);
            const candidates = await Candidate.find().session(session);
            validateBallot(req.body, positions, candidates, setting.value, user);
            const claimed = await User.updateOne({ _id: user._id, hasVoted: false },
                { $set: { hasVoted: true, voteTimestamp: new Date() } }, { session });
            if (claimed.modifiedCount !== 1) throw new Error('You have already voted.');
            await Vote.insertMany(req.body.map(vote => ({ userId: user.studentId,
                positionId: vote.positionId, candidateId: vote.candidateId, studentClass: user.class })), { session });
        });
        res.json({ msg: 'Votes submitted successfully' });
    } catch (error) {
        res.status(400).json({ msg: error.code === 11000 ? 'You have already voted.' : error.message });
    }
});

export default router;
