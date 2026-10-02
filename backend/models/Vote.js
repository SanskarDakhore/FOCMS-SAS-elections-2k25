import mongoose from 'mongoose';

const voteSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    positionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Position', required: true },
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true },
    studentClass: { type: String },
    timestamp: { type: Date, default: Date.now }
});

voteSchema.index({ userId: 1, positionId: 1 }, { unique: true });

export default mongoose.model('Vote', voteSchema);
