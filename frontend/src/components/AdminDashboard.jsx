import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';
import * as XLSX from 'xlsx';
import { Menu } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';
import { getVotingStatus } from '../utils/votingSchedule';

// New Modular Components
import AdminSidebar from './admin/AdminSidebar';
import AdminOverview from './admin/AdminOverview';
import AdminManage from './admin/AdminManage';
import AdminSchedule from './admin/AdminSchedule';
import AdminResults from './admin/AdminResults';
import AdminAnnouncements from './admin/AdminAnnouncements';
import AdminModal from './admin/AdminModal';
import StudentImportPreviewModal from './admin/StudentImportPreviewModal';
import { generateVoterId, normalizeStudentName } from '../utils/studentName';

const AdminDashboard = () => {
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Data State
  const [positions, setPositions] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [students, setStudents] = useState([]);
  const [votes, setVotes] = useState([]);
  const [liveVoteStats, setLiveVoteStats] = useState(null);
  const [electionResults, setElectionResults] = useState([]); // pre-computed server-side results
  const [votingBatch, setVotingBatch] = useState(null);

  // Schedule State
  const [votingSchedule, setVotingSchedule] = useState({
    votingStart: '',
    votingEnd: '',
    isActive: false,
    enableDepartmentalVoting: false,
    allowCrossDepartmentVoting: true
  });
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('position'); // 'position', 'candidate', 'student'
  const [editItem, setEditItem] = useState(null);

  // Import Preview State
  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [importPreviewStudents, setImportPreviewStudents] = useState([]);
  const [importPreviewExistingStudentNames, setImportPreviewExistingStudentNames] = useState(new Set());
  const [recentlyImportedCredentials, setRecentlyImportedCredentials] = useState([]);

  // --- Data Loading & Effects ---

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [scheduleRes, positionsRes, candidatesRes, usersRes, votesRes, resultsRes, voteStatsRes, batchRes] = await Promise.allSettled([
        api.get('/settings/votingSchedule'),
        api.get('/positions'),
        api.get('/candidates'),
        api.get('/users'),
        api.get('/votes'),
        api.get('/votes/results'), // server-side pre-computed results (no ID comparison needed)
        api.get('/votes/stats'),
        api.get('/votes/batch')
      ]);

      // 1. Schedule
      if (scheduleRes.status === 'fulfilled' && scheduleRes.value.data) {
        setVotingSchedule(scheduleRes.value.data);
      }

      // 2. Positions
      if (positionsRes.status === 'fulfilled') setPositions(positionsRes.value.data);

      // 3. Candidates
      if (candidatesRes.status === 'fulfilled') setCandidates(candidatesRes.value.data);

      // 4. Students
      if (usersRes.status === 'fulfilled') {
        const allUsers = usersRes.value.data;
        setStudents(allUsers.filter(u => u.role === 'student'));
      }

      // 5. Raw votes (used for stats count)
      if (votesRes.status === 'fulfilled') setVotes(votesRes.value.data);

      // 6. Pre-computed results (server-side aggregated, no client ID comparison)
      if (resultsRes.status === 'fulfilled') setElectionResults(resultsRes.value.data);
      else console.error('Results fetch failed:', resultsRes.reason);

      if (voteStatsRes.status === 'fulfilled') setLiveVoteStats(voteStatsRes.value.data);
      if (batchRes.status === 'fulfilled') setVotingBatch(batchRes.value.data);

    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const refreshVotingBatch = async () => {
    const response = await api.get('/votes/batch');
    const batch = response.data;
    setVotingBatch(batch);
    if (batch.roster?.length) {
      const rosterById = new Map(batch.roster.map(student => [student._id, student]));
      setStudents(current => current.map(student => {
        const rosterStudent = rosterById.get(student._id);
        return rosterStudent ? { ...student, hasVoted: rosterStudent.hasVoted } : student;
      }));
    }
    return batch;
  };

  useEffect(() => {
    const intervalId = setInterval(() => {
      refreshVotingBatch().catch(() => {});
    }, 5000);
    return () => clearInterval(intervalId);
  }, []);

  const openVotingBatch = async (batch) => {
    await api.post('/votes/batch', batch);
    await refreshVotingBatch();
  };

  const closeVotingBatch = async () => {
    await api.post('/votes/batch/close');
    await refreshVotingBatch();
  };

  const votingStatus = getVotingStatus(votingSchedule);

  useEffect(() => {
    if (loading || votingStatus.status !== 'active') return undefined;

    let cancelled = false;
    const refreshLiveStats = async () => {
      const statsRes = await api.get('/votes/stats').catch(() => null);
      if (cancelled) return;
      if (statsRes) setLiveVoteStats(statsRes.data);
    };

    refreshLiveStats();
    const intervalId = setInterval(refreshLiveStats, 10000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [loading, votingStatus.status]);

  useEffect(() => {
    if (loading || !['ended', 'disabled'].includes(votingStatus.status)) return;

    api.get('/votes/results')
      .then(response => setElectionResults(response.data))
      .catch(error => console.error('Final results refresh failed:', error));
  }, [loading, votingStatus.status]);

  // --- Computed Stats ---
  const stats = useMemo(() => {
    const totalStudents = liveVoteStats?.totalVoters ?? students.length;
    // Check hasVoted flag. If users API returns it.
    const votedStudents = liveVoteStats?.totalVoted ?? students.filter(s => s.hasVoted).length;
    const totalVotes = liveVoteStats?.totalVotes ?? votes.length;
    const votingPercentage = liveVoteStats?.turnoutPercentage ?? (totalStudents > 0 ? (votedStudents / totalStudents * 100).toFixed(1) : 0);

    return { totalStudents, votedStudents, totalVotes, votingPercentage };
  }, [students, votes, liveVoteStats]);

  // --- Handlers: Auth ---
  const handleLogout = async () => {
    logout();
  };

  // --- Handlers: Positions ---
  const handleAddPosition = async (formData) => {
    try {
      await api.post('/positions', formData);
      setShowModal(false);
      loadData();
    } catch (error) {
      console.error("Error adding position:", error);
      alert("Error adding position");
    }
  };

  const handleEditPosition = async (formData) => {
    if (!editItem) return;
    try {
      // Need ID. editItem has it.
      await api.put(`/positions/${editItem._id || editItem.id}`, formData);
      setShowModal(false);
      loadData();
    } catch (error) {
      console.error("Error updating position:", error);
      alert("Error updating position");
    }
  };

  const handleDeletePosition = async (id) => {
    if (!confirm('Are you sure? This will delete the position and all associated candidates.')) return;
    try {
      await api.delete(`/positions/${id}`);
      loadData();
    } catch (error) {
      console.error("Error deleting position:", error);
    }
  };

  // --- Handlers: Candidates ---
  const handleAddCandidate = async (formData) => {
    try {
      await api.post('/candidates', formData);
      setShowModal(false);
      loadData();
    } catch (error) {
      console.error("Error adding candidate:", error);
      alert(error.response?.data?.msg || "Error adding candidate");
    }
  };

  const handleEditCandidate = async (formData) => {
    if (!editItem) return;
    try {
      await api.put(`/candidates/${editItem._id || editItem.id}`, formData);
      setShowModal(false);
      loadData();
    } catch (error) {
      console.error("Error updating candidate:", error);
      alert("Error updating candidate");
    }
  };

  const handleDeleteCandidate = async (id) => {
    if (!confirm('Are you sure you want to delete this candidate?')) return;
    try {
      await api.delete(`/candidates/${id}`);
      loadData();
    } catch (error) {
      console.error("Error deleting candidate:", error);
    }
  };

  // --- Handlers: Students ---
  const handleAddStudent = async (formData) => {
    try {
      const password = formData.password || generatePassword();
      const response = await api.post('/users', { ...formData, password });
      const credentials = [{
        studentId: response.data.studentId,
        voterId: response.data.voterId,
        name: response.data.name,
        program: response.data.program,
        semester: response.data.semester,
        class: response.data.class,
        password,
      }];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(credentials), 'Credentials');
      XLSX.writeFile(workbook, 'student_credentials.xlsx');
      setShowModal(false);
      loadData();
    } catch (error) {
      console.error("Error adding student:", error);
      alert(error.response?.data?.msg || "Error adding student");
    }
  };

  const handleEditStudent = async (formData) => {
    if (!editItem) return;
    try {
      await api.put(`/users/${editItem._id}`, formData);
      setRecentlyImportedCredentials(previous => previous.filter(
        credential => credential.voterId !== editItem.voterId
      ));
      setShowModal(false);
      loadData();
    } catch (error) {
      console.error("Error updating student:", error);
      alert("Error updating student");
    }
  };

  const handleDeleteStudent = async (userId) => {
    if (!confirm('Are you sure? This cannot be undone.')) return;
    try {
      await api.delete(`/users/${userId}`);
      const deletedStudent = students.find(student => student._id === userId);
      if (deletedStudent) {
        setRecentlyImportedCredentials(previous => previous.filter(
          credential => credential.voterId !== deletedStudent.voterId
        ));
      }
      loadData();
    } catch (error) {
      console.error("Error deleting student:", error);
    }
  };

  const handleDeleteStudentVotes = async (userId) => {
    if (!confirm('This will delete all votes by this student. Continue?')) return;
    try {
      await api.delete(`/users/${userId}/votes`);
      loadData();
      alert('Votes reset for student');
    } catch (error) {
      console.error("Error resetting votes:", error);
      alert("Error resetting votes");
    }
  };

  const handleDeleteAllStudents = async () => {
    if (!confirm('Delete all students and their votes? Administrator accounts will be retained.')) return;
    try {
      await api.delete('/users/bulk/all');
      setRecentlyImportedCredentials([]);
      await loadData();
    } catch (error) { alert(error.response?.data?.msg || 'Unable to delete students.'); }
  };

  const handleResetAllPasswords = async () => {
    if (!confirm('Replace every student password and download the new credentials?')) return;
    try {
      const response = await api.post('/users/bulk/reset-passwords');
      setRecentlyImportedCredentials([]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(response.data), 'Credentials');
      XLSX.writeFile(workbook, 'focms_student_credentials.xlsx');
    } catch (error) { alert(error.response?.data?.msg || 'Unable to reset passwords.'); }
  };

  // --- Handlers: Schedule ---
  const handleSaveSchedule = async () => {
    setSaving(true);
    setSaveStatus(null);
    try {
      await api.post('/settings', { key: 'votingSchedule', value: votingSchedule });
      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (error) {
      console.error("Error saving schedule:", error);
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const handleStartVoting = async () => {
    try {
      const newSchedule = { ...votingSchedule, isActive: true };
      setVotingSchedule(newSchedule);
      await api.post('/settings', { key: 'votingSchedule', value: newSchedule });
    } catch (error) {
      console.error("Error starting voting:", error);
    }
  };

  const handleEndVoting = async () => {
    try {
      const newSchedule = { ...votingSchedule, isActive: false };
      setVotingSchedule(newSchedule);
      await api.post('/settings', { key: 'votingSchedule', value: newSchedule });
    } catch (error) {
      console.error("Error ending voting:", error);
    }
  };

  // --- Utilities ---
  const formatDuration = (ms) => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  // Helper: generate a random 8-char alphanumeric password
  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  };

  /**
   * Refresh the registry, parse the uploaded file, and open its preview.
   */
  const handleUploadStudents = async (file) => {
    try {
      const usersResponse = await api.get('/users');
      if (!Array.isArray(usersResponse.data)) {
        throw new Error('Could not verify registered students. Please refresh and try again.');
      }
      const registeredUsers = usersResponse.data;
      const registeredStudents = registeredUsers.filter(user => user.role === 'student');
      const voterIds = new Set(registeredStudents.map(student => student.voterId).filter(Boolean));
      setStudents(registeredStudents);
      setImportPreviewExistingStudentNames(
        new Set(registeredStudents.map(student => normalizeStudentName(student.name)).filter(Boolean))
      );

      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error('The workbook does not contain a worksheet.');

      const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (raw.length < 2) throw new Error('The sheet appears to be empty.');

      const headers = raw[0].map(h => String(h).toLowerCase().trim());
      const col = (row, names) => {
        const idx = names.map(name => headers.indexOf(name)).find(index => index >= 0);
        return idx === undefined ? '' : String(row[idx] ?? '').trim();
      };

      const parsed = [];
      const fileNames = new Set();
      for (let i = 1; i < raw.length; i++) {
        const row = raw[i];
        if (row.every(value => String(value ?? '').trim() === '')) continue;

        const studentId = col(row, ['studentid', 'student_id', 'id']);
        const name = col(row, ['name']);
        const classVal = col(row, ['class']);
        const program = (col(row, ['program']) || (/^(BBA|MBA)/i.exec(classVal)?.[1] ?? '')).toUpperCase();
        const semester = col(row, ['semester']) || '1';
        const normalizedSemester = semester.replace(/^Semester\s+/i, '');
        const rawPassword = col(row, ['password']);
        const password = rawPassword || generatePassword();
        const issues = [];

        if (!studentId) issues.push('Student ID is required.');
        if (name && fileNames.has(normalizeStudentName(name))) issues.push('Student name and surname are duplicated in this file.');
        if (name) fileNames.add(normalizeStudentName(name));
        if (!name) issues.push('Name is required.');
        if (program && !['BBA', 'MBA'].includes(program)) issues.push(`Unsupported program "${program}".`);
        if ((program === 'BBA' && !['1', '3', '5'].includes(normalizedSemester)) ||
            (program === 'MBA' && !['1', '3'].includes(normalizedSemester))) {
          issues.push(`${program} does not support semester ${normalizedSemester}.`);
        }
        parsed.push({
          _rowNumber: i + 1,
          studentId,
          voterId: generateVoterId(voterIds),
          name,
          class: classVal || (program ? `${program}-Sem${semester}` : ''),
          program,
          semester,
          password,
          _autoPassword: !rawPassword,
          _issues: issues,
        });
      }

      if (parsed.length === 0) throw new Error('No student rows found in the sheet.');

      setImportPreviewStudents(parsed);
      setImportPreviewOpen(true);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.msg || err.message || 'Could not refresh registered students or read the file. Please try again.');
    }
  };

  /**
   * Step 2 – Called by the preview modal after the admin clicks "Import Students".
   * Receives only the rows the admin selected.
   */
  const handleConfirmImport = async (selectedRows) => {
    const importedCredentials = [];
    let count = 0;
    let skipped = 0;
    const errors = [];
    const importResults = [];

    for (const s of selectedRows) {
      try {
        const response = await api.post('/users', {
          studentId: s.studentId,
          voterId: s.voterId,
          name: s.name,
          class: s.class,
          semester: s.semester,
          program: s.program,
          password: s.password,
        });
        importedCredentials.push({
          studentId: s.studentId,
          voterId: response.data.voterId,
          name: s.name,
          program: s.program,
          semester: s.semester,
          class: s.class,
          password: s.password,
        });
        count++;
        importResults.push({ index: s._idx, success: true });
      } catch (err) {
        const msg = err.response?.data?.msg || err.message || 'Unknown error';
        if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('same name')) {
          skipped++;
          importResults.push({ index: s._idx, success: false, reason: msg });
        } else {
          console.error(`${s.studentId}: ${msg}`);
          errors.push(`${s.studentId} (${s.name}): ${msg}`);
          importResults.push({ index: s._idx, success: false, reason: msg });
        }
      }
    }

    if (count > 0) await loadData({ silent: true });

    if (importedCredentials.length > 0) {
      setRecentlyImportedCredentials(previous => [...previous, ...importedCredentials]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(importedCredentials), 'Credentials');
      XLSX.writeFile(wb, 'imported_student_credentials.xlsx');
    }

    let message = `✅ Imported ${count} student(s).`;
    if (importedCredentials.length > 0) message += ' Credentials file downloaded.';
    if (skipped > 0) message += `\n⚠️ ${skipped} duplicate(s) skipped.`;
    if (errors.length > 0) {
      message += `\n\n❌ ${errors.length} failed:\n` + errors.slice(0, 8).join('\n');
      if (errors.length > 8) message += `\n…and ${errors.length - 8} more. See console.`;
    }
    alert(message);
    return importResults;
  };

  const exportResults = () => {
    const wb = XLSX.utils.book_new();
    // Use pre-computed server-side results for accurate export
    const rows = electionResults.flatMap(result =>
      result.allCandidates.map(c => ({
        Position: result.position.name,
        Name: c.candidate.name,
        Class: c.candidate.class || '',
        Votes: c.votes,
        Percentage: `${c.percentage}%`
      }))
    );
    const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ Note: 'No results yet' }]);
    XLSX.utils.book_append_sheet(wb, ws, "Results");
    XLSX.writeFile(wb, "election_results.xlsx");
  };

  const exportCredentials = (selectedStudents = students) => {
    const workbook = XLSX.utils.book_new();
    const rows = selectedStudents.map(student => ({ studentId: student.studentId, voterId: student.voterId, name: student.name,
      program: student.program || '', semester: student.semester || '', class: student.class || '',
      hasVoted: student.hasVoted ? 'Yes' : 'No' }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Students');
    XLSX.writeFile(workbook, 'focms_student_registry.xlsx');
  };

  const exportImportedCredentials = (selectedStudents) => {
    const selectedVoterIds = new Set(selectedStudents.map(student => student.voterId));
    const rows = recentlyImportedCredentials.filter(credential => selectedVoterIds.has(credential.voterId));
    if (rows.length === 0) {
      alert('No recently imported credentials match the current filters. Passwords for existing students cannot be recovered.');
      return;
    }
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Credentials');
    XLSX.writeFile(workbook, 'filtered_student_credentials.xlsx');
  };

  // --- Render ---
  return (
    <div className="flex min-h-screen bg-[#0f172a] text-white font-sans">
      <AdminSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={handleLogout}
        isMobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      <main className="flex-1 min-w-0 ml-16 p-4 pt-20 sm:p-8 sm:pt-20 md:ml-64 md:pt-8 relative z-10">
        <div className="fixed left-16 right-0 top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-[#0f172a]/95 px-4 py-3 backdrop-blur md:hidden">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={mobileSidebarOpen}
            className="rounded-lg p-2 text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Menu size={22} />
          </button>
          <span className="font-semibold">FOCMS Admin Portal</span>
        </div>
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <LoadingSpinner message="Loading Dashboard..." />
          </div>
        ) : (
          <div className="max-w-7xl mx-auto">
            {activeTab === 'overview' && (
              <AdminOverview
                stats={stats}
                positions={positions}
                candidates={candidates}
                students={students}
                votingSchedule={votingSchedule}
                votingStatus={votingStatus}
                setModalType={setModalType}
                setEditItem={setEditItem}
                setShowModal={setShowModal}
                handleStartVoting={handleStartVoting}
                handleEndVoting={handleEndVoting}
                setActiveTab={setActiveTab}
              />
            )}

            {activeTab === 'manage' && (
              <AdminManage
                positions={positions}
                candidates={candidates}
                students={students}
                setModalType={setModalType}
                setEditItem={setEditItem}
                setShowModal={setShowModal}
                handleDeletePosition={handleDeletePosition}
                handleDeleteCandidate={handleDeleteCandidate}
                handleDeleteStudent={handleDeleteStudent}
                handleDeleteStudentVotes={handleDeleteStudentVotes}
                handleDeleteAllStudents={handleDeleteAllStudents}
                handleResetAllPasswords={handleResetAllPasswords}
                exportCredentials={exportCredentials}
                recentlyImportedCredentials={recentlyImportedCredentials}
                exportImportedCredentials={exportImportedCredentials}
                handleUploadStudents={handleUploadStudents}
                loadData={loadData}
              />
            )}

            {activeTab === 'schedule' && (
              <AdminSchedule
                votingSchedule={votingSchedule}
                students={students}
                votingBatch={votingBatch}
                onOpenVotingBatch={openVotingBatch}
                onCloseVotingBatch={closeVotingBatch}
                setVotingSchedule={setVotingSchedule}
                handleSaveSchedule={handleSaveSchedule}
                saving={saving}
                saveStatus={saveStatus}
                formatDuration={formatDuration}
                handleStartVoting={handleStartVoting}
                handleEndVoting={handleEndVoting}
                loadData={loadData}
              />
            )}

            {activeTab === 'results' && (
              <AdminResults
                stats={stats}
                electionResults={electionResults}
                exportResults={exportResults}
              />
            )}

            {activeTab === 'announcements' && (
              <AdminAnnouncements />
            )}
          </div>
        )}
      </main>

      <AdminModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        modalType={modalType}
        editItem={editItem}
        positions={positions}
        onSubmit={(data) => {
          if (modalType === 'position') {
            editItem ? handleEditPosition(data) : handleAddPosition(data);
          } else if (modalType === 'candidate') {
            editItem ? handleEditCandidate(data) : handleAddCandidate(data);
          } else {
            editItem ? handleEditStudent(data) : handleAddStudent(data);
          }
        }}
      />

      <StudentImportPreviewModal
        isOpen={importPreviewOpen}
        students={importPreviewStudents}
        existingStudentNames={importPreviewExistingStudentNames}
        onClose={() => setImportPreviewOpen(false)}
        onConfirm={handleConfirmImport}
      />
    </div>
  );
};

export default AdminDashboard;