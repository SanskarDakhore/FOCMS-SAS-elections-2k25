import test from 'node:test';
import assert from 'node:assert/strict';
import { isVotingActive } from '../lib/voting.js';
import { getVotingStatus } from '../../frontend/src/utils/votingSchedule.js';

const start = '2026-10-02T03:30:00Z';
const end = '2026-10-02T11:30:00Z';
const schedule = { votingStart: start, votingEnd: end, isActive: true };

test('frontend and backend enforce the same schedule boundaries and manual close', () => {
    for (const [time, status] of [
        ['2026-10-02T03:29:59Z', 'not_started'], [start, 'active'], [end, 'active'],
        ['2026-10-02T11:30:01Z', 'ended'],
    ]) {
        assert.equal(getVotingStatus(schedule, new Date(time)).status, status);
        assert.equal(isVotingActive(schedule, new Date(time)), status === 'active');
    }
    const paused = { ...schedule, isActive: false };
    assert.equal(getVotingStatus(paused, new Date(start)).status, 'disabled');
    assert.equal(isVotingActive(paused, new Date(start)), false);
    for (const invalid of [null, {}, { ...schedule, votingEnd: start }, { ...schedule, votingStart: 'invalid' }]) {
        assert.equal(getVotingStatus(invalid).status, 'not_scheduled');
        assert.equal(isVotingActive(invalid), false);
    }
});
