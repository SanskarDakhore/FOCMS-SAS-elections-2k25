import React, { useState, useMemo } from 'react';
import {
  X, Upload, CheckCircle, XCircle, AlertTriangle,
  Users, Search, ChevronDown, ChevronUp, Info
} from 'lucide-react';
import { normalizeStudentName } from '../../utils/studentName';

/**
 * StudentImportPreviewModal
 * Shows a preview of all students parsed from an uploaded sheet.
 * Each row is validated client-side (eligible vs invalid vs duplicate).
 * Admin can select/deselect rows then click "Import Selected".
 *
 * Props:
 *  isOpen            - boolean
 *  students          - Array<{ studentId, name, program, semester, class, password, _autoPassword }>
 *  onClose           - () => void
 *  onConfirm         - (selected: Array) => Promise<void>
 *  existingStudentNames - Set<string>  normalized names already in the system
 */
const StudentImportPreviewModal = ({
  isOpen,
  students = [],
  onClose,
  onConfirm,
  existingStudentNames = new Set(),
}) => {
  const [selected, setSelected] = useState(() => new Set());
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [importing, setImporting] = useState(false);
  const [sortDir, setSortDir] = useState('asc');
  const [importResults, setImportResults] = useState({});

  /* ── Tag each row ── */
  const tagged = useMemo(() => students.map((s, idx) => {
    const issues = [...(s._issues || [])];
    if (!s.studentId && !issues.includes('Student ID is required.')) issues.push('Missing Student ID');
    if (!s.name && !issues.includes('Name is required.')) issues.push('Missing Name');
    const nameKey = normalizeStudentName(s.name);
    const duplicateInFile = issues.includes('Student name and surname are duplicated in this file.');
    const duplicateInRegistry = nameKey && existingStudentNames.has(nameKey);
    const isDuplicate = Boolean(duplicateInFile || duplicateInRegistry);
    if (duplicateInRegistry && !issues.includes('Same name and surname already exists in system.')) {
      issues.push('Same name and surname already exists in system.');
    }
    const duplicateReasons = new Set([
      'Student name and surname are duplicated in this file.',
      'Same name and surname already exists in system.',
    ]);
    return {
      ...s,
      _idx: idx,
      _eligible: issues.every(issue => duplicateReasons.has(issue)),
      _duplicate: isDuplicate,
      _issues: issues,
      _importResult: importResults[idx],
    };
  }), [students, existingStudentNames, importResults]);

  /* ── Reset selection when data/open changes ── */
  React.useEffect(() => {
    if (!isOpen) return;
    setSelected(new Set(
      students.flatMap((student, index) => {
        const hasIssues = (student._issues || []).length > 0 ||
          !student.studentId || !student.name ||
          existingStudentNames.has(normalizeStudentName(student.name)) ||
          (student._issues || []).includes('Student name and surname are duplicated in this file.');
        return !hasIssues ? [index] : [];
      })
    ));
    setSearch('');
    setFilterStatus('all');
    setImporting(false);
  }, [isOpen, students, existingStudentNames]);

  React.useEffect(() => {
    if (!isOpen) setImportResults({});
  }, [isOpen]);

  /* ── Counts ── */
  const counts = useMemo(() => ({
    total:     tagged.length,
    eligible:  tagged.filter(s => s._eligible && !s._duplicate).length,
    duplicate: tagged.filter(s => s._duplicate).length,
    invalid:   tagged.filter(s => !s._eligible).length,
    selected:  selected.size,
    imported:  tagged.filter(s => s._importResult?.success).length,
    failed:    tagged.filter(s => s._importResult && !s._importResult.success).length,
  }), [tagged, selected]);

  /* ── Filtered + sorted view ── */
  const visible = useMemo(() => {
    let list = tagged;
    if (filterStatus === 'eligible')  list = list.filter(s => s._eligible && !s._duplicate);
    if (filterStatus === 'invalid')   list = list.filter(s => !s._eligible);
    if (filterStatus === 'duplicate') list = list.filter(s => s._duplicate);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        String(s.studentId || '').toLowerCase().includes(q) ||
        String(s.voterId || '').toLowerCase().includes(q) ||
        String(s.name || '').toLowerCase().includes(q) ||
        String(s.program || '').toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      const cmp = String(a.studentId || '').localeCompare(String(b.studentId || ''));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [tagged, filterStatus, search, sortDir]);

  /* ── Selection helpers ── */
  const toggleRow = (idx) => setSelected(prev => {
    const next = new Set(prev);
    next.has(idx) ? next.delete(idx) : next.add(idx);
    return next;
  });

  const visibleEligible = visible.filter(s => s._eligible && !s._duplicate);
  const allVisibleSelected =
    visibleEligible.length > 0 && visibleEligible.every(s => selected.has(s._idx));

  const selectVisible = () => setSelected(prev => {
    const next = new Set(prev);
    visibleEligible.forEach(s => next.add(s._idx));
    return next;
  });
  const deselectVisible = () => setSelected(prev => {
    const next = new Set(prev);
    visible.forEach(s => next.delete(s._idx));
    return next;
  });

  /* ── Import ── */
  const handleImport = async () => {
    const toImport = tagged.filter(s => selected.has(s._idx));
    if (!toImport.length) return;
    setImporting(true);
    try {
      const results = await onConfirm(toImport);
      if (results) {
        setImportResults(previous => ({
          ...previous,
          ...Object.fromEntries(results.map(result => [result.index, result])),
        }));
      }
    } finally {
      setImporting(false);
    }
  };

  if (!isOpen) return null;

  /* ── Status badge ── */
  const StatusBadge = ({ row }) => {
    if (row._importResult?.success)
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-blue-400/40 bg-blue-500/15 px-2 py-0.5 text-xs font-semibold text-blue-300">
          <CheckCircle size={11} /> Imported
        </span>
      );
    if (row._importResult)
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-300">
          <AlertTriangle size={11} /> Import failed
        </span>
      );
    if (!row._eligible)
      return (
        <span style={{ background: 'rgba(239,68,68,0.15)', borderColor: 'rgba(248,113,113,0.4)' }}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold text-red-400 border">
          <XCircle size={11} /> Invalid
        </span>
      );
    if (row._duplicate)
      return (
        <span style={{ background: 'rgba(234,179,8,0.15)', borderColor: 'rgba(250,204,21,0.4)' }}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold text-yellow-400 border">
          <AlertTriangle size={11} /> Duplicate
        </span>
      );
    return (
      <span style={{ background: 'rgba(16,185,129,0.15)', borderColor: 'rgba(52,211,153,0.4)' }}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold text-emerald-400 border">
        <CheckCircle size={11} /> Eligible
      </span>
    );
  };

  /* ── Stat pill colours (inline to avoid Tailwind purge) ── */
  const pillStyles = {
    all:       { bg: 'rgba(99,102,241,0.2)',  border: 'rgba(129,140,248,0.5)', text: '#a5b4fc' },
    eligible:  { bg: 'rgba(16,185,129,0.2)',  border: 'rgba(52,211,153,0.5)',  text: '#6ee7b7' },
    duplicate: { bg: 'rgba(234,179,8,0.2)',   border: 'rgba(250,204,21,0.5)',  text: '#fde68a' },
    invalid:   { bg: 'rgba(239,68,68,0.2)',   border: 'rgba(248,113,113,0.5)', text: '#fca5a5' },
    selected:  { bg: 'rgba(59,130,246,0.2)',  border: 'rgba(96,165,250,0.5)',  text: '#93c5fd' },
  };

  const pills = [
    { label: 'Total Rows', val: counts.total,    key: 'all' },
    { label: 'Eligible',   val: counts.eligible,  key: 'eligible' },
    { label: 'Duplicates', val: counts.duplicate, key: 'duplicate' },
    { label: 'Invalid',    val: counts.invalid,   key: 'invalid' },
    { label: 'Selected',   val: counts.selected,  key: 'selected' },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Student Import Preview"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
    >
      <div
        className="relative w-full max-w-6xl rounded-2xl flex flex-col"
        style={{
          background: 'linear-gradient(145deg, #1e1b4b 0%, #0f172a 55%, #0a0f1e 100%)',
          border: '1px solid rgba(99,102,241,0.35)',
          boxShadow: '0 30px 70px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05)',
          maxHeight: '93vh',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl" style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(129,140,248,0.3)' }}>
              <Users size={22} className="text-indigo-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Import Preview</h2>
              <p className="text-xs text-gray-400 mt-0.5">Review and confirm students before importing</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={importing}
            className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors disabled:opacity-40"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Stat pills */}
        <div className="px-6 pt-4 pb-3 flex flex-wrap gap-2">
          {pills.map(({ label, val, key }) => {
            const isFilter = key !== 'selected';
            const active = filterStatus === key && isFilter;
            const style = active
              ? { background: pillStyles[key].bg, borderColor: pillStyles[key].border, color: pillStyles[key].text }
              : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)', color: '#9ca3af' };
            return (
              <button
                key={key}
                onClick={() => isFilter && setFilterStatus(prev => prev === key ? 'all' : key)}
                style={{ ...style, border: '1px solid', transition: 'all .2s', transform: active ? 'scale(1.04)' : 'scale(1)' }}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold ${isFilter ? 'cursor-pointer hover:opacity-90' : 'cursor-default'}`}
              >
                <span className="text-lg font-bold">{val}</span>
                <span className="font-normal opacity-80">{label}</span>
              </button>
            );
          })}
        </div>

        {/* Toolbar */}
        <div className="px-6 pb-3 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[160px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by ID, name, or program…"
              className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              style={{ transition: 'border-color .2s' }}
            />
          </div>

          <button
            onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-colors"
          >
            Sort ID {sortDir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          <button
            onClick={allVisibleSelected ? deselectVisible : selectVisible}
            className="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(129,140,248,0.35)', color: '#a5b4fc' }}
          >
            {allVisibleSelected ? 'Deselect visible' : 'Select eligible'}
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto mx-6 mb-1 rounded-xl" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
          <table className="w-full text-sm border-collapse min-w-[900px]">
            <thead
              className="sticky top-0 z-10"
              style={{ background: 'rgba(15,23,42,0.97)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
            >
              <tr className="text-gray-400 text-xs uppercase tracking-wide">
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={() => allVisibleSelected ? deselectVisible() : selectVisible()}
                    className="w-4 h-4 accent-indigo-500"
                    aria-label="Select all eligible visible"
                  />
                </th>
                <th className="py-3 px-2 text-left">#</th>
                <th className="py-3 px-3 text-left">Student ID</th>
                <th className="py-3 px-3 text-left">Voter ID</th>
                <th className="py-3 px-3 text-left">Name</th>
                <th className="py-3 px-3 text-left">Program</th>
                <th className="py-3 px-2 text-left">Sem</th>
                <th className="py-3 px-3 text-left">Class</th>
                <th className="py-3 px-3 text-left">Password</th>
                <th className="py-3 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-14 text-center text-gray-500">
                    No rows match your filter or search.
                  </td>
                </tr>
              ) : (
                visible.map(row => {
                  const canSelect = row._eligible && !row._duplicate && !row._importResult?.success;
                  const isSel = selected.has(row._idx);
                  return (
                    <tr
                      key={row._idx}
                      onClick={() => canSelect && toggleRow(row._idx)}
                      style={{
                        background: isSel
                          ? 'rgba(99,102,241,0.09)'
                          : !row._eligible || row._duplicate
                          ? 'rgba(0,0,0,0.15)' : 'transparent',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        cursor: canSelect ? 'pointer' : 'default',
                        opacity: (!row._eligible || row._duplicate) ? 0.65 : 1,
                        transition: 'background .15s',
                      }}
                      className={canSelect ? 'hover:bg-indigo-500/10' : ''}
                    >
                      <td className="py-3 px-3 text-center">
                        {canSelect && (
                          <input
                            type="checkbox"
                            checked={isSel}
                            onChange={() => toggleRow(row._idx)}
                            onClick={e => e.stopPropagation()}
                            className="w-4 h-4 accent-indigo-500"
                            aria-label={`Select ${row.name}`}
                          />
                        )}
                      </td>
                      <td className="py-3 px-2 text-gray-500 tabular-nums text-xs">{row._idx + 1}</td>
                      <td className="py-3 px-3 font-mono font-semibold text-white">
                        {row.studentId || <span className="text-red-400 italic text-xs">missing</span>}
                      </td>
                      <td className="py-3 px-3 font-mono text-xs text-indigo-200">{row.voterId}</td>
                      <td className="py-3 px-3 text-gray-200">
                        {row.name || <span className="text-red-400 italic text-xs">missing</span>}
                      </td>
                      <td className="py-3 px-3 text-gray-300">{row.program || '—'}</td>
                      <td className="py-3 px-2 text-gray-300">{row.semester || '—'}</td>
                      <td className="py-3 px-3 text-gray-300 max-w-[120px] truncate">{row.class || '—'}</td>
                      <td className="py-3 px-3">
                        {row._autoPassword ? (
                          <span className="inline-flex items-center gap-1 text-yellow-400 text-xs">
                            <Info size={11} /> Auto-generated
                          </span>
                        ) : (
                          <span className="text-gray-500 text-xs">Provided</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <StatusBadge row={row} />
                        {row._issues.length > 0 && (
                          <p className="text-xs text-red-400 mt-1 leading-tight">{row._issues.join(', ')}</p>
                        )}
                        {row._importResult?.reason && (
                          <p className="mt-1 text-xs leading-tight text-amber-300">{row._importResult.reason}</p>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 flex flex-wrap items-center justify-between gap-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(10,15,30,0.5)' }}
        >
          <p className="text-sm text-gray-400">
            <span className="text-white font-semibold">{counts.selected}</span>{' '}
            student{counts.selected !== 1 ? 's' : ''} selected for import
            {counts.duplicate > 0 && (
              <span className="ml-2 text-yellow-400">
                · {counts.duplicate} duplicate{counts.duplicate > 1 ? 's' : ''} will be skipped
              </span>
            )}
            {counts.invalid > 0 && (
              <span className="ml-2 text-red-400">
                · {counts.invalid} invalid row{counts.invalid > 1 ? 's' : ''} excluded
              </span>
            )}
            {counts.imported > 0 && (
              <span className="ml-2 text-blue-300">· {counts.imported} imported</span>
            )}
            {counts.failed > 0 && (
              <span className="ml-2 text-amber-300">· {counts.failed} failed</span>
            )}
          </p>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={importing}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-gray-300 border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-40"
            >
              Cancel
            </button>

            <button
              id="confirm-import-students-btn"
              onClick={handleImport}
              disabled={counts.selected === 0 || importing}
              className="relative px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: counts.selected > 0
                  ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
                  : 'rgba(99,102,241,0.3)',
                boxShadow: counts.selected > 0 ? '0 4px 20px rgba(99,102,241,0.45)' : 'none',
              }}
            >
              {importing ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="white" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  Importing…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Upload size={15} />
                  Import {counts.selected} Student{counts.selected !== 1 ? 's' : ''}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentImportPreviewModal;
