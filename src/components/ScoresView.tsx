
import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $user, $isAuthenticated, $isLoading, initAuth, logout } from '../stores/auth';
import type { PickemGame, GameParticipant, Season, PicksSummary, NFLTeam, SeasonStatus, Pick, NFLGame } from '../utils/api';
import api from '../utils/api';
import { UserCircleIcon, HomeIcon, ArrowLeftStartOnRectangleIcon, Bars3Icon, XMarkIcon, TrophyIcon, ChartBarIcon, EyeIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import ScoreUpdateBadge from './ScoreUpdateBadge';

interface ScoresViewProps {
  gameId?: string;
  gameSlug?: string;
}

const ScoresView: React.FC<ScoresViewProps> = ({ gameId, gameSlug }) => {
  const user = useStore($user);
  const isAuthenticated = useStore($isAuthenticated);
  const isLoading = useStore($isLoading);
  
  const [game, setGame] = useState<(PickemGame & { participants: GameParticipant[] }) | null>(null);
  const [currentSeason, setCurrentSeason] = useState<Season | null>(null);
  const [seasonStatus, setSeasonStatus] = useState<SeasonStatus | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null); // null = overall
  const [picksSummary, setPicksSummary] = useState<PicksSummary[]>([]);
  const [weeklyPicks, setWeeklyPicks] = useState<Record<string, Pick[]>>({}); // user_id -> picks for the week
  const [weekGames, setWeekGames] = useState<NFLGame[]>([]); // NFL games for the selected week
  const [teams, setTeams] = useState<NFLTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [favoriteTeam, setFavoriteTeam] = useState<NFLTeam | null>(null);
  const [defaultTeam, setDefaultTeam] = useState<NFLTeam | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      initAuth();
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && user) {
      loadGameData();
    } else if (!isLoading && !isAuthenticated) {
      window.location.href = '/';
    }
  }, [isAuthenticated, user, isLoading, gameId, gameSlug]);

  const loadGameData = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Load game data
      let gameResponse = null;
      if (gameSlug) {
        gameResponse = await api.getGameBySlug(gameSlug);
      } else if (gameId) {
        gameResponse = await api.getGame(gameId);
      } else {
        setError('No game specified. Please check the URL.');
        return;
      }
      
      if (!gameResponse?.success || !gameResponse.data) {
        setError(gameResponse?.error || 'Game not found or access denied');
        return;
      }

      const [seasonResponse, teamsResponse, seasonStatusResponse] = await Promise.all([
        api.getCurrentSeason(),
        api.getTeams(),
        api.getSeasonStatus()
      ]);

      if (!seasonResponse?.success || !seasonResponse.data) {
        setError('No current season found.');
        return;
      }

      setGame(gameResponse.data.game);
      setCurrentSeason(seasonResponse.data.season);
      
      if (seasonStatusResponse.success && seasonStatusResponse.data) {
        setSeasonStatus(seasonStatusResponse.data.status);
      }
      
      // Load team data
      if (teamsResponse?.success && teamsResponse.data) {
        setTeams(teamsResponse.data.teams);
        if (user?.favoriteTeamId) {
          const favTeam = teamsResponse.data.teams.find(t => t.id === user.favoriteTeamId);
          setFavoriteTeam(favTeam || null);
        }
      }
      await loadDefaultTeam();
      
      // Load overall scores by default
      await loadPicksSummary(gameResponse.data.game.id, seasonResponse.data.season.id);
      
    } catch (err) {
      console.error('Error loading game data:', err);
      setError(`Failed to load game data: ${err instanceof Error ? err.message : 'Unknown error'}`);
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

  const loadPicksSummary = async (gameId: string, seasonId: string, week?: number) => {
    try {
      const response = await api.getPicksSummary(gameId, seasonId, week);
      
      if (response.success && response.data) {
        // Sort by correct picks (descending), then by pick percentage (descending)
        const sortedSummary = response.data.summary.sort((a, b) => {
          if (b.correct_picks !== a.correct_picks) {
            return b.correct_picks - a.correct_picks;
          }
          return b.pick_percentage - a.pick_percentage;
        });
        setPicksSummary(sortedSummary);
        
        // For games with a specific week selected, also load individual picks
        if (week) {
          await loadWeeklyPicks(gameId, seasonId, week, sortedSummary);
          // For weekly games, also load the NFL games for that week
          if (game?.type === 'week' || game?.type === 'weekly') {
            await loadWeekGames(seasonId, week);
          }
        } else {
          setWeeklyPicks({}); // Clear weekly picks for overall view
          setWeekGames([]); // Clear week games for overall view
        }
      } else {
        console.error('Failed to load picks summary:', response.error);
        setPicksSummary([]);
        setWeeklyPicks({});
        setWeekGames([]);
      }
    } catch (err) {
      console.error('Error loading picks summary:', err);
      setPicksSummary([]);
      setWeeklyPicks({});
      setWeekGames([]);
    }
  };

  const loadWeekGames = async (seasonId: string, week: number) => {
    try {
      const response = await api.getSeasonGames(seasonId, week);
      if (response.success && response.data) {
        setWeekGames(response.data.games);
      } else {
        setWeekGames([]);
      }
    } catch (err) {
      console.error('Error loading week games:', err);
      setWeekGames([]);
    }
  };

  const loadWeeklyPicks = async (gameId: string, seasonId: string, week: number, players: PicksSummary[]) => {
    try {
      // Load picks for each player for the specific week
      const pickPromises = players.map(async (player) => {
        try {
          const response = await api.getUserPicks({
            gameId,
            seasonId,
            week,
            userId: player.user_id
          });
          
          return {
            userId: player.user_id,
            picks: response.success ? response.data?.picks || [] : []
          };
        } catch (err) {
          console.error(`Failed to load picks for user ${player.user_id}:`, err);
          return {
            userId: player.user_id,
            picks: []
          };
        }
      });
      
      const pickResults = await Promise.all(pickPromises);
      
      // Convert to lookup object
      const picksLookup = pickResults.reduce((acc, result) => {
        acc[result.userId] = result.picks;
        return acc;
      }, {} as Record<string, Pick[]>);
      
      setWeeklyPicks(picksLookup);
    } catch (err) {
      console.error('Error loading weekly picks:', err);
      setWeeklyPicks({});
    }
  };

  const handleWeekChange = async (week: number | null) => {
    if (!game || !currentSeason) return;
    
    setSelectedWeek(week);
    setExpandedPlayer(null); // Close any expanded player views
    setLoading(true);
    
    try {
      await loadPicksSummary(game.id, currentSeason.id, week || undefined);
    } finally {
      setLoading(false);
    }
  };

  const getHeaderStyle = () => {
    const activeTeam = favoriteTeam || defaultTeam;
    if (activeTeam?.team_primary_color && activeTeam?.team_secondary_color) {
      return {
        background: `linear-gradient(135deg, ${activeTeam.team_primary_color} 0%, ${activeTeam.team_secondary_color} 100%)`
      };
    }
    return {
      background: `linear-gradient(135deg, #013369 0%, #d50a0a 100%)`
    };
  };

  const getActiveTeam = () => {
    return favoriteTeam || defaultTeam;
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <div className="text-yellow-500 text-xl">🥇</div>;
      case 2:
        return <div className="text-gray-400 text-xl">🥈</div>;
      case 3:
        return <div className="text-amber-600 text-xl">🥉</div>;
      default:
        return <div className="text-gray-600 font-bold text-lg">#{rank}</div>;
    }
  };

  if (isLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex justify-center items-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading scores...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen bg-gray-100 flex justify-center items-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Please log in to view scores</p>
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

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex justify-center items-center">
        <div className="text-center">
          <div className="bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg mb-4">
            <h3 className="font-bold text-lg mb-2">Error Loading Scores</h3>
            <p>{error}</p>
          </div>
          <div className="space-x-3">
            <button
              onClick={() => {
                setError('');
                loadGameData();
              }}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
            <a
              href="/dashboard"
              className="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Back to Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (!game || !currentSeason) {
    return (
      <div className="min-h-screen bg-gray-100 flex justify-center items-center">
        <div className="text-center">
          <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-6 py-4 rounded-lg mb-4">
            <h3 className="font-bold text-lg mb-2">Missing Data</h3>
            <p>Game or season data not available</p>
          </div>
          <button
            onClick={loadGameData}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Reload Data
          </button>
        </div>
      </div>
    );
  }

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
                <h1 className="text-3xl font-bold">{game.game_name}</h1>
                <p className="text-lg opacity-90">
                  Scores & Standings - {currentSeason?.season || 'Loading'} Season
                </p>
                <p className="text-sm opacity-75">
                  {game.player_count} players
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <a
                href={`/game/${gameSlug || game.id}`}
                className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
              >
                <ChartBarIcon className="h-4 w-4" />
                <span>Back to Game</span>
              </a>
              <a
                href="/dashboard"
                className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
              >
                <HomeIcon className="h-4 w-4" />
                <span>Dashboard</span>
              </a>
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
                  <h1 className="text-2xl font-bold">{game.game_name}</h1>
                  <p className="text-sm opacity-90">Scores & Standings</p>
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
                  <a
                    href={`/game/${gameSlug || game.id}`}
                    className="flex items-center space-x-3 bg-green-500 hover:bg-green-600 text-white px-4 py-3 rounded-lg transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <ChartBarIcon className="h-5 w-5" />
                    <span>Back to Game</span>
                  </a>
                  <a
                    href="/dashboard"
                    className="flex items-center space-x-3 bg-purple-500 hover:bg-purple-600 text-white px-4 py-3 rounded-lg transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <HomeIcon className="h-5 w-5" />
                    <span>Dashboard</span>
                  </a>
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

        {/* Week Filter */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="mb-4">
            <h2 className="text-2xl font-bold text-gray-800 flex items-center space-x-2 mb-4">
              <TrophyIcon className="h-8 w-8 text-yellow-500" />
              <span>
                {selectedWeek ? `Week ${selectedWeek} Standings` : 'Overall Standings'}
              </span>
            </h2>
            <div className="mb-4">
              <button
                onClick={() => handleWeekChange(null)}
                className={`w-full px-3 py-2 rounded text-sm transition-colors ${
                  selectedWeek === null
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Overall Standings
              </button>
            </div>
            <div className="grid grid-cols-6 md:grid-cols-9 lg:grid-cols-18 gap-2">
              {Array.from({ length: 18 }, (_, i) => i + 1).map(week => (
                <button
                  key={week}
                  onClick={() => handleWeekChange(week)}
                  className={`px-2 py-1 rounded text-sm transition-colors ${
                    week === selectedWeek
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {week}
                </button>
              ))}
            </div>
          </div>

          {/* Score Update Badge - Always show for current data */}
          {currentSeason && (
            <div className="flex justify-end">
              <ScoreUpdateBadge
                seasonId={currentSeason.id}
                week={selectedWeek || (seasonStatus?.week || 1)}
                onUpdateComplete={(result) => {
                  if (result.updated) {
                    // Reload picks summary to show updated results
                    loadPicksSummary(game.id, currentSeason.id, selectedWeek || undefined).then(() => {
                      // If we're viewing a specific week, also refresh the weekly picks and games data
                      if (selectedWeek && (game?.type === 'week' || game?.type === 'weekly')) {
                        loadWeeklyPicks(game.id, currentSeason.id, selectedWeek, picksSummary);
                        loadWeekGames(currentSeason.id, selectedWeek);
                      }
                    });
                  }
                }}
              />
            </div>
          )}
        </div>

        {/* Standings Table */}
        <div className="bg-white rounded-lg shadow-md">
          <div className="p-6 border-b">
            <h3 className="text-xl font-bold text-gray-800">
              {selectedWeek ? `Week ${selectedWeek} Results` : 'Season Standings'}
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              {selectedWeek
                ? `Performance for week ${selectedWeek} only`
                : `Overall performance across all weeks in ${currentSeason?.season || 'current'} season`
              }
            </p>
          </div>

          <div className="p-6">
            {picksSummary.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-600">No picks data available</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Rank</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">Player</th>
                      {game?.type === 'survivor' && selectedWeek && (
                        <th className="text-center py-3 px-4 font-semibold text-gray-700">Team Pick</th>
                      )}
                      {(game?.type === 'week' || game?.type === 'weekly') && selectedWeek && (
                        <th className="text-center py-3 px-4 font-semibold text-gray-700">View Picks</th>
                      )}
                      <th className="text-center py-3 px-4 font-semibold text-gray-700">Correct</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-700">Total</th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-700">Percentage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {picksSummary.map((player, index) => {
                      const rank = index + 1;
                      const isCurrentUser = player.user_id === user?.id;
                      const playerPicks = weeklyPicks[player.user_id] || [];
                      const playerPick = playerPicks.length > 0 ? playerPicks[0] : null; // Survivor games have only one pick per week
                      const pickedTeam = playerPick ? teams.find(t => t.id === playerPick.pick_team_id) : null;
                      const isExpanded = expandedPlayer === player.user_id;
                      
                      return (
                        <React.Fragment key={player.user_id}>
                          <tr
                            className={`border-b border-gray-100 hover:bg-gray-50 ${
                              isCurrentUser ? 'bg-blue-50 border-blue-200' : ''
                            }`}
                          >
                            <td className="py-4 px-4">
                              <div className="flex items-center space-x-2">
                                {getRankIcon(rank)}
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <div className={`font-medium ${isCurrentUser ? 'text-blue-800' : 'text-gray-800'}`}>
                                {player.first_name} {player.last_name}
                                {isCurrentUser && (
                                  <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                                    You
                                  </span>
                                )}
                              </div>
                            </td>
                            {(game?.type === 'week' || game?.type === 'weekly') && selectedWeek && (
                              <td className="py-4 px-4 text-center">
                                <button
                                  onClick={() => setExpandedPlayer(isExpanded ? null : player.user_id)}
                                  className="flex items-center justify-center space-x-1 bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm transition-colors"
                                >
                                  {isExpanded ? (
                                    <ChevronDownIcon className="h-4 w-4" />
                                  ) : (
                                    <ChevronRightIcon className="h-4 w-4" />
                                  )}
                                  <span>{isExpanded ? 'Hide' : 'View'} Picks</span>
                                </button>
                              </td>
                            )}
                            {game?.type === 'survivor' && selectedWeek && (
                              <td className="py-4 px-4 text-center">
                                {pickedTeam ? (
                                  <div className="flex items-center justify-center space-x-2">
                                    <img
                                      src={pickedTeam.team_logo || `/logos/${pickedTeam.team_code}.svg`}
                                      alt={`${pickedTeam.team_city} ${pickedTeam.team_name} logo`}
                                      className="w-6 h-6 object-contain"
                                      onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        target.style.display = 'none';
                                        const container = target.parentElement;
                                        if (container) {
                                          container.innerHTML = `<span class="text-xs font-bold">${pickedTeam.team_code}</span>`;
                                        }
                                      }}
                                    />
                                    <div className="text-sm">
                                      <div className="font-medium">{pickedTeam.team_code}</div>
                                      {playerPick && playerPick.is_correct !== null && (
                                        <div className="text-xs">
                                          {playerPick.is_correct ? (
                                            <span className="text-green-600">✓</span>
                                          ) : (
                                            <span className="text-red-600">✗</span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-gray-400 text-sm">No Pick</span>
                                )}
                              </td>
                            )}
                            <td className="py-4 px-4 text-center">
                              <span className={`font-bold text-lg ${
                                player.correct_picks > 0 ? 'text-green-600' : 'text-gray-500'
                              }`}>
                                {player.correct_picks}
                              </span>
                            </td>
                            <td className="py-4 px-4 text-center">
                              <span className="text-gray-600 font-medium">
                                {player.total_picks}
                              </span>
                            </td>
                            <td className="py-4 px-4 text-center">
                              <div className="flex items-center justify-center space-x-2">
                                <span className={`font-bold ${
                                  player.pick_percentage >= 70 ? 'text-green-600' :
                                  player.pick_percentage >= 50 ? 'text-yellow-600' :
                                  'text-red-600'
                                }`}>
                                  {player.pick_percentage.toFixed(1)}%
                                </span>
                                <div className="w-16 bg-gray-200 rounded-full h-2">
                                  <div
                                    className={`h-2 rounded-full ${
                                      player.pick_percentage >= 70 ? 'bg-green-500' :
                                      player.pick_percentage >= 50 ? 'bg-yellow-500' :
                                      'bg-red-500'
                                    }`}
                                    style={{ width: `${Math.min(100, player.pick_percentage)}%` }}
                                  ></div>
                                </div>
                              </div>
                            </td>
                          </tr>
                          
                          {/* Expanded row showing detailed picks for weekly games */}
                          {(game?.type === 'week' || game?.type === 'weekly') && selectedWeek && isExpanded && (
                            <tr className="bg-gray-50">
                              <td colSpan={6} className="px-4 py-6">
                                <div className="bg-white rounded-lg p-4 shadow-sm">
                                  <h4 className="text-lg font-semibold text-gray-800 mb-4">
                                    {player.first_name} {player.last_name}'s Picks - Week {selectedWeek}
                                  </h4>
                                  
                                  {playerPicks.length === 0 ? (
                                    <p className="text-gray-500 text-center py-4">No picks made for this week</p>
                                  ) : (
                                    <div className="grid gap-3">
                                      {weekGames.map((nflGame) => {
                                        const pick = playerPicks.find(p => p.football_game_id === nflGame.id);
                                        const pickedTeam = pick ? teams.find(t => t.id === pick.pick_team_id) : null;
                                        const homeTeam = teams.find(t => t.id === nflGame.home_team_id);
                                        const awayTeam = teams.find(t => t.id === nflGame.away_team_id);
                                        
                                        return (
                                          <div
                                            key={nflGame.id}
                                            className={`border rounded-lg p-3 ${
                                              pick?.is_correct === true ? 'border-green-200 bg-green-50' :
                                              pick?.is_correct === false ? 'border-red-200 bg-red-50' :
                                              'border-gray-200'
                                            }`}
                                          >
                                            <div className="flex items-center justify-between">
                                              <div className="flex items-center space-x-4">
                                                {/* Game matchup */}
                                                <div className="text-sm">
                                                  <div className="font-medium">
                                                    {awayTeam?.team_code} @ {homeTeam?.team_code}
                                                  </div>
                                                  <div className="text-gray-500">
                                                    {new Date(nflGame.start_time).toLocaleDateString()} at{' '}
                                                    {new Date(nflGame.start_time).toLocaleTimeString([], {
                                                      hour: '2-digit',
                                                      minute: '2-digit'
                                                    })}
                                                  </div>
                                                </div>
                                                
                                                {/* Pick */}
                                                <div className="flex items-center space-x-2">
                                                  {pickedTeam ? (
                                                    <>
                                                      <span className="text-sm text-gray-600">Picked:</span>
                                                      <img
                                                        src={pickedTeam.team_logo || `/logos/${pickedTeam.team_code}.svg`}
                                                        alt={`${pickedTeam.team_city} ${pickedTeam.team_name} logo`}
                                                        className="w-5 h-5 object-contain"
                                                        onError={(e) => {
                                                          const target = e.target as HTMLImageElement;
                                                          target.style.display = 'none';
                                                          const container = target.parentElement;
                                                          if (container) {
                                                            container.innerHTML = `<span class="text-xs font-bold">${pickedTeam.team_code}</span>`;
                                                          }
                                                        }}
                                                      />
                                                      <span className="font-medium text-sm">{pickedTeam.team_code}</span>
                                                    </>
                                                  ) : (
                                                    <span className="text-gray-400 text-sm">No pick</span>
                                                  )}
                                                </div>
                                              </div>
                                              
                                              {/* Result */}
                                              <div className="flex items-center space-x-2">
                                                {nflGame.home_score > 0 || nflGame.away_score > 0 ? (
                                                  <div className="text-sm text-gray-600">
                                                    {nflGame.away_score} - {nflGame.home_score}
                                                  </div>
                                                ) : null}
                                                
                                                {pick?.is_correct === true && (
                                                  <span className="text-green-600 font-bold">✓</span>
                                                )}
                                                {pick?.is_correct === false && (
                                                  <span className="text-red-600 font-bold">✗</span>
                                                )}
                                              </div>
                                            </div>
                                            
                                            {/* Tiebreaker */}
                                            {pick?.tiebreaker && (
                                              <div className="mt-2 pt-2 border-t border-gray-200">
                                                <span className="text-sm text-gray-600">
                                                  Tiebreaker: {pick.tiebreaker} points
                                                </span>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default ScoresView;