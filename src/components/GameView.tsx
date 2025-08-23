import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $user, $isAuthenticated, $isLoading, initAuth } from '../stores/auth';
import type { PickemGame, GameParticipant, Season, NFLGame, Pick, NFLTeam } from '../utils/api';
import api from '../utils/api';
import { UserCircleIcon, HomeIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';
import ScoreUpdateBadge from './ScoreUpdateBadge';

interface GameViewProps {
  gameId?: string;
  gameSlug?: string;
}

const GameView: React.FC<GameViewProps> = ({ gameId, gameSlug }) => {
  const user = useStore($user);
  const isAuthenticated = useStore($isAuthenticated);
  const isLoading = useStore($isLoading);
  
  const [game, setGame] = useState<(PickemGame & { participants: GameParticipant[] }) | null>(null);
  const [currentSeason, setCurrentSeason] = useState<Season | null>(null);
  const [currentWeek, setCurrentWeek] = useState<number>(1);
  const [weekGames, setWeekGames] = useState<NFLGame[]>([]);
  const [userPicks, setUserPicks] = useState<Pick[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPicks, setSelectedPicks] = useState<Record<string, string>>({});
  const [tiebreakers, setTiebreakers] = useState<Record<string, number>>({});
  const [tiebreakerGame, setTiebreakerGame] = useState<string | null>(null);
  const [savingPicks, setSavingPicks] = useState(false);
  const [favoriteTeam, setFavoriteTeam] = useState<NFLTeam | null>(null);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [availableGames, setAvailableGames] = useState<PickemGame[]>([]);
  const [copyingPicks, setCopyingPicks] = useState(false);

  useEffect(() => {
    // Only run on client side
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
      // Use gameSlug if provided, otherwise use gameId for backward compatibility
      const gameResponse = gameSlug 
        ? await api.getGameBySlug(gameSlug)
        : gameId 
        ? await api.getGame(gameId)
        : null;
      
      const [seasonResponse, teamsResponse] = await Promise.all([
        api.getCurrentSeason(),
        api.getTeams()
      ]);

      if (!gameResponse?.success || !gameResponse.data) {
        setError('Game not found or access denied');
        return;
      }

      if (!seasonResponse.success || !seasonResponse.data) {
        setError('No current season found');
        return;
      }

      setGame(gameResponse.data.game);
      setCurrentSeason(seasonResponse.data.season);
      
      // Load favorite team
      if (user?.favoriteTeamId && teamsResponse.success && teamsResponse.data) {
        const favTeam = teamsResponse.data.teams.find(t => t.id === user.favoriteTeamId);
        setFavoriteTeam(favTeam || null);
      }
      
      // Load current week games and user picks
      await loadWeekData(seasonResponse.data.season.id, currentWeek);

    } catch (err) {
      setError('Failed to load game data');
    } finally {
      setLoading(false);
    }
  };

  const loadWeekData = async (seasonId: string, week: number) => {
    try {
      const [gamesResponse, picksResponse] = await Promise.all([
        api.getSeasonGames(seasonId, week),
        api.getUserPicks({ gameId: game?.id || gameId || '', seasonId, week })
      ]);

      if (gamesResponse.success && gamesResponse.data) {
        setWeekGames(gamesResponse.data.games);
      }

      if (picksResponse.success && picksResponse.data) {
        setUserPicks(picksResponse.data.picks);
        
        // Pre-populate selected picks
        const picks: Record<string, string> = {};
        const ties: Record<string, number> = {};
        
        picksResponse.data.picks.forEach(pick => {
          picks[pick.football_game_id] = pick.pick_team_id;
          if (pick.tiebreaker) {
            ties[pick.football_game_id] = pick.tiebreaker;
            setTiebreakerGame(pick.football_game_id);
          }
        });
        
        setSelectedPicks(picks);
        setTiebreakers(ties);
      }
    } catch (err) {
      console.error('Failed to load week data:', err);
    }
  };

  const handleWeekChange = async (newWeek: number) => {
    if (!currentSeason) return;
    
    setCurrentWeek(newWeek);
    setLoading(true);
    
    try {
      await loadWeekData(currentSeason.id, newWeek);
    } finally {
      setLoading(false);
    }
  };

  const handlePickChange = (footballGameId: string, teamId: string) => {
    setSelectedPicks(prev => ({
      ...prev,
      [footballGameId]: teamId
    }));
  };

  const handleTiebreakerChange = (footballGameId: string, value: number) => {
    setTiebreakers(prev => ({
      ...prev,
      [footballGameId]: value
    }));
  };


  const handleSavePicks = async () => {
    if (!currentSeason || !user) return;
    
    setSavingPicks(true);
    setError('');
    
    try {
      const promises = Object.entries(selectedPicks).map(([footballGameId, pickTeamId]) => {
        const tiebreaker = tiebreakers[footballGameId];
        return api.makePick({
          gameId: game?.id || gameId || '',
          footballGameId,
          pickTeamId,
          tiebreaker
        });
      });

      const results = await Promise.all(promises);
      const failedPicks = results.filter(r => !r.success);
      
      if (failedPicks.length > 0) {
        setError(`Failed to save ${failedPicks.length} picks`);
      } else {
        // Reload picks to show updated data
        await loadWeekData(currentSeason.id, currentWeek);
      }
    } catch (err) {
      setError('Failed to save picks');
    } finally {
      setSavingPicks(false);
    }
  };

  const loadAvailableGames = async () => {
    try {
      const response = await api.getGames();
      if (response.success && response.data) {
        // Filter out the current game and show only active games
        const otherGames = response.data.games.filter(g => 
          g.id !== (game?.id || gameId) && g.is_active
        );
        setAvailableGames(otherGames);
      }
    } catch (err) {
      console.error('Failed to load available games:', err);
    }
  };

  const handleCopyPicks = async (targetGameId: string) => {
    if (!currentSeason || !user) return;
    
    setCopyingPicks(true);
    setError('');
    
    try {
      // Copy each pick to the target game
      const promises = Object.entries(selectedPicks).map(([footballGameId, pickTeamId]) => {
        const tiebreaker = tiebreakers[footballGameId];
        return api.makePick({
          gameId: targetGameId,
          footballGameId,
          pickTeamId,
          tiebreaker
        });
      });

      const results = await Promise.all(promises);
      const failedPicks = results.filter(r => !r.success);
      
      if (failedPicks.length > 0) {
        setError(`Failed to copy ${failedPicks.length} picks`);
      } else {
        setShowCopyModal(false);
        // Show success message or notification here if desired
      }
    } catch (err) {
      setError('Failed to copy picks');
    } finally {
      setCopyingPicks(false);
    }
  };

  const canMakePicks = (footballGame: NFLGame) => {
    const gameStart = new Date(footballGame.start_time);
    const now = new Date();
    return now < gameStart && (footballGame.status === 'scheduled' || footballGame.status === 'STATUS_SCHEDULED');
  };

  const getPickResult = (footballGame: NFLGame, pick: Pick | undefined) => {
    if (!pick || pick.is_correct === null || pick.is_correct === undefined) {
      return null;
    }
    return pick.is_correct ? 'correct' : 'incorrect';
  };

  if (isLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated || !user || !game || !currentSeason) {
    return (
      <div className="min-h-screen bg-gray-100 flex justify-center items-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">
            {error || 'Unable to load game data'}
          </p>
          <a
            href="/dashboard"
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to Dashboard
          </a>
        </div>
      </div>
    );
  }

  const hasUnsavedChanges = Object.keys(selectedPicks).some(footballGameId => {
    const existingPick = userPicks.find(p => p.football_game_id === footballGameId);
    return !existingPick || existingPick.pick_team_id !== selectedPicks[footballGameId] ||
           (tiebreakers[footballGameId] || 0) !== (existingPick.tiebreaker || 0);
  });

  const getHeaderStyle = () => {
    if (favoriteTeam?.team_primary_color && favoriteTeam?.team_secondary_color) {
      return {
        background: `linear-gradient(135deg, ${favoriteTeam.team_primary_color} 0%, ${favoriteTeam.team_secondary_color} 100%)`
      };
    }
    return {};
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-blue-600 text-white shadow-lg" style={getHeaderStyle()}>
        <div className="container mx-auto px-4 py-6">
          {/* Desktop Layout */}
          <div className="hidden md:flex justify-between items-center">
            <div className="flex items-center space-x-4">
              {favoriteTeam?.team_logo && (
                <img
                  src={favoriteTeam.team_logo}
                  alt={`${favoriteTeam.team_city} ${favoriteTeam.team_name} logo`}
                  className="w-16 h-16 object-contain"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              )}
              <div>
                <h1 className="text-3xl font-bold">{game.game_name}</h1>
                <p className="text-lg opacity-90">
                  {game.game_type.charAt(0).toUpperCase() + game.game_type.slice(1)} Picks - 
                  {currentSeason.season} Season
                </p>
                <p className="text-sm opacity-75">
                  {game.player_count} players
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <a
                href="/profile"
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
              >
                <UserCircleIcon className="h-4 w-4" />
                <span>Profile</span>
              </a>
              <a
                href="/dashboard"
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
              >
                <HomeIcon className="h-4 w-4" />
                <span>Dashboard</span>
              </a>
            </div>
          </div>

          {/* Mobile Layout */}
          <div className="md:hidden">
            <div className="flex items-center space-x-4 mb-4">
              {favoriteTeam?.team_logo && (
                <img
                  src={favoriteTeam.team_logo}
                  alt={`${favoriteTeam.team_city} ${favoriteTeam.team_name} logo`}
                  className="w-12 h-12 object-contain"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              )}
              <div>
                <h1 className="text-2xl font-bold">{game.game_name}</h1>
                <p className="text-sm opacity-90">
                  {game.game_type.charAt(0).toUpperCase() + game.game_type.slice(1)} Picks - {currentSeason.season}
                </p>
                <p className="text-xs opacity-75">
                  {game.player_count} players
                </p>
              </div>
            </div>
            <div className="flex items-center justify-center space-x-3">
              <a
                href="/profile"
                className="bg-blue-500 hover:bg-blue-600 text-white p-2 rounded-lg transition-colors"
                title="Profile"
              >
                <UserCircleIcon className="h-5 w-5" />
              </a>
              <a
                href="/dashboard"
                className="bg-blue-500 hover:bg-blue-600 text-white p-2 rounded-lg transition-colors"
                title="Dashboard"
              >
                <HomeIcon className="h-5 w-5" />
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

        {/* Week Navigation */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center space-x-4">
              <h2 className="text-2xl font-bold text-gray-800">Week {currentWeek}</h2>
              {currentSeason && (
                <ScoreUpdateBadge 
                  seasonId={currentSeason.id} 
                  week={currentWeek}
                  onUpdateComplete={(result) => {
                    if (result.updated) {
                      // Reload the week data to show updated scores
                      loadWeekData(currentSeason.id, currentWeek);
                    }
                  }}
                />
              )}
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => handleWeekChange(Math.max(1, currentWeek - 1))}
                disabled={currentWeek === 1}
                className="bg-gray-500 text-white px-3 py-1 rounded disabled:opacity-50 hover:bg-gray-600 transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => handleWeekChange(Math.min(18, currentWeek + 1))}
                disabled={currentWeek === 18}
                className="bg-gray-500 text-white px-3 py-1 rounded disabled:opacity-50 hover:bg-gray-600 transition-colors"
              >
                Next
              </button>
            </div>
          </div>

          {/* Week selector */}
          <div className="grid grid-cols-6 md:grid-cols-9 lg:grid-cols-18 gap-2">
            {Array.from({ length: 18 }, (_, i) => i + 1).map(week => (
              <button
                key={week}
                onClick={() => handleWeekChange(week)}
                className={`px-2 py-1 rounded text-sm transition-colors ${
                  week === currentWeek
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {week}
              </button>
            ))}
          </div>
        </div>

        {/* Games */}
        <div className="bg-white rounded-lg shadow-md">
          <div className="p-6 border-b">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-800">Make Your Picks</h3>
              <div className="flex items-center space-x-3">
                {Object.keys(selectedPicks).length > 0 && (
                  <button
                    onClick={() => {
                      loadAvailableGames();
                      setShowCopyModal(true);
                    }}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
                  >
                    <DocumentDuplicateIcon className="h-4 w-4" />
                    <span>Copy Picks</span>
                  </button>
                )}
                {hasUnsavedChanges && (
                  <button
                    onClick={handleSavePicks}
                    disabled={savingPicks}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {savingPicks ? 'Saving...' : 'Save Picks'}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="p-6">
            {weekGames.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-600">No games found for this week</p>
              </div>
            ) : (
              <div className="space-y-4">
                {weekGames.map((footballGame) => {
                  const existingPick = userPicks.find(p => p.football_game_id === footballGame.id);
                  const pickResult = getPickResult(footballGame, existingPick);
                  const gameStarted = !canMakePicks(footballGame);
                  
                  return (
                    <div
                      key={footballGame.id}
                      className={`border rounded-lg p-4 ${
                        pickResult === 'correct' ? 'border-green-500 bg-green-50' :
                        pickResult === 'incorrect' ? 'border-red-500 bg-red-50' :
                        'border-gray-200'
                      }`}
                    >
                      <div className="flex justify-between items-center mb-4">
                        <div className="text-sm text-gray-600">
                          {new Date(footballGame.start_time).toLocaleDateString()} at{' '}
                          {new Date(footballGame.start_time).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                        <div className="text-sm">
                          {pickResult === 'correct' && (
                            <span className="text-green-600 font-semibold">✓ Correct</span>
                          )}
                          {pickResult === 'incorrect' && (
                            <span className="text-red-600 font-semibold">✗ Incorrect</span>
                          )}
                          {!pickResult && (
                            <div className="flex items-center space-x-1">
                              {canMakePicks(footballGame) ? (
                                <>
                                  <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 1C5.477 1 2 4.484 2 9s3.477 8 8 8c4.522 0 8-3.484 8-8s-3.478-8-8-8zM8 11a1 1 0 01-.707-.293L5.586 9l1.414-1.414L8 8.586l2.293-2.293L11.707 7.707 8.707 10.707A1 1 0 018 11z" clipRule="evenodd" />
                                  </svg>
                                  <span className="text-green-600 font-medium">Pickable</span>
                                </>
                              ) : (
                                <>
                                  <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                  </svg>
                                  <span className="text-red-600 font-medium">Locked</span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Away Team */}
                        {(() => {
                          const primaryColor = (footballGame as any).away_team_primary_color || '#666666';
                          const secondaryColor = (footballGame as any).away_team_secondary_color || '#cccccc';
                          const teamLogo = (footballGame as any).away_team_logo;
                          const isSelected = selectedPicks[footballGame.id] === footballGame.away_team_id;
                          const gradientStyle = isSelected ? {
                            background: `linear-gradient(30deg, ${primaryColor} 0%, white 25%, white 75%, ${secondaryColor} 100%)`
                          } : {};
                          
                          return (
                            <div
                              className={`border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${
                                isSelected
                                  ? 'border-green-500 shadow-lg'
                                  : 'border-gray-200 hover:border-gray-300'
                              } ${gameStarted ? 'opacity-60 cursor-not-allowed' : ''}`}
                              style={gradientStyle}
                              onClick={() => !gameStarted && handlePickChange(footballGame.id, footballGame.away_team_id)}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                  <div className="w-12 h-12 flex items-center justify-center bg-white rounded-lg shadow-sm">
                                    <img
                                      src={teamLogo || `/logos/${footballGame.away_team_code}.svg`}
                                      alt={`${footballGame.away_team_city} ${footballGame.away_team_name} logo`}
                                      className="w-10 h-10 object-contain"
                                      onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        target.style.display = 'none';
                                        const container = target.parentElement;
                                        if (container) {
                                          container.innerHTML = `
                                            <div class="w-8 h-8 rounded flex items-center justify-center text-xs font-bold text-white" 
                                                 style="background-color: ${primaryColor}">
                                              ${footballGame.away_team_code}
                                            </div>
                                          `;
                                        }
                                      }}
                                    />
                                  </div>
                                  <div>
                                    <div className="font-bold text-gray-800">
                                      {footballGame.away_team_city} {footballGame.away_team_name}
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <span
                                        className="inline-block px-2 py-1 text-xs font-bold text-white rounded"
                                        style={{ backgroundColor: primaryColor }}
                                      >
                                        Visitor
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <div className="text-2xl font-bold">
                                    {footballGame.away_score > 0 ? footballGame.away_score : '-'}
                                  </div>
                                  {isSelected && !gameStarted && (
                                    <div className="text-green-600">
                                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                      </svg>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Home Team */}
                        {(() => {
                          const primaryColor = (footballGame as any).home_team_primary_color || '#666666';
                          const secondaryColor = (footballGame as any).home_team_secondary_color || '#cccccc';
                          const teamLogo = (footballGame as any).home_team_logo;
                          const isSelected = selectedPicks[footballGame.id] === footballGame.home_team_id;
                          const gradientStyle = isSelected ? {
                            background: `linear-gradient(30deg, ${primaryColor} 0%, white 25%, white 75%, ${secondaryColor} 100%)`
                          } : {};
                          
                          return (
                            <div
                              className={`border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${
                                isSelected
                                  ? 'border-green-500 shadow-lg'
                                  : 'border-gray-200 hover:border-gray-300'
                              } ${gameStarted ? 'opacity-60 cursor-not-allowed' : ''}`}
                              style={gradientStyle}
                              onClick={() => !gameStarted && handlePickChange(footballGame.id, footballGame.home_team_id)}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                  <div className="w-12 h-12 flex items-center justify-center bg-white rounded-lg shadow-sm">
                                    <img
                                      src={teamLogo || `/logos/${footballGame.home_team_code}.svg`}
                                      alt={`${footballGame.home_team_city} ${footballGame.home_team_name} logo`}
                                      className="w-10 h-10 object-contain"
                                      onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        target.style.display = 'none';
                                        const container = target.parentElement;
                                        if (container) {
                                          container.innerHTML = `
                                            <div class="w-8 h-8 rounded flex items-center justify-center text-xs font-bold text-white" 
                                                 style="background-color: ${primaryColor}">
                                              ${footballGame.home_team_code}
                                            </div>
                                          `;
                                        }
                                      }}
                                    />
                                  </div>
                                  <div>
                                    <div className="font-bold text-gray-800">
                                      {footballGame.home_team_city} {footballGame.home_team_name}
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <span
                                        className="inline-block px-2 py-1 text-xs font-bold text-white rounded"
                                        style={{ backgroundColor: primaryColor }}
                                      >
                                        Home
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <div className="text-2xl font-bold">
                                    {footballGame.home_score > 0 ? footballGame.home_score : '-'}
                                  </div>
                                  {isSelected && !gameStarted && (
                                    <div className="text-green-600">
                                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                      </svg>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Tiebreaker */}
                      <div className="mt-4">
                        <div className="flex items-center mb-2">
                          <input
                            type="checkbox"
                            id={`tiebreaker-${footballGame.id}`}
                            checked={tiebreakerGame === footballGame.id}
                            onChange={(e) => setTiebreakerGame(e.target.checked ? footballGame.id : null)}
                            disabled={gameStarted}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:opacity-60"
                          />
                          <label htmlFor={`tiebreaker-${footballGame.id}`} className="ml-2 text-sm font-medium text-gray-700">
                            Use as Tiebreaker
                          </label>
                        </div>
                        {tiebreakerGame === footballGame.id && (
                          <div className="ml-6">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Total Points
                            </label>
                            <input
                              type="number"
                              min="0"
                              max="200"
                              value={tiebreakers[footballGame.id] || ''}
                              onChange={(e) => handleTiebreakerChange(footballGame.id, parseInt(e.target.value) || 0)}
                              disabled={gameStarted}
                              className="w-32 px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                              placeholder="0"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Copy Picks Modal */}
        {showCopyModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">Copy Picks to Another Game</h3>
              <p className="text-sm text-gray-600 mb-4">
                Select a game to copy your current picks from Week {currentWeek} to:
              </p>
              
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {availableGames.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No other games available</p>
                ) : (
                  availableGames.map((targetGame) => (
                    <button
                      key={targetGame.id}
                      onClick={() => handleCopyPicks(targetGame.id)}
                      disabled={copyingPicks}
                      className="w-full text-left p-3 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50"
                    >
                      <div className="font-medium text-gray-900">{targetGame.game_name}</div>
                      <div className="text-sm text-gray-500">
                        {targetGame.game_type.charAt(0).toUpperCase() + targetGame.game_type.slice(1)} • {targetGame.player_count} players
                      </div>
                    </button>
                  ))
                )}
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowCopyModal(false)}
                  disabled={copyingPicks}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>

              {copyingPicks && (
                <div className="text-center text-blue-600 mt-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
                  Copying picks...
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default GameView;