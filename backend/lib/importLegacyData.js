import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import User from '../models/User.js';
import Position from '../models/Position.js';
import Candidate from '../models/Candidate.js';
import Vote from '../models/Vote.js';
import Setting from '../models/Settings.js';

function mongoId(collection, id) {
    if (typeof id !== 'string' || !id) throw new Error(`${collection} entry requires a Firestore document id.`);
    return new mongoose.Types.ObjectId(createHash('sha256').update(`${collection}/${id}`).digest('hex').slice(0, 24));
}

function timestamp(value) {
    if (!value) return null;
    const seconds = value.seconds ?? value._seconds;
    const date = seconds !== undefined ? new Date(Number(seconds) * 1000) : new Date(value);
    if (!Number.isFinite(date.getTime())) throw new Error('Invalid legacy timestamp.');
    return date;
}

export async function importLegacyData(data, connection) {
    const sources = { users: User, positions: Position, candidates: Candidate, votes: Vote, settings: Setting };
    const models = {};
    for (const [key, source] of Object.entries(sources)) {
        if (!Array.isArray(data[key] || [])) throw new Error(`${key} must be an array.`);
        models[key] = connection.models[source.modelName] || connection.model(source.modelName, source.schema);
        await models[key].init();
        if (await models[key].exists(key === 'users' ? { role: 'student' } : {})) {
            throw new Error('Import requires an empty target database for election data; administrators may already exist.');
        }
    }
    const rows = { users: [], positions: [], candidates: [], votes: [], settings: [] };
    for (const user of data.users || []) {
        const password = user.password;
        if (typeof password !== 'string' || !password) throw new Error('Every legacy student needs a password.');
        rows.users.push({ studentId: String(user.studentId || user.id), name: user.name,
            password: /^\$2[aby]\$/.test(password) ? password : await bcrypt.hash(password, 12),
            role: 'student', program: user.program, class: user.class,
            semester: String(user.semester || '1').replace(/^Semester\s+/i, ''),
            hasVoted: user.hasVoted === true, voteTimestamp: timestamp(user.voteTimestamp) });
    }
    const positions = new Set((data.positions || []).map(item => item.id));
    const candidates = new Map((data.candidates || []).map(item => [item.id, item]));
    const students = new Set(rows.users.map(user => user.studentId));
    for (const position of data.positions || []) {
        rows.positions.push({ _id: mongoId('positions', position.id), name: position.name,
            description: position.description });
    }
    for (const candidate of data.candidates || []) {
        if (!positions.has(candidate.positionId)) throw new Error('Candidate refers to an unknown position.');
        rows.candidates.push({ _id: mongoId('candidates', candidate.id), name: candidate.name,
            class: candidate.class, positionId: mongoId('positions', candidate.positionId),
            bio: candidate.bio, photoURL: candidate.photoURL });
    }
    for (const vote of data.votes || []) {
        if (!students.has(vote.voterId) || !positions.has(vote.positionId) ||
            candidates.get(vote.candidateId)?.positionId !== vote.positionId) {
            throw new Error('Vote refers to an unknown student, position, or mismatched candidate.');
        }
        rows.votes.push({ userId: vote.voterId, positionId: mongoId('positions', vote.positionId),
            candidateId: mongoId('candidates', vote.candidateId), timestamp: timestamp(vote.timestamp) || new Date() });
        const student = rows.users.find(user => user.studentId === vote.voterId);
        student.hasVoted = true;
    }
    for (const setting of data.settings || []) {
        if (setting.id === 'electionConfig') {
            const value = { ...setting };
            delete value.id;
            value.votingStart = timestamp(value.votingStart)?.toISOString();
            value.votingEnd = timestamp(value.votingEnd)?.toISOString();
            rows.settings.push({ key: 'votingSchedule', value });
        }
    }
    await connection.transaction(async session => {
        for (const [key, model] of Object.entries(models)) {
            if (await model.exists(key === 'users' ? { role: 'student' } : {}).session(session)) {
                throw new Error('Target election data is no longer empty.');
            }
            if (rows[key].length) await model.insertMany(rows[key], { session });
        }
    });
    return Object.fromEntries(Object.entries(rows).map(([key, entries]) => [key, entries.length]));
}
