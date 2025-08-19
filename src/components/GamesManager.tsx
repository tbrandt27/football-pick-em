import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $user, $isAuthenticated, $isLoading, initAuth } from '../stores/auth';
import { HomeIcon } from '@heroicons/react/24/outline';

// Utility function to create URL-friendly slugs (matches server-side logic)
function createGameSlug(gameName: string) {
  return gameName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .trim()
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

interface PickemGame {
  id: string;
  name: string;
  type: 'weekly' | 'survivor';
  commissioner_id: string;
  season_id: string;
  weekly_week?: number;
  is_active: boolean;
  created_at: string;
  commissioner_name: string;
  participant_count: number;
  season_year?: string;
  season_is_current?: boolean;
}

interface Season {
  id: string;
  year: number;
  is_active: boolean;
}

const GamesManager: React.FC = () => {
  const user = useStore($user);
  const isAuthenticated = useStore($isAuthenticated);
  const isLoading = useStore($isLoading);
  const [games, setGames] = useState<PickemGame[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedSeason, setSelectedSeason] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newGame, setNewGame] = useState({
    name: '',
    type: 'weekly' as 'weekly' | 'survivor',
    season_id: '',
    weekly_week: 1
  });
  const [editingGame, setEditingGame] = useState<PickemGame | null>(null);
  const [updatingGame, setUpdatingGame] = useState(false);

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
      loadData();
    } else if (!isLoading && !isAuthenticated) {
      window.location.href = '/';
    }
  }, [isAuthenticated, user, isLoading]);

  const loadData = async () => {
    try {
      setLoading(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      
      const [gamesResponse, seasonsResponse] = await Promise.all([
        fetch('/api/admin/games', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('/api/admin/seasons', {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (gamesResponse.ok) {
        const gamesData = await gamesResponse.json();
        setGames(gamesData.games || []);
      }

      if (seasonsResponse.ok) {
        const seasonsData = await seasonsResponse.json();
        setSeasons(seasonsData.seasons || []);
      }
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const toggleGameStatus = async (gameId: string, isActive: boolean) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch(`/api/admin/games/${gameId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ isActive })
      });

      if (response.ok) {
        setGames(games.map(g => 
          g.id === gameId ? { ...g, is_active: isActive } : g
        ));
      } else {
        setError('Failed to update game status');
      }
    } catch (err) {
      setError('Failed to update game status');
    }
  };

  const createGame = async () => {
    try {
      if (!newGame.name) {
        setError('Game name is required');
        return;
      }

      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch('/api/games', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          gameName: newGame.name,
          gameType: newGame.type,
          season_id: newGame.season_id,
          weekly_week: newGame.type === 'weekly' ? newGame.weekly_week : null
        })
      });

      if (response.ok) {
        // Reload games to show the new one
        loadData();
        setShowCreateForm(false);
        setNewGame({
          name: '',
          type: 'weekly',
          season_id: '',
          weekly_week: 1
        });
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to create game');
      }
    } catch (err) {
      setError('Failed to create game');
    }
  };

  const updateGameSeason = async (gameId: string, seasonId: string) => {
    try {
      setUpdatingGame(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch(`/api/admin/games/${gameId}/season`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ seasonId })
      });

      if (response.ok) {
        // Reload games to show updated data
        loadData();
        setEditingGame(null);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to update game season');
      }
    } catch (err) {
      setError('Failed to update game season');
    } finally {
      setUpdatingGame(false);
    }
  };

  const deleteGame = async (gameId: string, gameName: string) => {
    if (!confirm(`Are you sure you want to delete "${gameName}"?\n\nThis action cannot be undone and will remove all participants, picks, and game data.`)) {
      return;
    }

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch(`/api/admin/games/${gameId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (response.ok) {
        // Reload games to remove the deleted one
        loadData();
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to delete game');
      }
    } catch (err) {
      setError('Failed to delete game');
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

  const filteredGames = games.filter(game => {
    const seasonMatch = selectedSeason === 'all' || game.season_id === selectedSeason;
    const typeMatch = selectedType === 'all' || game.type === selectedType;
    return seasonMatch && typeMatch;
  });

  const activeGames = games.filter(g => g.is_active).length;
  const weeklyGames = games.filter(g => g.type === 'weekly').length;
  const survivorGames = games.filter(g => g.type === 'survivor').length;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-blue-600 text-white shadow-lg">
        <div className="container mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <div>
              <nav className="text-sm opacity-90 mb-2">
                <a href="/admin" className="hover:underline">Admin</a> / Games
              </nav>
              <h1 className="text-3xl font-bold">Games Manager</h1>
              <p className="text-lg opacity-90">Manage pickem games and competitions</p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowCreateForm(true)}
                className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Create Game
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

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold text-gray-700">Total Games</h3>
            <p className="text-3xl font-bold text-blue-600">{games.length}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold text-gray-700">Active Games</h3>
            <p className="text-3xl font-bold text-green-600">{activeGames}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold text-gray-700">Weekly Games</h3>
            <p className="text-3xl font-bold text-purple-600">{weeklyGames}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold text-gray-700">Survivor Games</h3>
            <p className="text-3xl font-bold text-red-600">{survivorGames}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-md mb-8">
          <div className="p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Filters</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Season</label>
                <select
                  value={selectedSeason}
                  onChange={(e) => setSelectedSeason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Seasons</option>
                  {seasons.map(season => (
                    <option key={season.id} value={season.id}>
                      {season.year} {season.is_active ? '(Active)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Game Type</label>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Types</option>
                  <option value="weekly">Weekly Picks</option>
                  <option value="survivor">Survivor</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Games List */}
        <div className="bg-white rounded-lg shadow-md">
          <div className="p-6 border-b">
            <h2 className="text-2xl font-bold text-gray-800">All Games</h2>
            <p className="text-gray-600">Showing {filteredGames.length} of {games.length} games</p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Game
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Commissioner
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Season
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Participants
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
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
                {filteredGames.map((game) => (
                  <tr key={game.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{game.name}</div>
                      {game.type === 'weekly' && game.weekly_week && (
                        <div className="text-sm text-gray-500">Week {game.weekly_week}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        game.type === 'weekly' 
                          ? 'bg-purple-100 text-purple-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {game.type === 'weekly' ? 'Weekly Picks' : 'Survivor'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {game.commissioner_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {game.season_year || 'No Season'}
                        {game.season_is_current && (
                          <span className="ml-2 inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                            Current
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {game.participant_count} players
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        game.is_active 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {game.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(game.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      <button
                        onClick={() => setEditingGame(game)}
                        className="bg-blue-100 text-blue-700 hover:bg-blue-200 px-3 py-1 rounded text-xs font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => toggleGameStatus(game.id, !game.is_active)}
                        className={`px-3 py-1 rounded text-xs font-medium ${
                          game.is_active
                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                            : 'bg-green-100 text-green-700 hover:bg-green-200'
                        }`}
                      >
                        {game.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <a
                        href={`/game/${game.id}/manage`}
                        className="bg-purple-100 text-purple-700 hover:bg-purple-200 px-3 py-1 rounded text-xs font-medium"
                      >
                        Manage
                      </a>
                      <button
                        onClick={() => deleteGame(game.id, game.name)}
                        className="bg-red-100 text-red-700 hover:bg-red-200 px-3 py-1 rounded text-xs font-medium"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredGames.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              No games found matching the selected filters.
            </div>
          )}
        </div>

        {/* Create Game Modal */}
        {showCreateForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">Create New Game</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Game Name
                  </label>
                  <input
                    type="text"
                    value={newGame.name}
                    onChange={(e) => setNewGame({...newGame, name: e.target.value})}
                    placeholder="e.g., Week 1 Picks, 2024 Survivor Pool"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Game Type
                  </label>
                  <select
                    value={newGame.type}
                    onChange={(e) => setNewGame({...newGame, type: e.target.value as 'weekly' | 'survivor'})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="weekly">Weekly Picks</option>
                    <option value="survivor">Survivor</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Season
                  </label>
                  <select
                    value={newGame.season_id}
                    onChange={(e) => setNewGame({...newGame, season_id: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a season</option>
                    {seasons.map(season => (
                      <option key={season.id} value={season.id}>
                        {season.year} {season.is_active ? '(Active)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {newGame.type === 'weekly' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Week Number
                    </label>
                    <select
                      value={newGame.weekly_week}
                      onChange={(e) => setNewGame({...newGame, weekly_week: parseInt(e.target.value)})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {Array.from({length: 18}, (_, i) => i + 1).map(week => (
                        <option key={week} value={week}>Week {week}</option>
                      ))}
                    </select>
                  </div>
                )}
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
                  onClick={createGame}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Create Game
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Game Modal */}
        {editingGame && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">Edit Game: {editingGame.name}</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Current Season
                  </label>
                  <p className="text-sm text-gray-600 mb-2">
                    Currently: {editingGame.season_year || 'No Season Assigned'}
                    {editingGame.season_is_current && (
                      <span className="ml-2 inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                        Current
                      </span>
                    )}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Change Season To
                  </label>
                  <select
                    defaultValue={editingGame.season_id}
                    onChange={(e) => {
                      if (e.target.value && e.target.value !== editingGame.season_id) {
                        updateGameSeason(editingGame.id, e.target.value);
                      }
                    }}
                    disabled={updatingGame}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a season</option>
                    {seasons.map(season => (
                      <option key={season.id} value={season.id}>
                        {season.year} {season.is_active ? '(Active)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {updatingGame && (
                  <div className="text-center text-blue-600">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
                    Updating game season...
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setEditingGame(null)}
                  disabled={updatingGame}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default GamesManager;