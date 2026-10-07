import User from '../models/User.js';
import Vote from '../models/Vote.js';
import VotingBatch from '../models/VotingBatch.js';
import { generateVoterId, normalizeStudentName } from './studentIdentity.js';

export async function migrateStudentIdentity() {
    const usersCollection = User.collection;
    const studentAccounts = await usersCollection.find(
        { role: 'student' },
        { projection: { _id: 1, studentId: 1, voterId: 1, name: 1 } }
    ).toArray();
    const accountByStudentId = new Map();
    const accountByName = new Map();

    for (const student of studentAccounts) {
        const nameKey = normalizeStudentName(student.name);
        if (!nameKey) throw new Error(`Student ${student._id} has no usable name.`);
        const sameName = accountByName.get(nameKey);
        if (sameName) {
            throw new Error(`Student identity migration stopped: duplicate normalized names exist (accounts ${sameName} and ${student._id}). Resolve these records before restarting.`);
        }
        accountByName.set(nameKey, String(student._id));

        const accounts = accountByStudentId.get(student.studentId) || [];
        accounts.push(student);
        accountByStudentId.set(student.studentId, accounts);
    }

    const migrations = User.db.db.collection('app_migrations');
    const migrationId = 'student-account-identity-v1';
    const migrationComplete = await migrations.findOne({ _id: migrationId });
    if (!migrationComplete) {
        for (const [studentId, accounts] of accountByStudentId) {
            if (accounts.length > 1 && await Vote.collection.countDocuments({ userId: studentId })) {
                throw new Error(`Student identity migration stopped: legacy votes for Student ID "${studentId}" cannot be assigned because it has multiple accounts.`);
            }
        }
    }

    const nameUpdates = studentAccounts.map(student => ({
        updateOne: {
            filter: { _id: student._id },
            update: { $set: {
                nameKey: normalizeStudentName(student.name),
                ...(!student.voterId ? { voterId: generateVoterId() } : {})
            } }
        }
    }));
    if (nameUpdates.length) await usersCollection.bulkWrite(nameUpdates);

    const indexes = await usersCollection.indexes();
    const uniqueStudentIdIndex = indexes.find(index =>
        index.unique && index.key?.studentId === 1
    );
    if (uniqueStudentIdIndex) await usersCollection.dropIndex(uniqueStudentIdIndex.name);
    await usersCollection.createIndex({ studentId: 1 }, { name: 'studentId_1' });
    await usersCollection.createIndex({ voterId: 1 }, {
        unique: true,
        partialFilterExpression: { role: 'student', voterId: { $type: 'string' } },
        name: 'student_voter_id_unique'
    });
    await usersCollection.createIndex({ nameKey: 1 }, {
        unique: true,
        partialFilterExpression: { role: 'student', nameKey: { $type: 'string' } },
        name: 'student_name_key_unique'
    });

    let migratedVotes = 0;
    if (!migrationComplete) {
        for (const [studentId, accounts] of accountByStudentId) {
            if (accounts.length !== 1) continue;
            const result = await Vote.collection.updateMany(
                { userId: studentId },
                { $set: { userId: String(accounts[0]._id) } }
            );
            migratedVotes += result.modifiedCount;
        }
    }

    const batch = !migrationComplete &&
        await VotingBatch.collection.findOne({ _id: 'current', studentIds: { $exists: true } });
    if (batch) {
        const userIds = [];
        let missingStudents = 0;
        for (const studentId of batch.studentIds || []) {
            const accounts = accountByStudentId.get(studentId) || [];
            if (accounts.length === 1) userIds.push(String(accounts[0]._id));
            else missingStudents++;
        }
        await VotingBatch.collection.updateOne(
            { _id: 'current' },
            { $set: { userIds: [...new Set(userIds)] }, $unset: { studentIds: '' } }
        );
        if (missingStudents) {
            console.warn(`Student identity migration removed ${missingStudents} stale or ambiguous voter(s) from the active batch.`);
        }
    }

    if (!migrationComplete) await migrations.insertOne({ _id: migrationId, completedAt: new Date() });
    console.log(`Student identity migration complete: ${studentAccounts.length} account(s), ${migratedVotes} vote record(s) reassigned.`);
}
