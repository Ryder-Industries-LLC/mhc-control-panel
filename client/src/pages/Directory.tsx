import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatDate } from '../utils/formatting';
import './Directory.css';

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

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case 'MODEL':
        return 'role-badge role-model';
      case 'VIEWER':
        return 'role-badge role-viewer';
      default:
        return 'role-badge role-unknown';
    }
  };

  const getSourceBadgeClass = (source: string) => {
    if (source.includes('statbate')) {
      return 'source-badge source-statbate';
    }
    if (source === 'cb_events') {
      return 'source-badge source-cb-events';
    }
    if (source === 'cb_stats') {
      return 'source-badge source-cb-stats';
    }
    return 'source-badge source-manual';
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
      <div className="directory">
        <div className="directory-header">
          <h1>Directory</h1>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="directory">
        <div className="directory-header">
          <h1>Directory</h1>
        </div>
        <div className="error-message">{error}</div>
        <button onClick={loadPersons} className="btn-retry">Retry</button>
      </div>
    );
  }

  return (
    <div className="directory">
      <div className="directory-header">
        <h1>Directory</h1>
        <p>All tracked persons ({persons.length})</p>

        {/* Background job runs automatically in worker process */}

        <div className="filter-controls">
          <label>Filter by Role:</label>
          <div className="role-filters">
            <button
              className={roleFilter === 'ALL' ? 'filter-btn active' : 'filter-btn'}
              onClick={() => setRoleFilter('ALL')}
            >
              All ({persons.length})
            </button>
            <button
              className={roleFilter === 'MODEL' ? 'filter-btn active' : 'filter-btn'}
              onClick={() => setRoleFilter('MODEL')}
            >
              Models ({persons.filter(p => p.role === 'MODEL').length})
            </button>
            <button
              className={roleFilter === 'VIEWER' ? 'filter-btn active' : 'filter-btn'}
              onClick={() => setRoleFilter('VIEWER')}
            >
              Viewers ({persons.filter(p => p.role === 'VIEWER').length})
            </button>
            <button
              className={roleFilter === 'UNKNOWN' ? 'filter-btn active' : 'filter-btn'}
              onClick={() => setRoleFilter('UNKNOWN')}
            >
              Unknown ({persons.filter(p => p.role === 'UNKNOWN').length})
            </button>
          </div>
        </div>
      </div>

      <div className="directory-content">
        <table className="directory-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('username')} className="sortable">
                Username {sortField === 'username' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('role')} className="sortable">
                Role {sortField === 'role' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('source')} className="sortable">
                Source {sortField === 'source' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('interaction_count')} className="sortable">
                Events {sortField === 'interaction_count' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('snapshot_count')} className="sortable">
                Snapshots {sortField === 'snapshot_count' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('first_seen_at')} className="sortable">
                First Seen {sortField === 'first_seen_at' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('last_seen_at')} className="sortable">
                Last Seen {sortField === 'last_seen_at' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedPersons.map((person) => (
              <tr key={person.id}>
                <td className="username-cell">
                  <Link to={`/?username=${person.username}`}>
                    {person.username}
                  </Link>
                </td>
                <td>
                  <span className={getRoleBadgeClass(person.role)}>{person.role}</span>
                </td>
                <td>
                  <span className={getSourceBadgeClass(person.source)}>
                    {formatSource(person.source)}
                  </span>
                </td>
                <td className="count-cell">{person.interaction_count}</td>
                <td className="count-cell">{person.snapshot_count}</td>
                <td>{formatDate(person.first_seen_at, { relative: true })}</td>
                <td>{formatDate(person.last_seen_at, { relative: true })}</td>
                <td>
                  <button
                    className="btn-delete"
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
