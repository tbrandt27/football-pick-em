import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $user, $isAuthenticated, $isLoading, initAuth, logout } from '../stores/auth';
import type { PickemGame, NFLTeam, SeasonStatus } from '../utils/api';
import api, { createGameSlug } from '../utils/api';
import { UserCircleIcon, ArrowLeftStartOnRectangleIcon, CogIcon, Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';

const Dashboard: React.FC = () => {
  const user = useStore($user);
  const isAuthenticated = useStore($isAuthenticated);
  const isLoading = useStore($isLoading);
  const [games, setGames] = useState<PickemGame[]>([]);
  const [teams, setTeams] = useState<NFLTeam[]>([]);
  const [favoriteTeam, setFavoriteTeam] = useState<NFLTeam | null>(null);
  const [defaultTeam, setDefaultTeam] = useState<NFLTeam | null>(null);
  const [seasonStatus, setSeasonStatus] = useState<SeasonStatus | null>(null);
  const [currentSeason, setCurrentSeason] = useState<{ id: string; season: string } | null>(null);
  const [gamePicksData, setGamePicksData] = useState<Record<string, { userPicks: number; totalPicks: number }>>({});
  const [showCreateGame, setShowCreateGame] = useState(false);
  const [newGameName, setNewGameName] = useState('');
  const [newGameType, setNewGameType] = useState<'week' | 'survivor'>('week');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    // Only run on client side
    if (typeof window !== 'undefined') {
      initAuth();
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && user) {
      loadData();
    } else if (!isLoading && !isAuthenticated) {
      // Redirect to login
      window.location.href = '/';
    }
  }, [isAuthenticated, user, isLoading]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const [gamesResponse, teamsResponse, seasonStatusResponse, currentSeasonResponse] = await Promise.all([
        api.getGames(),
        api.getTeams(),
        api.getSeasonStatus(),
        api.getCurrentSeason(),
      ]);

      // Always load the default team for fallback
      await loadDefaultTeam();

      if (gamesResponse.success && gamesResponse.data) {
        setGames(gamesResponse.data.games);
      }

      if (teamsResponse.success && teamsResponse.data) {
        setTeams(teamsResponse.data.teams);
        
        // Find user's favorite team
        if (user?.favoriteTeamId) {
          const favTeam = teamsResponse.data.teams.find(t => t.id === user.favoriteTeamId);
          setFavoriteTeam(favTeam || null);
        } else {
          setFavoriteTeam(null);
        }
      }

      // Get season status from ESPN
      if (seasonStatusResponse.success && seasonStatusResponse.data) {
        setSeasonStatus(seasonStatusResponse.data.status);
      }

      if (currentSeasonResponse.success && currentSeasonResponse.data) {
        setCurrentSeason(currentSeasonResponse.data.season);
        
        // Load picks data for each game
        if (gamesResponse.success && gamesResponse.data && seasonStatusResponse.success && seasonStatusResponse.data) {
          await loadGamePicksData(gamesResponse.data.games, currentSeasonResponse.data.season.id, seasonStatusResponse.data.status);
        }
      }
    } catch (err) {
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const loadDefaultTeam = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch('/api/admin/default-team', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setDefaultTeam(data.defaultTeam);
      }
    } catch (err) {
      console.error('Failed to load default team:', err);
    }
  };

  const loadGamePicksData = async (games: PickemGame[], seasonId: string, seasonStatus: SeasonStatus) => {
    try {
      // Use week 1 if in preseason, otherwise use current week
      const week = seasonStatus.isPreseason ? 1 : seasonStatus.week;
      
      const picksDataPromises = games.map(async (game) => {
        try {
          // Get user's picks for this game and week
          const userPicksResponse = await api.getUserPicks({
            gameId: game.id,
            seasonId: seasonId,
            week: week
          });
          
          // Get total picks summary for this game and week
          const picksSummaryResponse = await api.getPicksSummary(game.id, seasonId, week);
          
          const userPicksCount = userPicksResponse.success ? userPicksResponse.data?.picks.length || 0 : 0;
          
          // Calculate total possible picks from summary
          let totalPicks = 0;
          if (picksSummaryResponse.success && picksSummaryResponse.data) {
            totalPicks = picksSummaryResponse.data.summary.length;
          }
          
          return {
            gameId: game.id,
            userPicks: userPicksCount,
            totalPicks: totalPicks
          };
        } catch (error) {
          console.error(`Failed to load picks for game ${game.id}:`, error);
          return {
            gameId: game.id,
            userPicks: 0,
            totalPicks: 0
          };
        }
      });
      
      const picksResults = await Promise.all(picksDataPromises);
      
      // Convert to object for easy lookup
      const picksData = picksResults.reduce((acc, result) => {
        acc[result.gameId] = {
          userPicks: result.userPicks,
          totalPicks: result.totalPicks
        };
        return acc;
      }, {} as Record<string, { userPicks: number; totalPicks: number }>);
      
      setGamePicksData(picksData);
    } catch (error) {
      console.error('Failed to load game picks data:', error);
    }
  };

  const handleCreateGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGameName.trim()) return;

    try {
      const response = await api.createGame(newGameName.trim(), newGameType);
      
      if (response.success && response.data) {
        setGames([response.data.game, ...games]);
        setNewGameName('');
        setShowCreateGame(false);
      } else {
        setError(response.error || 'Failed to create game');
      }
    } catch (err) {
      setError('Failed to create game');
    }
  };


  if (isLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen bg-gray-100 flex justify-center items-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Please log in to continue</p>
          <a
            href="/"
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  const getHeaderStyle = () => {
    const activeTeam = favoriteTeam || defaultTeam;
    if (activeTeam?.team_primary_color && activeTeam?.team_secondary_color) {
      return {
        background: `linear-gradient(135deg, ${activeTeam.team_primary_color} 0%, ${activeTeam.team_secondary_color} 100%)`
      };
    }
    // Fallback if both teams are null
    return {
      background: `linear-gradient(135deg, #013369 0%, #d50a0a 100%)`
    };
  };

  const getActiveTeam = () => {
    return favoriteTeam || defaultTeam;
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-blue-600 text-white shadow-lg" style={getHeaderStyle()}>
        <div className="container mx-auto px-4 py-6">
          {/* Desktop Layout */}
          <div className="hidden md:flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <img
                src={getActiveTeam()?.team_logo || '/logos/NFL.svg'}
                alt={getActiveTeam() ? `${getActiveTeam()?.team_city} ${getActiveTeam()?.team_name} logo` : 'NFL logo'}
                className="w-16 h-16 object-contain"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = '/logos/NFL.svg';
                  target.alt = 'NFL logo';
                }}
              />
              <div>
                <h1 className="text-3xl font-bold">NFL Pickem</h1>
                <p className="text-lg opacity-90">
                  Welcome back, {user.firstName}!
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {user.isAdmin && (
                <a
                  href="/admin"
                  className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
                >
                  <CogIcon className="h-4 w-4" />
                  <span>Admin Panel</span>
                </a>
              )}
              <a
                href="/profile"
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
              >
                <UserCircleIcon className="h-4 w-4" />
                <span>Profile</span>
              </a>
              <button
                onClick={logout}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
              >
                <ArrowLeftStartOnRectangleIcon className="h-4 w-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>

          {/* Mobile Layout */}
          <div className="md:hidden">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-4">
                <img
                  src={getActiveTeam()?.team_logo || '/logos/NFL.svg'}
                  alt={getActiveTeam() ? `${getActiveTeam()?.team_city} ${getActiveTeam()?.team_name} logo` : 'NFL logo'}
                  className="w-12 h-12 object-contain"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = '/logos/NFL.svg';
                    target.alt = 'NFL logo';
                  }}
                />
                <div>
                  <h1 className="text-2xl font-bold">NFL Pickem</h1>
                  <p className="text-sm opacity-90">
                    Welcome back, {user.firstName}!
                  </p>
                </div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="bg-blue-500 hover:bg-blue-600 text-white p-2 rounded-lg transition-colors"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? (
                  <XMarkIcon className="h-6 w-6" />
                ) : (
                  <Bars3Icon className="h-6 w-6" />
                )}
              </button>
            </div>

            {/* Mobile Menu */}
            {mobileMenuOpen && (
              <div className="mt-4 pt-4 border-t border-blue-500">
                <div className="space-y-2">
                  {user.isAdmin && (
                    <a
                      href="/admin"
                      className="flex items-center space-x-3 bg-purple-500 hover:bg-purple-600 text-white px-4 py-3 rounded-lg transition-colors"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <CogIcon className="h-5 w-5" />
                      <span>Admin Panel</span>
                    </a>
                  )}
                  <a
                    href="/profile"
                    className="flex items-center space-x-3 bg-blue-500 hover:bg-blue-600 text-white px-4 py-3 rounded-lg transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <UserCircleIcon className="h-5 w-5" />
                    <span>Profile</span>
                  </a>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      logout();
                    }}
                    className="w-full flex items-center space-x-3 bg-red-500 hover:bg-red-600 text-white px-4 py-3 rounded-lg transition-colors"
                  >
                    <ArrowLeftStartOnRectangleIcon className="h-5 w-5" />
                    <span>Logout</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {/* Current Week Card */}
        <div className="bg-white rounded-lg shadow-md mb-8">
          <div className="p-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">
                {seasonStatus?.isPreseason
                  ? `Preseason Week ${seasonStatus.week}`
                  : `Week ${seasonStatus?.week || 1}`
                }
              </h2>
              <div className="text-sm text-gray-500 mt-1">{seasonStatus?.year || '2024'} Season</div>
            </div>
          </div>
        </div>

        {/* Games Section */}
        <div className="bg-white rounded-lg shadow-md">
          <div className="p-6 border-b">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-800">Your Games</h2>
              <button
                onClick={() => setShowCreateGame(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Create New Game
              </button>
            </div>
          </div>

          <div className="p-6">
            {games.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-600 mb-4">No games found. Create your first game!</p>
                <button
                  onClick={() => setShowCreateGame(true)}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Create Game
                </button>
              </div>
            ) : (
              <div className="grid gap-6">
                {games.map((game) => (
                  <div
                    key={game.id}
                    className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-xl font-semibold text-gray-800">
                            {game.game_name}
                          </h3>
                          <span className="hidden md:inline-block px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800 capitalize">
                            {game.game_type}
                          </span>
                          <span className="hidden md:inline text-sm text-gray-500">•</span>
                          <span className="hidden md:inline text-sm text-gray-600">{game.player_count} players</span>
                        </div>
                        <div className="flex items-center space-x-3">
                          {gamePicksData[game.id] && (
                            <span className="hidden md:inline-block px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-800">
                              {seasonStatus?.isPreseason ? 'Week 1: ' : `Week ${seasonStatus?.week || 1}: `}
                              {gamePicksData[game.id].userPicks}/{gamePicksData[game.id].totalPicks} picks
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <a
                          href={`/game/${createGameSlug(game.game_name)}`}
                          className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition-colors"
                        >
                          View
                        </a>
                        {game.user_role === 'owner' && (
                          <a
                            href={`/game/${game.id}/manage`}
                            className="bg-gray-600 text-white px-3 py-1 rounded text-sm hover:bg-gray-700 transition-colors"
                          >
                            Manage
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Game-specific stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-purple-600">
                          {gamePicksData[game.id] ? 
                            `${gamePicksData[game.id].userPicks}/${gamePicksData[game.id].totalPicks}` : 
                            '--'
                          }
                        </div>
                        <div className="text-xs text-gray-500">
                          {seasonStatus?.isPreseason ? 'Week 1 Picks' : `Week ${seasonStatus?.week || 1} Picks`}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">--</div>
                        <div className="text-xs text-gray-500">Your Rank</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">--%</div>
                        <div className="text-xs text-gray-500">Win Rate</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-orange-600">--</div>
                        <div className="text-xs text-gray-500">Points</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Create Game Modal */}
      {showCreateGame && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Create New Game</h3>
            <form onSubmit={handleCreateGame}>
              <div className="mb-4">
                <label htmlFor="gameName" className="block text-sm font-medium text-gray-700 mb-1">
                  Game Name
                </label>
                <input
                  type="text"
                  id="gameName"
                  value={newGameName}
                  onChange={(e) => setNewGameName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Family League 2024"
                />
              </div>
              <div className="mb-6">
                <label htmlFor="gameType" className="block text-sm font-medium text-gray-700 mb-1">
                  Game Type
                </label>
                <select
                  id="gameType"
                  value={newGameType}
                  onChange={(e) => setNewGameType(e.target.value as 'week' | 'survivor')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="week">Weekly Picks</option>
                  <option value="survivor">Survivor</option>
                </select>
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCreateGame(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Create Game
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;