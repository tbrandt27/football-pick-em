import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $user, $isAuthenticated, $isLoading, initAuth } from '../stores/auth';
import { HomeIcon } from '@heroicons/react/24/outline';
import { createGameSlug } from '../lib/slug';

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
    type: 'weekly' as 'weekly' | 'survivor'
  });
  const [editingGame, setEditingGame] = useState<PickemGame | null>(null);
  const [updatingGame, setUpdatingGame] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [gameToDelete, setGameToDelete] = useState<PickemGame | null>(null);
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
      loadData();
    } else if (!isLoading && !isAuthenticated) {
      window.location.href = '/';
    }
  }, [isAuthenticated, user, isLoading]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      
      console.log('[GamesManager] Loading data...');
      
      const [gamesResponse, seasonsResponse] = await Promise.all([
        fetch('/api/admin/games', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('/api/admin/seasons', {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      console.log('[GamesManager] Games response status:', gamesResponse.status);
      console.log('[GamesManager] Seasons response status:', seasonsResponse.status);

      if (gamesResponse.ok) {
        const gamesData = await gamesResponse.json();
        console.log('[GamesManager] Games data:', gamesData);
        setGames(gamesData.games || []);
      } else {
        const gamesError = await gamesResponse.json().catch(() => ({ error: 'Failed to parse games response' }));
        console.error('[GamesManager] Games error:', gamesError);
        setError(`Failed to load games: ${gamesError.error || gamesResponse.statusText}`);
      }

      if (seasonsResponse.ok) {
        const seasonsData = await seasonsResponse.json();
        console.log('[GamesManager] Seasons data:', seasonsData);
        setSeasons(seasonsData.seasons || []);
      } else {
        const seasonsError = await seasonsResponse.json().catch(() => ({ error: 'Failed to parse seasons response' }));
        console.error('[GamesManager] Seasons error:', seasonsError);
        // Don't overwrite games error if that failed
        if (!error) {
          setError(`Failed to load seasons: ${seasonsError.error || seasonsResponse.statusText}`);
        }
      }
    } catch (err) {
      console.error('[GamesManager] Load data error:', err);
      setError(`Failed to load data: ${err instanceof Error ? err.message : 'Unknown error'}`);
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
          gameType: newGame.type === 'weekly' ? 'week' : 'survivor'
        })
      });

      if (response.ok) {
        // Reload games to show the new one
        loadData();
        setShowCreateForm(false);
        setNewGame({
          name: '',
          type: 'weekly'
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
    try {
      setDeleting(true);
      setError('');
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      
      const response = await fetch(`/api/admin/games/${gameId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (response.ok) {
        // Remove the deleted game from state
        setGames(games.filter(g => g.id !== gameId));
        setShowDeleteModal(false);
        setGameToDelete(null);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to delete game');
      }
    } catch (err) {
      setError('Failed to delete game');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteClick = (game: PickemGame) => {
    setGameToDelete(game);
    setShowDeleteModal(true);
  };

  const confirmDelete = () => {
    if (gameToDelete) {
      deleteGame(gameToDelete.id, gameToDelete.name);
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
          <a href="/dashboard" className="bg-brand text-white px-6 py-2 rounded-lg hover:bg-brand-hover transition-colors flex items-center space-x-2">
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
    <div className="min-h-screen bg-surface-alt">
      {/* Header */}
      <header className="bg-brand text-white shadow-lg">
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
                className="bg-success hover:bg-success-ink text-white px-4 py-2 rounded-lg transition-colors"
              >
                Create Game
              </button>
              <a
                href="/admin"
                className="bg-ink-muted text-white hover:bg-opacity-30 px-4 py-2 rounded-lg transition-colors"
              >
                Back to Admin
              </a>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {error && (
          <div className="bg-danger-soft border border-danger text-danger-ink px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-surface p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold text-ink-muted">Total Games</h3>
            <p className="text-3xl font-bold text-brand">{games.length}</p>
          </div>
          <div className="bg-surface p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold text-ink-muted">Active Games</h3>
            <p className="text-3xl font-bold text-success">{activeGames}</p>
          </div>
          <div className="bg-surface p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold text-ink-muted">Weekly Games</h3>
            <p className="text-3xl font-bold text-brand">{weeklyGames}</p>
          </div>
          <div className="bg-surface p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold text-ink-muted">Survivor Games</h3>
            <p className="text-3xl font-bold text-danger">{survivorGames}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-surface rounded-lg shadow-md mb-8">
          <div className="p-6">
            <h2 className="text-xl font-bold text-ink mb-4">Filters</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-muted mb-2" htmlFor="gamesmanager-season">Season</label>
                <select id="gamesmanager-season"
                  value={selectedSeason}
                  onChange={(e) => setSelectedSeason(e.target.value)}
                  className="w-full px-3 py-2 border border-line-strong rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
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
                <label className="block text-sm font-medium text-ink-muted mb-2" htmlFor="gamesmanager-game-type">Game Type</label>
                <select id="gamesmanager-game-type"
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="w-full px-3 py-2 border border-line-strong rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
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
        <div className="bg-surface rounded-lg shadow-md">
          <div className="p-6 border-b">
            <h2 className="text-2xl font-bold text-ink">All Games</h2>
            <p className="text-ink-muted">Showing {filteredGames.length} of {games.length} games</p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-sunk">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-ink-subtle uppercase tracking-wider">
                    Game
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-ink-subtle uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-ink-subtle uppercase tracking-wider">
                    Commissioner
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-ink-subtle uppercase tracking-wider">
                    Season
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-ink-subtle uppercase tracking-wider">
                    Participants
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-ink-subtle uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-ink-subtle uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-ink-subtle uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-surface divide-y divide-line">
                {filteredGames.map((game) => {
                  // Ensure we have proper data fallbacks using correct property names
                  const gameName = game.name || 'Unnamed Game';
                  const gameType = game.type || 'weekly';
                  const commissionerName = game.commissioner_name || 'Unknown';
                  const seasonYear = game.season_year || 'No Season';
                  const participantCount = game.participant_count || 0;
                  const isActive = game.is_active !== undefined ? game.is_active : true;
                  const createdAt = game.created_at || new Date().toISOString();
                  
                  return (
                    <tr key={game.id} className="hover:bg-surface-sunk">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-ink">{gameName}</div>
                        {gameType === 'weekly' && game.weekly_week && (
                          <div className="text-sm text-ink-subtle">Week {game.weekly_week}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          gameType === 'weekly'
                            ? 'bg-brand-soft text-brand-ink'
                            : 'bg-danger-soft text-danger-ink'
                        }`}>
                          {gameType === 'weekly' ? 'Weekly Picks' : 'Survivor'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-ink">
                        {commissionerName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-ink">
                          {seasonYear}
                          {Boolean(game.season_is_current) && (
                            <span className="ml-2 inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-success-soft text-success-ink">
                              Current
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-ink">
                        {participantCount} players
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          isActive
                            ? 'bg-success-soft text-success-ink'
                            : 'bg-surface-alt text-ink'
                        }`}>
                          {isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-ink-subtle">
                        {new Date(createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        <button
                          onClick={() => setEditingGame(game)}
                          className="bg-brand-soft text-brand hover:bg-brand-soft px-3 py-1 rounded text-xs font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => toggleGameStatus(game.id, !isActive)}
                          className={`px-3 py-1 rounded text-xs font-medium ${
                            isActive
                              ? 'bg-danger-soft text-danger-ink hover:bg-danger-soft'
                              : 'bg-success-soft text-success-ink hover:bg-success-soft'
                          }`}
                        >
                          {isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <a
                          href={`/game/${game.id}/manage`}
                          className="bg-brand-soft text-brand hover:bg-brand-soft-hover px-3 py-1 rounded text-xs font-medium"
                        >
                          Manage
                        </a>
                        <button
                          onClick={() => handleDeleteClick(game)}
                          className="bg-danger-soft text-danger-ink hover:bg-danger-soft px-3 py-1 rounded text-xs font-medium"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredGames.length === 0 && games.length > 0 && (
            <div className="p-8 text-center text-ink-subtle">
              No games found matching the selected filters.
              <div className="mt-2 text-sm">
                Total games available: {games.length}
              </div>
            </div>
          )}
          
          {games.length === 0 && !loading && (
            <div className="p-8 text-center text-ink-subtle">
              <p className="mb-2">No games found.</p>
              <p className="text-sm">Create your first game to get started.</p>
            </div>
          )}
        </div>

        {/* Create Game Modal */}
        {showCreateForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-surface rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">Create New Game</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-ink-muted mb-1" htmlFor="gamesmanager-game-name">
                    Game Name
                  </label>
                  <input id="gamesmanager-game-name"
                    type="text"
                    value={newGame.name}
                    onChange={(e) => setNewGame({...newGame, name: e.target.value})}
                    placeholder="e.g., Week 1 Picks, 2024 Survivor Pool"
                    className="w-full px-3 py-2 border border-line-strong rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-ink-muted mb-1" htmlFor="gamesmanager-game-type-2">
                    Game Type
                  </label>
                  <select id="gamesmanager-game-type-2"
                    value={newGame.type}
                    onChange={(e) => setNewGame({...newGame, type: e.target.value as 'weekly' | 'survivor'})}
                    className="w-full px-3 py-2 border border-line-strong rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <option value="weekly">Weekly Picks</option>
                    <option value="survivor">Survivor</option>
                  </select>
                </div>

              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowCreateForm(false);
                    setError('');
                  }}
                  className="px-4 py-2 text-ink-muted hover:text-ink transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={createGame}
                  className="bg-brand text-white px-4 py-2 rounded-lg hover:bg-brand-hover transition-colors"
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
            <div className="bg-surface rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">Edit Game: {editingGame.name}</h3>
              <div className="space-y-4">
                <div>
                  <p className="block text-sm font-medium text-ink-muted mb-1">
                    Current Season
                  </p>
                  <p className="text-sm text-ink-muted mb-2">
                    Currently: {editingGame.season_year || 'No Season Assigned'}
                    {Boolean(editingGame.season_is_current) && (
                      <span className="ml-2 inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-success-soft text-success-ink">
                        Current
                      </span>
                    )}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-ink-muted mb-1" htmlFor="gamesmanager-change-season-to">
                    Change Season To
                  </label>
                  <select id="gamesmanager-change-season-to"
                    defaultValue={editingGame.season_id}
                    onChange={(e) => {
                      if (e.target.value && e.target.value !== editingGame.season_id) {
                        updateGameSeason(editingGame.id, e.target.value);
                      }
                    }}
                    disabled={updatingGame}
                    className="w-full px-3 py-2 border border-line-strong rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
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
                  <div className="text-center text-brand">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand mx-auto mb-2"></div>
                    Updating game season...
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setEditingGame(null)}
                  disabled={updatingGame}
                  className="px-4 py-2 text-ink-muted hover:text-ink transition-colors disabled:opacity-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Game Modal */}
        {showDeleteModal && gameToDelete && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-surface rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4 text-danger">Delete Game "{gameToDelete.name}"</h3>
              
              <div className="mb-6">
                <p className="text-ink-muted mb-4">
                  Are you sure you want to delete "{gameToDelete.name}"?
                </p>
                
                <div className="bg-warning-soft border border-warning rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-warning-ink mb-2">This will permanently delete:</h4>
                  <ul className="text-warning-ink text-sm space-y-1">
                    <li>• The game and all its settings</li>
                    <li>• All participants and their picks</li>
                    <li>• All game statistics and history</li>
                    <li>• Any associated weekly or survivor data</li>
                  </ul>
                </div>

                <div className="bg-danger-soft border border-danger rounded-lg p-4 mb-4">
                  <p className="text-danger-ink text-sm font-semibold">
                    ⚠️ Warning: This action cannot be undone.
                  </p>
                </div>
                
                <p className="text-ink-muted text-sm">
                  Game Type: <span className="font-semibold">{gameToDelete.type === 'weekly' ? 'Weekly Picks' : 'Survivor'}</span>
                  <br />
                  Participants: <span className="font-semibold">{gameToDelete.participant_count} players</span>
                  <br />
                  Commissioner: <span className="font-semibold">{gameToDelete.commissioner_name}</span>
                </p>
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setGameToDelete(null);
                    setError('');
                  }}
                  disabled={deleting}
                  className="px-4 py-2 text-ink-muted hover:text-ink transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="bg-danger text-white px-4 py-2 rounded-lg hover:bg-danger-ink transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                    'Delete Game'
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

export default GamesManager;