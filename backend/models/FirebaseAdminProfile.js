import mongoose from 'mongoose';

const schema = new mongoose.Schema({
    firestoreId: { type: String, required: true, unique: true },
    firebaseUid: String,
    email: String,
    name: String,
    role: String,
    createdAt: Date,
    status: { type: String, enum: ['active', 'alias', 'orphaned', 'disabled'], required: true },
    sourceDocument: { type: mongoose.Schema.Types.Mixed, select: false },
    importedAt: { type: Date, default: Date.now },
}, { collection: 'firebase_admin_profiles' });

export default mongoose.model('FirebaseAdminProfile', schema);
