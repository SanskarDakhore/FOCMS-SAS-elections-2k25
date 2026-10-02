export function getVotingStatus(schedule, now = new Date()) {
    const start = schedule?.votingStart ? new Date(schedule.votingStart) : null;
    const end = schedule?.votingEnd ? new Date(schedule.votingEnd) : null;
    if (!start || !end || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
        return { status: 'not_scheduled', message: 'No election scheduled.' };
    }
    const times = { startTime: start, endTime: end };
    if (now < start) return { ...times, status: 'not_started', message: 'Voting has not started yet.',
        countdown: true, timeRemaining: start.getTime() - now.getTime() };
    if (now > end) return { ...times, status: 'ended', message: 'Voting period has ended.', countdown: false };
    if (schedule.isActive !== true) return { ...times, status: 'disabled',
        message: 'Voting is currently disabled by the administrator.', countdown: false };
    return { ...times, status: 'active', message: 'Voting is currently active!',
        countdown: true, timeRemaining: end.getTime() - now.getTime() };
}
