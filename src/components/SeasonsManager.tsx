import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $user, $isAuthenticated, $isLoading, initAuth } from '../stores/auth';
import { HomeIcon } from '@heroicons/react/24/outline';

interface Season {
  id: string;
  year: number;
  is_active: boolean;
  created_at: string;
  game_count: number;
  football_games_count: number;
}


const SeasonsManager: React.FC = () => {
  const user = useStore($user);
  const isAuthenticated = useStore($isAuthenticated);
  const isLoading = useStore($isLoading);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newSeasonYear, setNewSeasonYear] = useState(new Date().getFullYear());
  const [syncingSeasonId, setSyncingSeasonId] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [seasonToDelete, setSeasonToDelete] = useState<Season | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
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
      loadSeasons();
    } else if (!isLoading && !isAuthenticated) {
      window.location.href = '/';
    }
  }, [isAuthenticated, user, isLoading]);

  const loadSeasons = async () => {
    try {
      setLoading(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch('/api/admin/seasons', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setSeasons(data.seasons || []);
      } else {
        setError('Failed to load seasons');
      }
    } catch (err) {
      setError('Failed to load seasons');
    } finally {
      setLoading(false);
    }
  };

  const createSeason = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch('/api/admin/seasons', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ year: newSeasonYear })
      });

      if (response.ok) {
        const data = await response.json();
        setSeasons([data.season, ...seasons]);
        setShowCreateForm(false);
        setNewSeasonYear(new Date().getFullYear() + 1);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to create season');
      }
    } catch (err) {
      setError('Failed to create season');
    }
  };

  const syncNFLGames = async (seasonId: string) => {
    try {
      setSyncingSeasonId(seasonId);
      setError('');
      setSuccess('');
      
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch(`/api/admin/seasons/${seasonId}/sync-nfl-games`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        
        // Update the season with new game count
        setSeasons(seasons.map(s =>
          s.id === seasonId ? { ...s, football_games_count: data.gamesCount } : s
        ));
        
        // Show success message
        setSuccess(`✅ ${data.message} - ${data.created} created, ${data.updated} updated`);
        
        // Reload seasons to get fresh data
        setTimeout(() => loadSeasons(), 1000);
        
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to sync NFL games');
      }
    } catch (err: any) {
      setError(`Failed to sync NFL games: ${err.message}`);
    } finally {
      setSyncingSeasonId(null);
    }
  };

  const setCurrentSeason = async (seasonId: string) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch(`/api/admin/seasons/${seasonId}/current`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      if (response.ok) {
        // Update all seasons - set this one as active, others as inactive
        setSeasons(seasons.map(s => ({
          ...s,
          is_active: s.id === seasonId
        })));
      } else {
        setError('Failed to set current season');
      }
    } catch (err) {
      setError('Failed to set current season');
    }
  };

  const unsetCurrentSeason = async (seasonId: string) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch(`/api/admin/seasons/${seasonId}/unset-current`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      if (response.ok) {
        // Update the season to be inactive
        setSeasons(seasons.map(s => ({
          ...s,
          is_active: s.id === seasonId ? false : s.is_active
        })));
      } else {
        setError('Failed to unset current season');
      }
    } catch (err) {
      setError('Failed to unset current season');
    }
  };

  const deleteSeason = async (seasonId: string, seasonYear: number) => {
    try {
      setDeleting(true);
      setError('');
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      
      console.log('Attempting to delete season:', { seasonId, seasonYear });
      
      const response = await fetch(`/api/admin/seasons/${seasonId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      console.log('Delete response status:', response.status);
      
      if (response.ok) {
        setSeasons(seasons.filter(s => s.id !== seasonId));
        setSuccess(`Season ${seasonYear} deleted successfully`);
        setShowDeleteModal(false);
        setSeasonToDelete(null);
        setTimeout(() => setSuccess(''), 5000);
      } else {
        const errorData = await response.json();
        console.error('Delete error response:', errorData);
        setError(errorData.error || 'Failed to delete season');
      }
    } catch (err) {
      console.error('Delete exception:', err);
      setError('Failed to delete season');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteClick = (season: Season) => {
    setSeasonToDelete(season);
    setShowDeleteModal(true);
  };

  const confirmDelete = () => {
    if (seasonToDelete) {
      deleteSeason(seasonToDelete.id, seasonToDelete.year);
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
          <a href="/dashboard" className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2">
            <HomeIcon className="h-4 w-4" />
            <span>Go to Dashboard</span>
          </a>
        </div>
      </div>
    );
  }

  const currentYear = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-orange-600 text-white shadow-lg">
        <div className="container mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <div>
              <nav className="text-sm opacity-90 mb-2">
                <a href="/admin" className="hover:underline">Admin</a> / Seasons
              </nav>
              <h1 className="text-3xl font-bold">Seasons Manager</h1>
              <p className="text-lg opacity-90">Manage NFL seasons and game data</p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowCreateForm(true)}
                className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Create Season
              </button>
              <a
                href="/admin"
                className="bg-gray-600 text-white hover:bg-opacity-30 px-4 py-2 rounded-lg transition-colors"
              >
                Back to Admin
              </a>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-6">
            {success}
          </div>
        )}


        {/* Seasons List */}
        <div className="bg-white rounded-lg shadow-md">
          <div className="p-6 border-b">
            <h2 className="text-2xl font-bold text-gray-800">All Seasons</h2>
            <p className="text-gray-600">Manage NFL seasons and their game data</p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Season
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Games
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Football Games
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {seasons.map((season) => (
                  <tr key={season.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-lg font-medium text-gray-900">{season.year}</div>
                      {season.year === currentYear && (
                        <div className="text-sm text-blue-600">Current Year</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        season.is_active 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {season.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {season.game_count} pickem games
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {season.football_games_count} football games
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(season.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                     <div className="flex flex-wrap gap-2">
                       {season.is_active ? (
                         <button
                           onClick={() => unsetCurrentSeason(season.id)}
                           className="bg-red-100 text-red-700 hover:bg-red-200 px-3 py-1 rounded text-xs font-medium"
                         >
                           Unset as Current
                         </button>
                       ) : (
                         <button
                           onClick={() => setCurrentSeason(season.id)}
                           className="bg-green-100 text-green-700 hover:bg-green-200 px-3 py-1 rounded text-xs font-medium"
                         >
                           Set as Current
                         </button>
                       )}
                       <button
                         onClick={() => syncNFLGames(season.id)}
                         disabled={syncingSeasonId === season.id}
                         className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                           syncingSeasonId === season.id
                             ? 'bg-yellow-100 text-yellow-700 cursor-not-allowed'
                             : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                         }`}
                       >
                         {syncingSeasonId === season.id ? (
                           <span className="flex items-center space-x-1">
                             <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                               <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                               <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                             </svg>
                             <span>Syncing...</span>
                           </span>
                         ) : (
                           'Sync NFL Games'
                         )}
                       </button>
                       <a
                         href={`/admin/seasons/${season.year}/schedule`}
                         className="bg-purple-100 text-purple-700 hover:bg-purple-200 px-3 py-1 rounded text-xs font-medium inline-block"
                       >
                         View Schedule
                       </a>
                       <button
                         onClick={() => handleDeleteClick(season)}
                         className="bg-red-100 text-red-700 hover:bg-red-200 px-3 py-1 rounded text-xs font-medium"
                       >
                         Delete Season
                       </button>
                     </div>
                   </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {seasons.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              No seasons found. Create your first season to get started.
            </div>
          )}
        </div>

        {/* Create Season Modal */}
        {showCreateForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">Create New Season</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Season Year
                  </label>
                  <input
                    type="number"
                    value={newSeasonYear}
                    onChange={(e) => setNewSeasonYear(parseInt(e.target.value))}
                    min="2020"
                    max="2030"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Enter the year for the NFL season (e.g., 2024 for the 2024-25 season)
                  </p>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowCreateForm(false);
                    setError('');
                  }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={createSeason}
                  className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors"
                >
                  Create Season
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Season Modal */}
        {showDeleteModal && seasonToDelete && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4 text-red-600">Delete Season {seasonToDelete.year}</h3>
              
              <div className="mb-6">
                <p className="text-gray-700 mb-4">
                  Are you sure you want to delete season {seasonToDelete.year}?
                </p>
                
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-yellow-800 mb-2">This will permanently delete:</h4>
                  <ul className="text-yellow-700 text-sm space-y-1">
                    <li>• The season record</li>
                    <li>• All {seasonToDelete.football_games_count} football games for this season</li>
                  </ul>
                </div>

                {seasonToDelete.game_count > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                    <p className="text-red-700 text-sm font-semibold">
                      ⚠️ Warning: This season has {seasonToDelete.game_count} associated pick'em games.
                      You must delete those games first before deleting the season.
                    </p>
                  </div>
                )}
                
                <p className="text-gray-600 text-sm font-semibold">
                  This action cannot be undone.
                </p>
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setSeasonToDelete(null);
                    setError('');
                  }}
                  disabled={deleting}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={deleting || seasonToDelete.game_count > 0}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleting ? (
                    <span className="flex items-center space-x-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      <span>Deleting...</span>
                    </span>
                  ) : (
                    'Delete Season'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
};

export default SeasonsManager;