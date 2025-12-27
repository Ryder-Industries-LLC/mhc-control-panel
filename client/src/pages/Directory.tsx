import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatDate } from '../utils/formatting';
// Directory.css removed - fully migrated to Tailwind CSS

interface PersonWithSource {
  id: string;
  username: string;
  platform: string;
  role: string;
  rid: number | null;
  did: number | null;
  first_seen_at: string;
  last_seen_at: string;
  source: string;
  interaction_count: number;
  snapshot_count: number;
}

const Directory: React.FC = () => {
  const [persons, setPersons] = useState<PersonWithSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<keyof PersonWithSource>('last_seen_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [jobStatus, setJobStatus] = useState<{ isRunning: boolean; isPaused: boolean; intervalMinutes: number } | null>(null);

  useEffect(() => {
    loadPersons();
    loadJobStatus();
  }, []);

  const loadJobStatus = async () => {
    try {
      const status = await api.getJobStatus();
      setJobStatus(status);
    } catch (err) {
      console.error('Failed to load job status', err);
    }
  };

  const loadPersons = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getAllPersons(500, 0);
      setPersons(data.persons);
    } catch (err) {
      setError('Failed to load persons');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, username: string) => {
    if (!window.confirm(`Are you sure you want to delete ${username}? This will remove all associated data.`)) {
      return;
    }

    try {
      setDeletingId(id);
      await api.deletePerson(id);
      setPersons(persons.filter(p => p.id !== id));
    } catch (err) {
      setError(`Failed to delete ${username}`);
      console.error(err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleJob = async () => {
    try {
      if (!jobStatus) return;

      if (jobStatus.isPaused) {
        await api.resumeJob();
      } else {
        await api.pauseJob();
      }
      await loadJobStatus();
    } catch (err) {
      setError('Failed to toggle background job');
      console.error(err);
    }
  };

  const handleSort = (field: keyof PersonWithSource) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const filteredPersons = roleFilter === 'ALL'
    ? persons
    : persons.filter(p => p.role === roleFilter);

  const sortedPersons = [...filteredPersons].sort((a, b) => {
    const aValue = a[sortField];
    const bValue = b[sortField];

    if (aValue === null || aValue === undefined) return 1;
    if (bValue === null || bValue === undefined) return -1;

    let comparison = 0;
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      comparison = aValue.localeCompare(bValue);
    } else if (typeof aValue === 'number' && typeof bValue === 'number') {
      comparison = aValue - bValue;
    } else {
      comparison = String(aValue).localeCompare(String(bValue));
    }

    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const getRoleBadge = (role: string) => {
    const base = "inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase";
    switch (role) {
      case 'MODEL':
        return `${base} bg-mhc-primary text-white`;
      case 'VIEWER':
        return `${base} bg-emerald-500 text-white`;
      default:
        return `${base} bg-gray-600 text-gray-200`;
    }
  };

  const getSourceBadge = (source: string) => {
    const base = "inline-block px-3 py-1 rounded-full text-xs font-semibold";
    if (source.includes('statbate')) {
      return `${base} bg-purple-500 text-white`;
    }
    if (source === 'cb_events') {
      return `${base} bg-teal-500 text-white`;
    }
    if (source === 'cb_stats') {
      return `${base} bg-violet-600 text-white`;
    }
    return `${base} bg-gray-500 text-white`;
  };

  const formatSource = (source: string) => {
    if (source === 'statbate_model') return 'Statbate (Model)';
    if (source === 'statbate_member') return 'Statbate (Member)';
    if (source === 'cb_events') return 'CB Events';
    if (source === 'cb_stats') return 'CB Stats';
    return 'Manual';
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-5">
        <div className="text-center mb-10 py-8 border-b-2 border-mhc-primary">
          <h1 className="text-mhc-primary text-4xl font-bold mb-2">Directory</h1>
          <p className="text-mhc-text-dim text-lg">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto p-5">
        <div className="text-center mb-10 py-8 border-b-2 border-mhc-primary">
          <h1 className="text-mhc-primary text-4xl font-bold mb-2">Directory</h1>
        </div>
        <div className="bg-red-400 text-white p-4 rounded-md mb-5">{error}</div>
        <button
          onClick={loadPersons}
          className="bg-mhc-primary text-white px-5 py-2.5 rounded-md text-sm font-semibold hover:bg-indigo-600 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-5">
      <div className="text-center mb-10 py-8 border-b-2 border-mhc-primary">
        <h1 className="text-mhc-primary text-4xl font-bold mb-2">Directory</h1>
        <p className="text-mhc-text-dim text-lg">All tracked persons ({persons.length})</p>

        {/* Background job runs automatically in worker process */}

        <div className="mt-5">
          <label className="block text-mhc-text-muted text-sm font-semibold mb-2">Filter by Role:</label>
          <div className="flex gap-2.5 justify-center">
            <button
              className={`px-4 py-2 rounded-md text-sm font-semibold border-2 transition-all ${
                roleFilter === 'ALL'
                  ? 'bg-mhc-primary text-white border-mhc-primary'
                  : 'bg-mhc-surface-light text-mhc-text-muted border-gray-600 hover:bg-gray-600 hover:border-mhc-primary'
              }`}
              onClick={() => setRoleFilter('ALL')}
            >
              All ({persons.length})
            </button>
            <button
              className={`px-4 py-2 rounded-md text-sm font-semibold border-2 transition-all ${
                roleFilter === 'MODEL'
                  ? 'bg-mhc-primary text-white border-mhc-primary'
                  : 'bg-mhc-surface-light text-mhc-text-muted border-gray-600 hover:bg-gray-600 hover:border-mhc-primary'
              }`}
              onClick={() => setRoleFilter('MODEL')}
            >
              Models ({persons.filter(p => p.role === 'MODEL').length})
            </button>
            <button
              className={`px-4 py-2 rounded-md text-sm font-semibold border-2 transition-all ${
                roleFilter === 'VIEWER'
                  ? 'bg-mhc-primary text-white border-mhc-primary'
                  : 'bg-mhc-surface-light text-mhc-text-muted border-gray-600 hover:bg-gray-600 hover:border-mhc-primary'
              }`}
              onClick={() => setRoleFilter('VIEWER')}
            >
              Viewers ({persons.filter(p => p.role === 'VIEWER').length})
            </button>
            <button
              className={`px-4 py-2 rounded-md text-sm font-semibold border-2 transition-all ${
                roleFilter === 'UNKNOWN'
                  ? 'bg-mhc-primary text-white border-mhc-primary'
                  : 'bg-mhc-surface-light text-mhc-text-muted border-gray-600 hover:bg-gray-600 hover:border-mhc-primary'
              }`}
              onClick={() => setRoleFilter('UNKNOWN')}
            >
              Unknown ({persons.filter(p => p.role === 'UNKNOWN').length})
            </button>
          </div>
        </div>
      </div>

      <div className="bg-mhc-surface rounded-xl overflow-hidden shadow-lg">
        <table className="w-full border-collapse">
          <thead className="bg-mhc-surface-light sticky top-0 z-10">
            <tr>
              <th
                onClick={() => handleSort('username')}
                className="px-3 py-4 text-left text-mhc-text-muted font-semibold text-sm border-b-2 border-gray-600 cursor-pointer select-none hover:bg-gray-600 transition-colors"
              >
                Username {sortField === 'username' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th
                onClick={() => handleSort('role')}
                className="px-3 py-4 text-left text-mhc-text-muted font-semibold text-sm border-b-2 border-gray-600 cursor-pointer select-none hover:bg-gray-600 transition-colors"
              >
                Role {sortField === 'role' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th
                onClick={() => handleSort('source')}
                className="px-3 py-4 text-left text-mhc-text-muted font-semibold text-sm border-b-2 border-gray-600 cursor-pointer select-none hover:bg-gray-600 transition-colors"
              >
                Source {sortField === 'source' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th
                onClick={() => handleSort('interaction_count')}
                className="px-3 py-4 text-left text-mhc-text-muted font-semibold text-sm border-b-2 border-gray-600 cursor-pointer select-none hover:bg-gray-600 transition-colors"
              >
                Events {sortField === 'interaction_count' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th
                onClick={() => handleSort('snapshot_count')}
                className="px-3 py-4 text-left text-mhc-text-muted font-semibold text-sm border-b-2 border-gray-600 cursor-pointer select-none hover:bg-gray-600 transition-colors"
              >
                Snapshots {sortField === 'snapshot_count' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th
                onClick={() => handleSort('first_seen_at')}
                className="px-3 py-4 text-left text-mhc-text-muted font-semibold text-sm border-b-2 border-gray-600 cursor-pointer select-none hover:bg-gray-600 transition-colors"
              >
                First Seen {sortField === 'first_seen_at' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th
                onClick={() => handleSort('last_seen_at')}
                className="px-3 py-4 text-left text-mhc-text-muted font-semibold text-sm border-b-2 border-gray-600 cursor-pointer select-none hover:bg-gray-600 transition-colors"
              >
                Last Seen {sortField === 'last_seen_at' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-3 py-4 text-left text-mhc-text-muted font-semibold text-sm border-b-2 border-gray-600">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedPersons.map((person) => (
              <tr key={person.id} className="border-b border-mhc-surface-light hover:bg-mhc-surface-light transition-colors">
                <td className="px-3 py-3 text-gray-200 text-sm font-semibold">
                  <Link to={`/profile/${person.username}`} className="text-mhc-primary no-underline hover:text-indigo-400 hover:underline transition-colors">
                    {person.username}
                  </Link>
                </td>
                <td className="px-3 py-3 text-gray-200 text-sm">
                  <span className={getRoleBadge(person.role)}>{person.role}</span>
                </td>
                <td className="px-3 py-3 text-gray-200 text-sm">
                  <span className={getSourceBadge(person.source)}>
                    {formatSource(person.source)}
                  </span>
                </td>
                <td className="px-3 py-3 text-gray-200 text-sm text-center">{person.interaction_count}</td>
                <td className="px-3 py-3 text-gray-200 text-sm text-center">{person.snapshot_count}</td>
                <td className="px-3 py-3 text-gray-200 text-sm">{formatDate(person.first_seen_at, { relative: true })}</td>
                <td className="px-3 py-3 text-gray-200 text-sm">{formatDate(person.last_seen_at, { relative: true })}</td>
                <td className="px-3 py-3 text-gray-200 text-sm">
                  <button
                    className="bg-red-400 text-white px-3 py-1.5 rounded text-xs font-semibold hover:bg-red-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    onClick={() => handleDelete(person.id, person.username)}
                    disabled={deletingId === person.id}
                  >
                    {deletingId === person.id ? 'Deleting...' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Directory;
