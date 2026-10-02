export function isVotingActive(schedule, now = new Date()) {
    const start = new Date(schedule?.votingStart);
    const end = new Date(schedule?.votingEnd);
    return schedule?.isActive === true && Number.isFinite(start.getTime()) &&
        Number.isFinite(end.getTime()) && start < end && now >= start && now <= end;
}

export function validateBallot(ballot, positions, candidates, schedule, student) {
    if (!Array.isArray(ballot) || !positions.length || ballot.length !== positions.length) {
        throw new Error('Select exactly one candidate for every position.');
    }
    const positionIds = new Set(positions.map(position => String(position._id)));
    const seen = new Set();
    for (const vote of ballot) {
        if (!vote || typeof vote.positionId !== 'string' || typeof vote.candidateId !== 'string' ||
            !positionIds.has(vote.positionId) || seen.has(vote.positionId)) {
            throw new Error('Ballot contains an invalid or duplicate position.');
        }
        const candidate = candidates.find(item => String(item._id) === vote.candidateId &&
            String(item.positionId) === vote.positionId);
        if (!candidate) throw new Error('Candidate does not belong to the selected position.');
        if (schedule.enableDepartmentalVoting && !schedule.allowCrossDepartmentVoting &&
            candidate.class !== student.class) {
            throw new Error('Candidate is outside your eligible department.');
        }
        seen.add(vote.positionId);
    }
}
