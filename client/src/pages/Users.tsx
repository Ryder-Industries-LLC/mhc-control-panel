import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatDate } from '../utils/formatting';
import './Users.css';

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

interface PriorityLookup {
  id: string;
  username: string;
  priority_level: 1 | 2;
  status: 'pending' | 'completed' | 'active';
  created_at: string;
  completed_at: string | null;
  last_checked_at: string | null;
  notes: string | null;
}

interface FeedCacheStatus {
  exists: boolean;
  fresh: boolean;
  timestamp: string | null;
  ageMs: number | null;
  roomCount: number;
  totalCount: number;
}

const Users: React.FC = () => {
  const [persons, setPersons] = useState<PersonWithSource[]>([]);
  const [priorityLookups, setPriorityLookups] = useState<PriorityLookup[]>([]);
  const [cacheStatus, setCacheStatus] = useState<FeedCacheStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<keyof PersonWithSource>('last_seen_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showPriorityModal, setShowPriorityModal] = useState(false);
  const [selectedUsername, setSelectedUsername] = useState<string>('');
  const [priorityLevel, setPriorityLevel] = useState<1 | 2>(1);
  const [priorityNotes, setPriorityNotes] = useState('');
  const [lookupLoading, setLookupLoading] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await Promise.all([
      loadPersons(),
      loadPriorityLookups(),
      loadCacheStatus(),
    ]);
  };

  const loadPersons = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getAllPersons(1000, 0);
      setPersons(data.persons);
    } catch (err) {
      setError('Failed to load persons');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadPriorityLookups = async () => {
    try {
      const lookups = await api.getPriorityLookups();
      setPriorityLookups(lookups);
    } catch (err) {
      console.error('Failed to load priority lookups', err);
    }
  };

  const loadCacheStatus = async () => {
    try {
      const status = await api.getFeedCacheStatus();
      setCacheStatus(status);
    } catch (err) {
      console.error('Failed to load cache status', err);
    }
  };

  const handleDelete = async (id: string, username: string) => {
    if (!window.confirm(`Are you sure you want to delete ${username}? This will remove all associated data.`)) {
      return;
    }

    try {
      await api.deletePerson(id);
      setPersons(persons.filter(p => p.id !== id));
    } catch (err) {
      setError(`Failed to delete ${username}`);
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

  const handleAddToPriority = (username: string) => {
    setSelectedUsername(username);
    setShowPriorityModal(true);
  };

  const handleSubmitPriority = async () => {
    try {
      await api.addPriorityLookup(selectedUsername, priorityLevel, priorityNotes || undefined);
      await loadPriorityLookups();
      setShowPriorityModal(false);
      setSelectedUsername('');
      setPriorityNotes('');
      setPriorityLevel(1);
    } catch (err) {
      setError('Failed to add to priority queue');
      console.error(err);
    }
  };

  const handleRemoveFromPriority = async (username: string) => {
    if (!window.confirm(`Remove ${username} from priority queue?`)) {
      return;
    }

    try {
      await api.removePriorityLookup(username);
      await loadPriorityLookups();
    } catch (err) {
      setError('Failed to remove from priority queue');
      console.error(err);
    }
  };

  const handleOnDemandLookup = async (username: string) => {
    try {
      setLookupLoading(username);
      await api.affiliateLookup(username);
      await loadPersons(); // Reload to show updated data
      setError(null);
    } catch (err: any) {
      setError(`Lookup failed for ${username}: ${err.response?.data?.error || err.message}`);
    } finally {
      setLookupLoading(null);
    }
  };

  const getPriorityLookup = (username: string): PriorityLookup | undefined => {
    return priorityLookups.find(p => p.username.toLowerCase() === username.toLowerCase());
  };

  const filteredPersons = persons.filter(p => {
    if (roleFilter !== 'ALL' && p.role !== roleFilter) {
      return false;
    }
    if (searchQuery && !p.username.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

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

  const getPriorityBadgeClass = (priority: PriorityLookup) => {
    const level = priority.priority_level === 1 ? 'p1' : 'p2';
    const status = priority.status;
    return `priority-badge priority-${level} priority-${status}`;
  };

  const formatCacheAge = (ageMs: number | null): string => {
    if (ageMs === null) return 'N/A';
    const seconds = Math.floor(ageMs / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes < 1) return `${seconds}s`;
    return `${minutes}m ${seconds % 60}s`;
  };

  if (loading) {
    return (
      <div className="users">
        <div className="users-header">
          <h1>Users</h1>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="users">
      {/* Header */}
      <div className="users-header">
        <div className="header-main">
          <h1>Users</h1>
          <div className="header-stats">
            <div className="stat-card">
              <div className="stat-value">{persons.length}</div>
              <div className="stat-label">Total Users</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{priorityLookups.filter(p => p.status === 'active').length}</div>
              <div className="stat-label">Priority 2 (Active)</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{priorityLookups.filter(p => p.status === 'pending').length}</div>
              <div className="stat-label">Priority 1 (Pending)</div>
            </div>
            {cacheStatus && (
              <div className={`stat-card ${cacheStatus.fresh ? 'stat-success' : 'stat-warning'}`}>
                <div className="stat-value">{cacheStatus.roomCount}</div>
                <div className="stat-label">
                  Cached ({cacheStatus.fresh ? formatCacheAge(cacheStatus.ageMs) : 'Stale'})
                </div>
              </div>
            )}
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}

        {/* Filters */}
        <div className="filter-controls">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search usernames..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>

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
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="users-content">
        <table className="users-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('username')} className="sortable">
                Username {sortField === 'username' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('role')} className="sortable">
                Role {sortField === 'role' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th>Priority</th>
              <th onClick={() => handleSort('interaction_count')} className="sortable">
                Events {sortField === 'interaction_count' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('snapshot_count')} className="sortable">
                Snapshots {sortField === 'snapshot_count' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('last_seen_at')} className="sortable">
                Last Seen {sortField === 'last_seen_at' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="actions-column">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedPersons.map((person) => {
              const priority = getPriorityLookup(person.username);
              return (
                <tr key={person.id}>
                  <td className="username-cell">
                    <Link to={`/profile/${person.username}`}>
                      {person.username}
                    </Link>
                  </td>
                  <td>
                    <span className={getRoleBadgeClass(person.role)}>{person.role}</span>
                  </td>
                  <td>
                    {priority ? (
                      <div className="priority-cell">
                        <span className={getPriorityBadgeClass(priority)}>
                          P{priority.priority_level} - {priority.status.toUpperCase()}
                        </span>
                        <button
                          className="btn-remove-priority"
                          onClick={() => handleRemoveFromPriority(person.username)}
                          title="Remove from priority queue"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <span className="no-priority">—</span>
                    )}
                  </td>
                  <td className="count-cell">{person.interaction_count}</td>
                  <td className="count-cell">{person.snapshot_count}</td>
                  <td>{formatDate(person.last_seen_at, { relative: true })}</td>
                  <td className="actions-cell">
                    <div className="action-buttons">
                      {!priority && (
                        <button
                          className="btn-action btn-priority"
                          onClick={() => handleAddToPriority(person.username)}
                          title="Add to priority queue"
                        >
                          ★
                        </button>
                      )}
                      <button
                        className="btn-action btn-lookup"
                        onClick={() => handleOnDemandLookup(person.username)}
                        disabled={lookupLoading === person.username}
                        title="On-demand lookup"
                      >
                        {lookupLoading === person.username ? '⟳' : '🔍'}
                      </button>
                      <button
                        className="btn-action btn-delete"
                        onClick={() => handleDelete(person.id, person.username)}
                        title="Delete user"
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {sortedPersons.length === 0 && (
          <div className="empty-state">
            <p>No users found matching your filters.</p>
          </div>
        )}
      </div>

      {/* Add to Priority Modal */}
      {showPriorityModal && (
        <div className="modal-overlay" onClick={() => setShowPriorityModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Add to Priority Queue</h2>
            <div className="modal-body">
              <div className="form-field">
                <label>Username:</label>
                <input type="text" value={selectedUsername} disabled className="input-disabled" />
              </div>

              <div className="form-field">
                <label>Priority Level:</label>
                <div className="priority-options">
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="priority"
                      checked={priorityLevel === 1}
                      onChange={() => setPriorityLevel(1)}
                    />
                    <span>Priority 1 - Initial Population</span>
                    <p className="help-text">Fetched once, then marked complete</p>
                  </label>
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="priority"
                      checked={priorityLevel === 2}
                      onChange={() => setPriorityLevel(2)}
                    />
                    <span>Priority 2 - Frequent Tracking</span>
                    <p className="help-text">Checked on every poll cycle</p>
                  </label>
                </div>
              </div>

              <div className="form-field">
                <label>Notes (optional):</label>
                <textarea
                  value={priorityNotes}
                  onChange={(e) => setPriorityNotes(e.target.value)}
                  placeholder="Add notes about this user..."
                  className="textarea"
                  rows={3}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowPriorityModal(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSubmitPriority}>
                Add to Queue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;
