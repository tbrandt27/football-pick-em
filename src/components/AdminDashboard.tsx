import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $user, $isAuthenticated, $isLoading, initAuth } from '../stores/auth';
import type { Season } from '../utils/api';
import api from '../utils/api';
import { HomeIcon } from '@heroicons/react/24/outline';
// import DatabaseSwitcher from './DatabaseSwitcher';

interface AdminStats {
  users: number;
  games: number;
  teams: number;
  seasons: number;
}

interface SchedulerStatus {
  isRunning: boolean;
  isGameDay: boolean;
  isActiveGameTime: boolean;
  activeTasks: string[];
  nextUpdate: string;
}

const AdminDashboard: React.FC = () => {
  const user = useStore($user);
  const isAuthenticated = useStore($isAuthenticated);
  const isLoading = useStore($isLoading);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncLoading, setSyncLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [version, setVersion] = useState('Loading...');

  useEffect(() => {
    // Only run on client side
    if (typeof window !== 'undefined') {
      initAuth();
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && user) {
      if (!user.isAdmin) {
        window.location.href = '/dashboard';
        return;
      }
      loadData();
    } else if (!isLoading && !isAuthenticated) {
      window.location.href = '/';
    }
  }, [isAuthenticated, user, isLoading]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      
      const [statsResponse, seasonsResponse, versionResponse] = await Promise.all([
        fetch('/api/admin/stats', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        api.getSeasons(),
        fetch('/api/admin/version', {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setStats(statsData.stats);
      }

      if (seasonsResponse.success && seasonsResponse.data) {
        setSeasons(seasonsResponse.data.seasons);
      }

      if (versionResponse.ok) {
        const versionData = await versionResponse.json();
        setVersion(versionData.version);
      }

      // Load scheduler status
      await loadSchedulerStatus();
    } catch (err) {
      setError('Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  const loadSchedulerStatus = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch('/api/admin/scheduler/status', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setSchedulerStatus(data.status);
      }
    } catch (error) {
      console.error('Failed to load scheduler status:', error);
    }
  };

  const handleSeedTeams = async () => {
    try {
      setSyncLoading(true);
      setError('');
      
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch('/api/admin/seed-teams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      const data = await response.json();
      
      if (response.ok) {
        setSuccessMessage('NFL teams seeded successfully');
        loadData(); // Refresh stats
      } else {
        setError(data.error || 'Failed to seed teams');
      }
    } catch (err) {
      setError('Failed to seed teams');
    } finally {
      setSyncLoading(false);
    }
  };


  const handleSyncESPN = async (seasonId: string, week?: number) => {
    try {
      setSyncLoading(true);
      setError('');
      
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch('/api/admin/sync-espn', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ seasonId, week })
      });

      const data = await response.json();
      
      if (response.ok) {
        setSuccessMessage(data.message);
      } else {
        setError(data.error || 'Failed to sync with ESPN');
      }
    } catch (err) {
      setError('Failed to sync with ESPN');
    } finally {
      setSyncLoading(false);
    }
  };

  const handleUpdateScores = async () => {
    try {
      setSyncLoading(true);
      setError('');
      
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch('/api/admin/update-scores', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      const data = await response.json();
      
      if (response.ok) {
        setSuccessMessage(data.message);
      } else {
        setError(data.error || 'Failed to update scores');
      }
    } catch (err) {
      setError('Failed to update scores');
    } finally {
      setSyncLoading(false);
    }
  };

  const handleCalculatePicks = async (seasonId: string, week?: number) => {
    try {
      setSyncLoading(true);
      setError('');
      
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch('/api/admin/calculate-picks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ seasonId, week })
      });

      const data = await response.json();
      
      if (response.ok) {
        setSuccessMessage(data.message);
      } else {
        setError(data.error || 'Failed to calculate picks');
      }
    } catch (err) {
      setError('Failed to calculate picks');
    } finally {
      setSyncLoading(false);
    }
  };

  const handleSchedulerToggle = async () => {
    try {
      setSyncLoading(true);
      setError('');
      
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const action = schedulerStatus?.isRunning ? 'stop' : 'start';
      
      const response = await fetch(`/api/admin/scheduler/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      const data = await response.json();
      
      if (response.ok) {
        setSuccessMessage(data.message);
        setSchedulerStatus(data.status);
      } else {
        setError(data.error || `Failed to ${action} scheduler`);
      }
    } catch (err) {
      setError(`Failed to toggle scheduler`);
    } finally {
      setSyncLoading(false);
    }
  };

  const handleManualUpdate = async () => {
    try {
      setSyncLoading(true);
      setError('');
      
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch('/api/admin/scheduler/trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      const data = await response.json();
      
      if (response.ok) {
        setSuccessMessage(data.message);
      } else {
        setError(data.error || 'Failed to trigger manual update');
      }
    } catch (err) {
      setError('Failed to trigger manual update');
    } finally {
      setSyncLoading(false);
    }
  };


  if (isLoading || loading) {
    return (
      <div className="min-h-screen bg-surface-alt flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand"></div>
      </div>
    );
  }

  if (!isAuthenticated || !user || !user.isAdmin) {
    return (
      <div className="min-h-screen bg-surface-alt flex justify-center items-center">
        <div className="text-center">
          <p className="text-ink-muted mb-4">Access denied</p>
          <a
            href="/dashboard"
            className="bg-brand text-white px-6 py-2 rounded-lg hover:bg-brand-hover transition-colors flex items-center space-x-2"
          >
            <HomeIcon className="h-4 w-4" />
            <span>Go to Dashboard</span>
          </a>
        </div>
      </div>
    );
  }

  const currentSeason = seasons.find(s => s.is_current);

  return (
    <div className="min-h-screen bg-surface-alt">
      {/* Header */}
      <header className="bg-brand text-white shadow-lg">
        <div className="container mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">Admin Dashboard</h1>
              <p className="text-lg opacity-90">NFL Pickem Administration</p>
              <p className="text-sm opacity-75">Version {version}</p>
            </div>
            <div className="flex items-center space-x-4">
              <a
                href="/dashboard"
                className="bg-brand text-white hover:bg-opacity-30 px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
              >
                <HomeIcon className="h-4 w-4" />
                <span>User Dashboard</span>
              </a>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {error && (
          <div className="bg-danger-soft border border-danger text-danger-ink px-4 py-3 rounded mb-6">
            {error}
            <button onClick={() => setError('')} className="float-right text-danger-ink hover:text-danger-ink">×</button>
          </div>
        )}

        {successMessage && (
          <div className="bg-success-soft border border-success text-success-ink px-4 py-3 rounded mb-6">
            {successMessage}
            <button onClick={() => setSuccessMessage('')} className="float-right text-success-ink hover:text-success-ink">×</button>
          </div>
        )}


        {/* Administration Links */}
        <div className="bg-surface rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold text-ink mb-4">Administration Links</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <a
              href="/admin/users"
              className="bg-surface-sunk border border-line hover:border-brand hover:bg-brand-soft p-4 rounded-lg text-center transition-colors"
            >
              <div className="text-brand font-semibold">Manage Users</div>
              <div className="text-sm text-ink-muted">User accounts & permissions</div>
            </a>
            <a
              href="/admin/games"
              className="bg-surface-sunk border border-line hover:border-brand hover:bg-brand-soft p-4 rounded-lg text-center transition-colors"
            >
              <div className="text-brand font-semibold">Manage Games</div>
              <div className="text-sm text-ink-muted">Pickem games & participants</div>
            </a>
            <a
              href="/admin/teams"
              className="bg-surface-sunk border border-line hover:border-brand hover:bg-brand-soft p-4 rounded-lg text-center transition-colors"
            >
              <div className="text-brand font-semibold">Manage Teams</div>
              <div className="text-sm text-ink-muted">NFL team information</div>
            </a>
            <a
              href="/admin/seasons"
              className="bg-surface-sunk border border-line hover:border-brand hover:bg-brand-soft p-4 rounded-lg text-center transition-colors"
            >
              <div className="text-brand font-semibold">Manage Seasons</div>
              <div className="text-sm text-ink-muted">NFL seasons & schedules</div>
            </a>
            <a
              href="/admin/settings"
              className="bg-surface-sunk border border-line hover:border-brand hover:bg-brand-soft p-4 rounded-lg text-center transition-colors"
            >
              <div className="text-brand font-semibold">Settings</div>
              <div className="text-sm text-ink-muted">SMTP & system configuration</div>
            </a>
          </div>
        </div>

        {/* Management Sections */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Automatic Scheduler */}
          <div className="bg-surface rounded-lg shadow-md">
            <div className="p-6 border-b">
              <h2 className="text-2xl font-bold text-ink">Automatic Scheduler</h2>
            </div>
            <div className="p-6 space-y-4">
              {schedulerStatus && (
                <div className="bg-surface-sunk p-4 rounded-lg">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Status:</span>
                      <span className={`ml-2 px-2 py-1 rounded-full text-xs ${
                        schedulerStatus.isRunning 
                          ? 'bg-success-soft text-success-ink' 
                          : 'bg-danger-soft text-danger-ink'
                      }`}>
                        {schedulerStatus.isRunning ? 'Running' : 'Stopped'}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium">Game Day:</span>
                      <span className={`ml-2 ${schedulerStatus.isGameDay ? 'text-success' : 'text-ink-muted'}`}>
                        {schedulerStatus.isGameDay ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium">Active Hours:</span>
                      <span className={`ml-2 ${schedulerStatus.isActiveGameTime ? 'text-success' : 'text-ink-muted'}`}>
                        {schedulerStatus.isActiveGameTime ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium">Next Update:</span>
                      <span className="ml-2 text-ink-muted">{schedulerStatus.nextUpdate}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <h3 className="text-lg font-semibold mb-2">Scheduler Control</h3>
                  <p className="text-ink-muted mb-3 text-sm">
                    Automatically updates scores every 15 minutes during game days (Sun/Mon/Thu/Sat, 1-11 PM ET)
                  </p>
                  <button
                    onClick={handleSchedulerToggle}
                    disabled={syncLoading}
                    className={`px-4 py-2 rounded-lg text-white transition-colors disabled:opacity-50 ${
                      schedulerStatus?.isRunning 
                        ? 'bg-danger hover:bg-danger-ink' 
                        : 'bg-success hover:bg-success-ink'
                    }`}
                  >
                    {syncLoading ? 'Processing...' : schedulerStatus?.isRunning ? 'Stop Scheduler' : 'Start Scheduler'}
                  </button>
                </div>

                <div className="border-t pt-4">
                  <h3 className="text-lg font-semibold mb-2">Manual Update</h3>
                  <p className="text-ink-muted mb-3 text-sm">Trigger an immediate score and pick update</p>
                  <button
                    onClick={handleManualUpdate}
                    disabled={syncLoading}
                    className="bg-brand text-white px-4 py-2 rounded-lg hover:bg-brand-hover disabled:opacity-50 transition-colors"
                  >
                    {syncLoading ? 'Updating...' : 'Update Now'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* NFL Data Management */}
          <div className="bg-surface rounded-lg shadow-md">
            <div className="p-6 border-b">
              <h2 className="text-2xl font-bold text-ink">Manual NFL Data</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">Initialize Teams</h3>
                <p className="text-ink-muted mb-3">Seed the database with all 32 NFL teams</p>
                <div className="space-y-2">
                  <button
                    onClick={handleSeedTeams}
                    disabled={syncLoading}
                    className="w-full bg-brand text-white px-4 py-2 rounded-lg hover:bg-brand-hover disabled:opacity-50 transition-colors"
                  >
                    {syncLoading ? 'Seeding...' : 'Seed NFL Teams'}
                  </button>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold mb-2">Update Game Scores</h3>
                <p className="text-ink-muted mb-3">Fetch latest scores from ESPN</p>
                <button
                  onClick={handleUpdateScores}
                  disabled={syncLoading}
                  className="bg-success text-white px-4 py-2 rounded-lg hover:bg-success-ink disabled:opacity-50 transition-colors"
                >
                  {syncLoading ? 'Updating...' : 'Update Scores'}
                </button>
              </div>

            </div>
          </div>

          {/* Season Management */}
          <div className="bg-surface rounded-lg shadow-md">
            <div className="p-6 border-b">
              <h2 className="text-2xl font-bold text-ink">Season Management</h2>
            </div>
            <div className="p-6 space-y-4">
              {currentSeason ? (
                <>
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Current Season: {currentSeason.season}</h3>
                    <div className="space-y-2">
                      <button
                        onClick={() => handleSyncESPN(currentSeason.id)}
                        disabled={syncLoading}
                        className="block w-full bg-brand text-white px-4 py-2 rounded-lg hover:bg-brand-hover disabled:opacity-50 transition-colors"
                      >
                        {syncLoading ? 'Syncing...' : 'Sync Full Schedule'}
                      </button>
                      <button
                        onClick={() => handleCalculatePicks(currentSeason.id)}
                        disabled={syncLoading}
                        className="block w-full bg-warning text-white px-4 py-2 rounded-lg hover:bg-warning-ink disabled:opacity-50 transition-colors"
                      >
                        {syncLoading ? 'Calculating...' : 'Calculate All Picks'}
                      </button>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="font-semibold mb-2">Quick Week Actions</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map(week => (
                        <div key={week} className="text-center">
                          <span className="text-sm text-ink-muted">Week {week}</span>
                          <div className="flex space-x-1 mt-1">
                            <button
                              onClick={() => handleSyncESPN(currentSeason.id, week)}
                              disabled={syncLoading}
                              className="flex-1 bg-brand text-white px-1 py-1 rounded text-xs hover:bg-brand-hover disabled:opacity-50"
                              title="Sync Week"
                            >
                              S
                            </button>
                            <button
                              onClick={() => handleCalculatePicks(currentSeason.id, week)}
                              disabled={syncLoading}
                              className="flex-1 bg-success text-white px-1 py-1 rounded text-xs hover:bg-success-ink disabled:opacity-50"
                              title="Calculate Picks"
                            >
                              C
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-4">
                  <p className="text-ink-muted mb-4">No current season set</p>
                  <a
                    href="/admin/seasons"
                    className="bg-brand text-white px-4 py-2 rounded-lg hover:bg-brand-hover transition-colors"
                  >
                    Manage Seasons
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Database Switcher - Disabled due to initialization issues */}
          {/* <div className="lg:col-span-2">
            <DatabaseSwitcher />
          </div> */}
        </div>

      </main>
    </div>
  );
};

export default AdminDashboard;