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
  nfl_games_count: number;
}

interface NFLGame {
  id: string;
  week: number;
  season_type: number; // 1=preseason, 2=regular, 3=postseason
  home_team_id: string;
  away_team_id: string;
  home_score: number;
  away_score: number;
  start_time: string;
  status: string;
  home_team_city: string;
  home_team_name: string;
  home_team_code: string;
  away_team_city: string;
  away_team_name: string;
  away_team_code: string;
}

const SeasonSchedule: React.FC = () => {
  const user = useStore($user);
  const isAuthenticated = useStore($isAuthenticated);
  const isLoading = useStore($isLoading);
  const [season, setSeason] = useState<Season | null>(null);
  const [games, setGames] = useState<NFLGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingGame, setEditingGame] = useState<string | null>(null);
  const [editDateTime, setEditDateTime] = useState('');

  const seasonYear = typeof window !== 'undefined' ? 
    window.location.pathname.split('/')[3] : null;

  useEffect(() => {
    if (typeof window !== 'undefined') {
      initAuth();
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && user && seasonYear) {
      if (!user.isAdmin) {
        window.location.href = '/dashboard';
        return;
      }
      loadSeasonAndGames();
    } else if (!isLoading && !isAuthenticated) {
      window.location.href = '/';
    }
  }, [isAuthenticated, user, isLoading, seasonYear]);

  const loadSeasonAndGames = async () => {
    if (!seasonYear) return;
    
    try {
      setLoading(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      
      // First get all seasons to find the one with matching year
      const seasonResponse = await fetch(`/api/admin/seasons`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!seasonResponse.ok) {
        setError('Failed to load seasons');
        return;
      }

      const seasonData = await seasonResponse.json();
      
      // The admin API maps s.season as year in the SQL query
      const currentSeason = seasonData.seasons.find((s: Season) => {
        return s.year?.toString() === seasonYear?.toString();
      });
      
      if (!currentSeason) {
        setError(`Season ${seasonYear} not found. Available: ${seasonData.seasons.map((s: any) => s.year).join(', ')}`);
        return;
      }
      
      setSeason(currentSeason);

      // Now load games for this season
      const gamesResponse = await fetch(`/api/seasons/${currentSeason.id}/games`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (gamesResponse.ok) {
        const gamesData = await gamesResponse.json();
        setGames(gamesData.games || []);
      } else {
        setError('Failed to load season games');
      }
    } catch (err) {
      setError('Failed to load season data');
    } finally {
      setLoading(false);
    }
  };

  const updateGameDateTime = async (gameId: string, newDateTime: string) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch(`/api/admin/nfl-games/${gameId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          start_time: newDateTime
        })
      });

      if (response.ok) {
        setGames(games.map(g => 
          g.id === gameId ? { ...g, start_time: newDateTime } : g
        ));
        setEditingGame(null);
        setEditDateTime('');
      } else {
        setError('Failed to update game time');
      }
    } catch (err) {
      setError('Failed to update game time');
    }
  };

  const startEditing = (game: NFLGame) => {
    setEditingGame(game.id);
    // Format datetime for input
    const date = new Date(game.start_time);
    const formatted = date.toISOString().slice(0, 16);
    setEditDateTime(formatted);
  };

  if (isLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
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

  if (!season) {
    return (
      <div className="min-h-screen bg-gray-100 flex justify-center items-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Season not found</p>
          <a href="/admin/seasons" className="bg-orange-600 text-white px-6 py-2 rounded-lg hover:bg-orange-700 transition-colors">
            Back to Seasons
          </a>
        </div>
      </div>
    );
  }

  // Group games by season type first, then by week
  const gamesBySeasonType = games.reduce((acc, game) => {
    const seasonType = game.season_type || 2; // Default to regular season
    if (!acc[seasonType]) acc[seasonType] = {};
    
    const week = game.week || 1;
    if (!acc[seasonType][week]) acc[seasonType][week] = [];
    acc[seasonType][week].push(game);
    
    return acc;
  }, {} as Record<number, Record<number, NFLGame[]>>);

  const preseasonGames = gamesBySeasonType[1] || {};
  const regularSeasonGames = gamesBySeasonType[2] || {};
  const postseasonGames = gamesBySeasonType[3] || {};

  const getSeasonTypeLabel = (seasonType: number) => {
    switch (seasonType) {
      case 1: return 'Preseason';
      case 2: return 'Regular Season';
      case 3: return 'Postseason';
      default: return 'Unknown';
    }
  };

  const getSeasonTypeColor = (seasonType: number) => {
    switch (seasonType) {
      case 1: return 'bg-blue-600'; // Preseason - Blue
      case 2: return 'bg-orange-600'; // Regular Season - Orange
      case 3: return 'bg-purple-600'; // Postseason - Purple
      default: return 'bg-gray-600';
    }
  };

  const renderSeasonSection = (seasonType: number, gamesGrouped: Record<number, NFLGame[]>) => {
    if (Object.keys(gamesGrouped).length === 0) return null;

    const totalGames = Object.values(gamesGrouped).flat().length;
    
    return (
      <div key={seasonType} className="mb-8">
        <div className={`${getSeasonTypeColor(seasonType)} text-white rounded-t-lg px-6 py-4`}>
          <h2 className="text-2xl font-bold">
            {getSeasonTypeLabel(seasonType)} ({totalGames} games)
          </h2>
        </div>
        
        <div className="space-y-4 mt-4">
          {Object.entries(gamesGrouped)
            .sort(([a], [b]) => parseInt(a) - parseInt(b))
            .map(([week, weekGames]) => (
              <div key={`${seasonType}-${week}`} className="bg-white rounded-lg shadow-md">
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 rounded-t-lg">
                  <h3 className="text-xl font-bold text-gray-800">
                    Week {week} ({weekGames.length} games)
                  </h3>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {weekGames.map((game) => (
                      <div key={game.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-center mb-3">
                          {editingGame === game.id ? (
                            <div className="flex-1">
                              <input
                                type="datetime-local"
                                value={editDateTime}
                                onChange={(e) => setEditDateTime(e.target.value)}
                                className="text-sm border border-orange-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-orange-500"
                              />
                              <div className="flex space-x-2 mt-2">
                                <button
                                  onClick={() => updateGameDateTime(game.id, editDateTime)}
                                  className="bg-green-500 text-white px-2 py-1 rounded text-xs hover:bg-green-600"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingGame(null);
                                    setEditDateTime('');
                                  }}
                                  className="bg-gray-500 text-white px-2 py-1 rounded text-xs hover:bg-gray-600"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div
                              className="cursor-pointer hover:bg-orange-50 p-1 rounded"
                              onClick={() => startEditing(game)}
                            >
                              <div className="text-sm text-gray-600">
                                {new Date(game.start_time).toLocaleDateString()}
                              </div>
                              <div className="text-sm text-gray-600">
                                {new Date(game.start_time).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <div className="w-6 h-6 flex items-center justify-center">
                                <img
                                  src={`/logos/${game.away_team_code}.svg`}
                                  alt={`${game.away_team_code} logo`}
                                  className="w-6 h-6 object-contain"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    const container = target.parentElement;
                                    if (container) {
                                      container.innerHTML = `
                                        <div class="w-6 h-6 bg-gray-300 rounded flex items-center justify-center">
                                          <span class="text-xs font-bold text-gray-600">${game.away_team_code}</span>
                                        </div>
                                      `;
                                    }
                                  }}
                                  onLoad={() => {
                                    // Logo loaded successfully
                                  }}
                                />
                              </div>
                              <span className="text-xs bg-gray-200 px-2 py-1 rounded font-mono">
                                {game.away_team_code}
                              </span>
                              <span className="text-sm">
                                {game.away_team_city} {game.away_team_name}
                              </span>
                            </div>
                            <span className="font-mono text-sm font-bold">
                              {game.away_score || 0}
                            </span>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <div className="w-6 h-6 flex items-center justify-center">
                                <img
                                  src={`/logos/${game.home_team_code}.svg`}
                                  alt={`${game.home_team_code} logo`}
                                  className="w-6 h-6 object-contain"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    const container = target.parentElement;
                                    if (container) {
                                      container.innerHTML = `
                                        <div class="w-6 h-6 bg-gray-300 rounded flex items-center justify-center">
                                          <span class="text-xs font-bold text-gray-600">${game.home_team_code}</span>
                                        </div>
                                      `;
                                    }
                                  }}
                                  onLoad={() => {
                                    // Logo loaded successfully
                                  }}
                                />
                              </div>
                              <span className="text-xs bg-gray-200 px-2 py-1 rounded font-mono">
                                {game.home_team_code}
                              </span>
                              <span className="text-sm">
                                {game.home_team_city} {game.home_team_name}
                              </span>
                            </div>
                            <span className="font-mono text-sm font-bold">
                              {game.home_score || 0}
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 pt-3 border-t">
                          <span className={`text-xs px-2 py-1 rounded font-medium ${
                            game.status === 'STATUS_FINAL'
                              ? 'bg-green-100 text-green-800'
                              : game.status === 'STATUS_IN_PROGRESS'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {game.status?.replace('STATUS_', '') || 'SCHEDULED'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-orange-600 text-white shadow-lg">
        <div className="container mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <div>
              <nav className="text-sm opacity-90 mb-2">
                <a href="/admin" className="hover:underline">Admin</a> / 
                <a href="/admin/seasons" className="hover:underline"> Seasons</a> / 
                {season.year} Schedule
              </nav>
              <h1 className="text-3xl font-bold">{season.year} NFL Schedule</h1>
              <p className="text-lg opacity-90">{games.length} games • Click dates/times to edit</p>
            </div>
            <div className="flex items-center space-x-4">
              <a
                href="/admin/seasons"
                className="bg-gray-600 text-white hover:bg-opacity-30 px-4 py-2 rounded-lg transition-colors"
              >
                Back to Seasons
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

        <div className="space-y-8">
          {/* Render Preseason */}
          {renderSeasonSection(1, preseasonGames)}
          
          {/* Render Regular Season */}
          {renderSeasonSection(2, regularSeasonGames)}
          
          {/* Render Postseason */}
          {renderSeasonSection(3, postseasonGames)}
        </div>

        {games.length === 0 && (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <p className="text-gray-500 mb-4">No games found for this season.</p>
            <a
              href="/admin/seasons"
              className="text-orange-600 hover:text-orange-800 underline"
            >
              Try syncing NFL games first
            </a>
          </div>
        )}
      </main>
    </div>
  );
};

export default SeasonSchedule;