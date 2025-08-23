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
      
      const [statsResponse, seasonsResponse] = await Promise.all([
        fetch('/api/admin/stats', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        api.getSeasons()
      ]);

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setStats(statsData.stats);
      }

      if (seasonsResponse.success && seasonsResponse.data) {
        setSeasons(seasonsResponse.data.seasons);
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
      <div className="min-h-screen bg-gray-100 flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated || !user || !user.isAdmin) {
    return (
      <div className="min-h-screen bg-gray-100 flex justify-center items-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Access denied</p>
          <a
            href="/dashboard"
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
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
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-red-600 text-white shadow-lg">
        <div className="container mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">Admin Dashboard</h1>
              <p className="text-lg opacity-90">NFL Pickem Administration</p>
              <p className="text-sm opacity-75">Version 0.9.10</p>
            </div>
            <div className="flex items-center space-x-4">
              <a
                href="/dashboard"
                className="bg-blue-600 text-white hover:bg-opacity-30 px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
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
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            {error}
            <button onClick={() => setError('')} className="float-right text-red-700 hover:text-red-900">×</button>
          </div>
        )}

        {successMessage && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-6">
            {successMessage}
            <button onClick={() => setSuccessMessage('')} className="float-right text-green-700 hover:text-green-900">×</button>
          </div>
        )}


        {/* Administration Links */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Administration Links</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <a
              href="/admin/users"
              className="bg-blue-100 hover:bg-blue-200 p-4 rounded-lg text-center transition-colors"
            >
              <div className="text-blue-600 font-semibold">Manage Users</div>
              <div className="text-sm text-gray-600">User accounts & permissions</div>
            </a>
            <a
              href="/admin/games"
              className="bg-green-100 hover:bg-green-200 p-4 rounded-lg text-center transition-colors"
            >
              <div className="text-green-600 font-semibold">Manage Games</div>
              <div className="text-sm text-gray-600">Pickem games & participants</div>
            </a>
            <a
              href="/admin/teams"
              className="bg-purple-100 hover:bg-purple-200 p-4 rounded-lg text-center transition-colors"
            >
              <div className="text-purple-600 font-semibold">Manage Teams</div>
              <div className="text-sm text-gray-600">NFL team information</div>
            </a>
            <a
              href="/admin/seasons"
              className="bg-orange-100 hover:bg-orange-200 p-4 rounded-lg text-center transition-colors"
            >
              <div className="text-orange-600 font-semibold">Manage Seasons</div>
              <div className="text-sm text-gray-600">NFL seasons & schedules</div>
            </a>
            <a
              href="/admin/settings"
              className="bg-indigo-100 hover:bg-indigo-200 p-4 rounded-lg text-center transition-colors"
            >
              <div className="text-indigo-600 font-semibold">Settings</div>
              <div className="text-sm text-gray-600">SMTP & system configuration</div>
            </a>
          </div>
        </div>

        {/* Management Sections */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Automatic Scheduler */}
          <div className="bg-white rounded-lg shadow-md">
            <div className="p-6 border-b">
              <h2 className="text-2xl font-bold text-gray-800">Automatic Scheduler</h2>
            </div>
            <div className="p-6 space-y-4">
              {schedulerStatus && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Status:</span>
                      <span className={`ml-2 px-2 py-1 rounded-full text-xs ${
                        schedulerStatus.isRunning 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {schedulerStatus.isRunning ? 'Running' : 'Stopped'}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium">Game Day:</span>
                      <span className={`ml-2 ${schedulerStatus.isGameDay ? 'text-green-600' : 'text-gray-600'}`}>
                        {schedulerStatus.isGameDay ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium">Active Hours:</span>
                      <span className={`ml-2 ${schedulerStatus.isActiveGameTime ? 'text-green-600' : 'text-gray-600'}`}>
                        {schedulerStatus.isActiveGameTime ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium">Next Update:</span>
                      <span className="ml-2 text-gray-600">{schedulerStatus.nextUpdate}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <h3 className="text-lg font-semibold mb-2">Scheduler Control</h3>
                  <p className="text-gray-600 mb-3 text-sm">
                    Automatically updates scores every 15 minutes during game days (Sun/Mon/Thu/Sat, 1-11 PM ET)
                  </p>
                  <button
                    onClick={handleSchedulerToggle}
                    disabled={syncLoading}
                    className={`px-4 py-2 rounded-lg text-white transition-colors disabled:opacity-50 ${
                      schedulerStatus?.isRunning 
                        ? 'bg-red-600 hover:bg-red-700' 
                        : 'bg-green-600 hover:bg-green-700'
                    }`}
                  >
                    {syncLoading ? 'Processing...' : schedulerStatus?.isRunning ? 'Stop Scheduler' : 'Start Scheduler'}
                  </button>
                </div>

                <div className="border-t pt-4">
                  <h3 className="text-lg font-semibold mb-2">Manual Update</h3>
                  <p className="text-gray-600 mb-3 text-sm">Trigger an immediate score and pick update</p>
                  <button
                    onClick={handleManualUpdate}
                    disabled={syncLoading}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {syncLoading ? 'Updating...' : 'Update Now'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* NFL Data Management */}
          <div className="bg-white rounded-lg shadow-md">
            <div className="p-6 border-b">
              <h2 className="text-2xl font-bold text-gray-800">Manual NFL Data</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">Initialize Teams</h3>
                <p className="text-gray-600 mb-3">Seed the database with all 32 NFL teams</p>
                <div className="space-y-2">
                  <button
                    onClick={handleSeedTeams}
                    disabled={syncLoading}
                    className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {syncLoading ? 'Seeding...' : 'Seed NFL Teams'}
                  </button>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold mb-2">Update Game Scores</h3>
                <p className="text-gray-600 mb-3">Fetch latest scores from ESPN</p>
                <button
                  onClick={handleUpdateScores}
                  disabled={syncLoading}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {syncLoading ? 'Updating...' : 'Update Scores'}
                </button>
              </div>

            </div>
          </div>

          {/* Season Management */}
          <div className="bg-white rounded-lg shadow-md">
            <div className="p-6 border-b">
              <h2 className="text-2xl font-bold text-gray-800">Season Management</h2>
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
                        className="block w-full bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                      >
                        {syncLoading ? 'Syncing...' : 'Sync Full Schedule'}
                      </button>
                      <button
                        onClick={() => handleCalculatePicks(currentSeason.id)}
                        disabled={syncLoading}
                        className="block w-full bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors"
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
                          <span className="text-sm text-gray-600">Week {week}</span>
                          <div className="flex space-x-1 mt-1">
                            <button
                              onClick={() => handleSyncESPN(currentSeason.id, week)}
                              disabled={syncLoading}
                              className="flex-1 bg-blue-500 text-white px-1 py-1 rounded text-xs hover:bg-blue-600 disabled:opacity-50"
                              title="Sync Week"
                            >
                              S
                            </button>
                            <button
                              onClick={() => handleCalculatePicks(currentSeason.id, week)}
                              disabled={syncLoading}
                              className="flex-1 bg-green-500 text-white px-1 py-1 rounded text-xs hover:bg-green-600 disabled:opacity-50"
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
                  <p className="text-gray-600 mb-4">No current season set</p>
                  <a
                    href="/admin/seasons"
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
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