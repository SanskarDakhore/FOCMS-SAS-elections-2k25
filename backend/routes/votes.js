import express from 'express';
import Vote from '../models/Vote.js';
import User from '../models/User.js';
import Position from '../models/Position.js';
import Candidate from '../models/Candidate.js';
import auth from '../middleware/auth.js';
import mongoose from 'mongoose';
import Setting from '../models/Settings.js';
import VotingBatch from '../models/VotingBatch.js';
import { isVotingActive, validateBallot } from '../lib/voting.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();
const BATCH_ID = 'current';
const MAX_CONCURRENT_SUBMISSIONS = 100;
const BATCH_DURATION_MS = 5 * 60 * 1000; // 5 minutes open
const BATCH_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes cooldown
const ballotRateLimit = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    keyGenerator: req => req.user.id,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { msg: 'Too many ballot attempts. Please wait before retrying.' }
});

async function getOrCreateVotingBatch() {
    try {
        let batch = await VotingBatch.findOneAndUpdate(
            { _id: BATCH_ID },
            { $setOnInsert: { status: 'idle', userIds: [], activeSubmissions: 0, batchNumber: 0 } },
            { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
        );
        if (batch.status === 'open' && batch.openedAt && (Date.now() - batch.openedAt.getTime()) >= BATCH_DURATION_MS && batch.activeSubmissions === 0) {
            batch = await beginCooldown(batch.batchNumber) || batch;
        }
        return batch;
    } catch (error) {
        if (error.code !== 11000) throw error;
        let batch = await VotingBatch.findById(BATCH_ID);
        if (batch && batch.status === 'open' && batch.openedAt && (Date.now() - batch.openedAt.getTime()) >= BATCH_DURATION_MS && batch.activeSubmissions === 0) {
            batch = await beginCooldown(batch.batchNumber) || batch;
        }
        return batch;
    }
}

async function beginCooldown(batchNumber) {
    const now = new Date();
    return VotingBatch.findOneAndUpdate({ _id: BATCH_ID, batchNumber, status: 'open', activeSubmissions: 0 }, {
        $set: { status: 'cooldown', cooldownUntil: new Date(now.getTime() + BATCH_COOLDOWN_MS) }
    }, { returnDocument: 'after' });
}

async function releaseSubmission(batchNumber) {
    const batch = await VotingBatch.findOneAndUpdate({
        _id: BATCH_ID,
        batchNumber,
        activeSubmissions: { $gt: 0 }
    }, { $inc: { activeSubmissions: -1 } }, { returnDocument: 'after' });
    if (!batch || batch.status !== 'open' || batch.activeSubmissions !== 0) return;

    const remaining = await User.countDocuments({
        role: 'student',
        _id: { $in: batch.userIds },
        hasVoted: { $ne: true }
    });
    const expired = batch.openedAt && (Date.now() - batch.openedAt.getTime()) >= BATCH_DURATION_MS;
    if (remaining === 0 || expired) await beginCooldown(batchNumber);
}

function isAdmin(req, res) {
    if (req.user.role === 'admin') return true;
    res.status(403).json({ msg: 'Access denied' });
    return false;
}

router.get('/batch/status', auth, async (req, res) => {
    try {
        const [batch, schedule] = await Promise.all([
            getOrCreateVotingBatch(),
            Setting.findOne({ key: 'votingSchedule' })
        ]);
        res.json({
            status: batch.status,
            className: batch.className,
            openedAt: batch.openedAt,
            cooldownUntil: batch.cooldownUntil,
            allowed: req.user.role === 'student' && batch.status === 'open' &&
                batch.userIds.includes(req.user.id) && isVotingActive(schedule?.value)
        });
    } catch {
        res.status(500).json({ msg: 'Unable to load voting batch status.' });
    }
});

router.get('/batch', auth, async (req, res) => {
    if (!isAdmin(req, res)) return;
    try {
        const batch = await getOrCreateVotingBatch();
        const roster = batch.userIds.length
            ? await User.find({ _id: { $in: batch.userIds }, role: 'student' })
                .select('studentId name class hasVoted').lean()
            : [];
        res.json({ ...batch.toObject(), roster,
            remainingCount: roster.filter(student => !student.hasVoted).length });
    } catch {
        res.status(500).json({ msg: 'Unable to load voting batch.' });
    }
});

router.post('/batch', auth, async (req, res) => {
    if (!isAdmin(req, res)) return;
    const { className, userIds } = req.body || {};
    const uniqueUserIds = Array.isArray(userIds) ? [...new Set(userIds)] : [];
    if (typeof className !== 'string' || !className.trim() || !Array.isArray(userIds) ||
        userIds.length === 0 || uniqueUserIds.length !== userIds.length ||
        userIds.some(id => typeof id !== 'string' || !mongoose.isValidObjectId(id))) {
        return res.status(400).json({ msg: 'Choose a class and at least one unique, eligible student.' });
    }

    try {
        const schedule = await Setting.findOne({ key: 'votingSchedule' });
        if (!isVotingActive(schedule?.value)) {
            return res.status(409).json({ msg: 'Voting must be active before opening a class batch.' });
        }

        const selectedStudents = await User.find({ _id: { $in: uniqueUserIds }, role: 'student' })
            .select('studentId class hasVoted').lean();
        if (selectedStudents.length !== uniqueUserIds.length || selectedStudents.some(student =>
            student.class !== className || student.hasVoted)) {
            return res.status(400).json({ msg: 'A batch can only include unvoted students from the selected class.' });
        }

        const batch = await getOrCreateVotingBatch();
        if (batch.status === 'open' || batch.activeSubmissions > 0) {
            return res.status(409).json({ msg: 'Close the current batch before opening another.' });
        }
        if (batch.status === 'cooldown' && batch.cooldownUntil > new Date()) {
            const retryAfter = Math.ceil((batch.cooldownUntil - new Date()) / 1000);
            res.set('Retry-After', String(retryAfter));
            return res.status(429).json({ msg: 'Voting batch cooldown is in progress.', cooldownUntil: batch.cooldownUntil });
        }

        const update = await VotingBatch.findOneAndUpdate({
            _id: BATCH_ID,
            status: batch.status,
            activeSubmissions: 0,
            ...(batch.status === 'cooldown' ? { cooldownUntil: { $lte: new Date() } } : {})
        }, {
            $set: { status: 'open', className: className.trim(), userIds: uniqueUserIds,
                activeSubmissions: 0, openedAt: new Date(), cooldownUntil: null },
            $inc: { batchNumber: 1 }
        }, { returnDocument: 'after' });
        if (!update) return res.status(409).json({ msg: 'Voting batch changed. Refresh and try again.' });
        res.json({ msg: 'Class voting batch opened.', batchNumber: update.batchNumber });
    } catch (error) {
        console.error('Unable to open voting batch:', error);
        res.status(500).json({ msg: 'Unable to open voting batch.' });
    }
});

router.post('/batch/close', auth, async (req, res) => {
    if (!isAdmin(req, res)) return;
    try {
        const batch = await getOrCreateVotingBatch();
        if (batch.status !== 'open') return res.status(409).json({ msg: 'There is no open voting batch.' });
        if (batch.activeSubmissions > 0) {
            return res.status(409).json({ msg: 'Ballots are still being processed. Try closing the batch again shortly.' });
        }
        const closed = await beginCooldown(batch.batchNumber);
        if (!closed) return res.status(409).json({ msg: 'The batch changed. Refresh and try again.' });
        res.json({ msg: 'Batch closed. The two-minute cooldown has started.', cooldownUntil: closed.cooldownUntil });
    } catch {
        res.status(500).json({ msg: 'Unable to close voting batch.' });
    }
});

// PUBLIC — no auth required — used by landing page stats
router.get('/stats', async (req, res) => {
    try {
        const [totalVoters, totalVoted, totalVotes] = await Promise.all([
            User.countDocuments({ role: 'student' }),
            User.countDocuments({ role: 'student', hasVoted: true }),
            Vote.countDocuments()
        ]);
        const turnoutPercentage = totalVoters > 0
            ? parseFloat(((totalVoted / totalVoters) * 100).toFixed(1))
            : 0;
        res.json({ totalVoters, totalVoted, totalVotes, turnoutPercentage });
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

router.post('/', auth, ballotRateLimit, async (req, res) => {
    if (req.user.role !== 'student') return res.status(403).json({ msg: 'Only students can vote' });
    let reservedBatch;
    try {
        reservedBatch = await VotingBatch.findOneAndUpdate({
            _id: BATCH_ID,
            status: 'open',
            userIds: req.user.id,
            activeSubmissions: { $lt: MAX_CONCURRENT_SUBMISSIONS }
        }, { $inc: { activeSubmissions: 1 } }, { returnDocument: 'after' });

        if (!reservedBatch) {
            const batch = await getOrCreateVotingBatch();
            if (batch.status === 'open' && !batch.userIds.includes(req.user.id)) {
                return res.status(403).json({ msg: 'You are not included in the active voting batch.' });
            }
            if (batch.status === 'open' && batch.activeSubmissions >= MAX_CONCURRENT_SUBMISSIONS) {
                res.set('Retry-After', '1');
                return res.status(429).json({ msg: 'All 100 voting slots are busy. Please retry your ballot shortly.' });
            }
            if (batch.status === 'cooldown') {
                const retryAfter = Math.max(1, Math.ceil((batch.cooldownUntil - new Date()) / 1000));
                res.set('Retry-After', String(retryAfter));
                return res.status(423).json({ msg: 'Voting is in the two-minute batch cooldown.', cooldownUntil: batch.cooldownUntil });
            }
            return res.status(423).json({ msg: 'There is no active voting batch for you.' });
        }

        await mongoose.connection.transaction(async session => {
            const setting = await Setting.findOne({ key: 'votingSchedule' }).session(session);
            if (!isVotingActive(setting?.value)) throw new Error('Voting is not currently active.');
            const user = await User.findOne({ _id: req.user.id, role: 'student' }).session(session);
            if (!user || user.hasVoted) throw new Error('You have already voted or your account is unavailable.');
            if (user.class !== reservedBatch.className) throw new Error('Your class no longer matches this voting batch.');
            const positions = await Position.find().session(session);
            const candidates = await Candidate.find().session(session);
            validateBallot(req.body, positions, candidates, setting.value, user);
            const claimed = await User.updateOne({ _id: user._id, hasVoted: false },
                { $set: { hasVoted: true, voteTimestamp: new Date() } }, { session });
            if (claimed.modifiedCount !== 1) throw new Error('You have already voted.');
            await Vote.insertMany(req.body.map(vote => ({ userId: String(user._id),
                positionId: vote.positionId, candidateId: vote.candidateId, studentClass: user.class })), { session });
        });
        res.json({ msg: 'Votes submitted successfully' });
    } catch (error) {
        res.status(400).json({ msg: error.code === 11000 ? 'You have already voted.' : error.message });
    } finally {
        if (reservedBatch) {
            try {
                await releaseSubmission(reservedBatch.batchNumber);
            } catch (error) {
                console.error('Unable to release voting slot:', error);
            }
        }
    }
});

export default router;
