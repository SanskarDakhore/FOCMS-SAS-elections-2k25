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

  // --- Data Loading & Effects ---

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
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
      setLoading(false);
    }
  };

  const refreshVotingBatch = async () => {
    const response = await api.get('/votes/batch');
    const batch = response.data;
    setVotingBatch(batch);
    if (batch.roster?.length) {
      const rosterById = new Map(batch.roster.map(student => [student.studentId, student]));
      setStudents(current => current.map(student => {
        const rosterStudent = rosterById.get(student.studentId);
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
      await api.post('/users', formData);
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
      await api.put(`/users/${editItem.studentId}`, formData);
      setShowModal(false);
      loadData();
    } catch (error) {
      console.error("Error updating student:", error);
      alert("Error updating student");
    }
  };

  const handleDeleteStudent = async (studentId) => {
    if (!confirm('Are you sure? This cannot be undone.')) return;
    try {
      await api.delete(`/users/${studentId}`);
      loadData();
    } catch (error) {
      console.error("Error deleting student:", error);
    }
  };

  const handleDeleteStudentVotes = async (studentId) => {
    if (!confirm('This will delete all votes by this student. Continue?')) return;
    try {
      await api.delete(`/users/${studentId}/votes`);
      loadData();
      alert(`Votes reset for student ${studentId}`);
    } catch (error) {
      console.error("Error resetting votes:", error);
      alert("Error resetting votes");
    }
  };

  const handleDeleteAllStudents = async () => {
    if (!confirm('Delete all students and their votes? Administrator accounts will be retained.')) return;
    try {
      await api.delete('/users/bulk/all');
      await loadData();
    } catch (error) { alert(error.response?.data?.msg || 'Unable to delete students.'); }
  };

  const handleResetAllPasswords = async () => {
    if (!confirm('Replace every student password and download the new credentials?')) return;
    try {
      const response = await api.post('/users/bulk/reset-passwords');
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

  const handleUploadStudents = async (file) => {
    // Basic XLSX parsing to API calls
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet);

      let count = 0;
      for (const row of json) {
        if (!row.studentId || !row.name) continue;
        try {
          await api.post('/users', {
            studentId: String(row.studentId),
            name: row.name,
            class: row.class || 'Unknown',
            semester: row.semester || '1',
            program: row.program || (/^(BBA|MBA)/i.exec(row.class || '')?.[1]?.toUpperCase()),
            password: row.password || 'password123'
          });
          count++;
        } catch { console.log("Skip duplicate"); }
      }
      loadData();
      alert(`Imported ${count} students.`);
    } catch (err) {
      console.error(err);
      alert("Error importing file.");
    }
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
    const rows = selectedStudents.map(student => ({ studentId: student.studentId, name: student.name,
      program: student.program || '', semester: student.semester || '', class: student.class || '',
      hasVoted: student.hasVoted ? 'Yes' : 'No' }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Students');
    XLSX.writeFile(workbook, 'focms_student_registry.xlsx');
  };

  const exportStudentsBySemester = (selectedStudents) => exportCredentials(selectedStudents);

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

      <main className="flex-1 min-w-0 ml-0 p-4 pt-20 sm:p-8 sm:pt-20 md:ml-64 md:pt-8 relative z-10">
        <div className="fixed inset-x-0 top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-[#0f172a]/95 px-4 py-3 backdrop-blur md:hidden">
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
                exportStudentsBySemester={exportStudentsBySemester}
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
    </div>
  );
};

export default AdminDashboard;