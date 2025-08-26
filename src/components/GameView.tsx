import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $user, $isAuthenticated, $isLoading, initAuth, logout } from '../stores/auth';
import type { PickemGame, GameParticipant, Season, NFLGame, Pick, NFLTeam } from '../utils/api';
import api from '../utils/api';
import { UserCircleIcon, HomeIcon, DocumentDuplicateIcon, ArrowLeftStartOnRectangleIcon, Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
      setError(''); // Clear any previous errors
      
      console.log('[GameView] Starting to load game data...', { gameId, gameSlug });
      
      // Use gameSlug if provided, otherwise use gameId for backward compatibility
      let gameResponse = null;
      if (gameSlug) {
        console.log('[GameView] Loading game by slug:', gameSlug);
        try {
          gameResponse = await api.getGameBySlug(gameSlug);
        } catch (slugError) {
          console.error('[GameView] Error loading game by slug:', slugError);
          // Try to provide more helpful error messages
          if (slugError instanceof Error) {
            if (slugError.message.includes('404') || slugError.message.includes('not found')) {
              setError(`Game "${gameSlug}" not found. Please check the URL or contact the game commissioner.`);
            } else if (slugError.message.includes('403') || slugError.message.includes('access denied')) {
              setError(`You don't have permission to view this game. Please contact the game commissioner to be added.`);
            } else {
              setError(`Failed to load game: ${slugError.message}`);
            }
          } else {
            setError('Failed to load game. Please try again.');
          }
          return;
        }
      } else if (gameId) {
        console.log('[GameView] Loading game by ID:', gameId);
        try {
          gameResponse = await api.getGame(gameId);
        } catch (idError) {
          console.error('[GameView] Error loading game by ID:', idError);
          if (idError instanceof Error) {
            if (idError.message.includes('404') || idError.message.includes('not found')) {
              setError(`Game not found. Please check the URL or contact the game commissioner.`);
            } else if (idError.message.includes('403') || idError.message.includes('access denied')) {
              setError(`You don't have permission to view this game. Please contact the game commissioner to be added.`);
            } else {
              setError(`Failed to load game: ${idError.message}`);
            }
          } else {
            setError('Failed to load game. Please try again.');
          }
          return;
        }
      } else {
        setError('No game specified. Please check the URL.');
        return;
      }
      
      console.log('[GameView] Game response:', gameResponse);
      
      if (!gameResponse?.success || !gameResponse.data) {
        const errorMsg = gameResponse?.error || 'Game not found or access denied';
        console.error('[GameView] Failed to load game:', errorMsg);
        setError(errorMsg);
        return;
      }

      console.log('[GameView] Loading season and teams data...');
      let seasonResponse, teamsResponse;
      try {
        [seasonResponse, teamsResponse] = await Promise.all([
          api.getCurrentSeason(),
          api.getTeams()
        ]);
      } catch (dataError) {
        console.error('[GameView] Error loading season/teams data:', dataError);
        // Handle season loading failure gracefully
        try {
          seasonResponse = await api.getCurrentSeason();
          teamsResponse = await api.getTeams();
        } catch (retryError) {
          console.error('[GameView] Retry failed:', retryError);
          // Try to get all seasons as fallback
          try {
            const seasonsResponse = await api.getSeasons();
            if (seasonsResponse?.success && seasonsResponse.data?.seasons && seasonsResponse.data.seasons.length > 0) {
              // Use the most recent season as fallback
              const fallbackSeason = seasonsResponse.data.seasons.sort((a, b) =>
                parseInt(b.season) - parseInt(a.season)
              )[0];
              seasonResponse = { success: true, data: { season: fallbackSeason } };
              console.log('[GameView] Using fallback season:', fallbackSeason);
            } else {
              setError('No seasons available. Please contact an administrator to set up seasons.');
              return;
            }
          } catch (fallbackError) {
            console.error('[GameView] Fallback season loading failed:', fallbackError);
            setError('Unable to load season data. Please try refreshing the page or contact support.');
            return;
          }
          
          // Try to load teams separately
          try {
            teamsResponse = await api.getTeams();
          } catch (teamsError) {
            console.warn('[GameView] Teams loading failed, continuing without teams data:', teamsError);
            teamsResponse = { success: false, data: null };
          }
        }
      }

      console.log('[GameView] Season response:', seasonResponse);
      console.log('[GameView] Teams response:', teamsResponse);

      if (!seasonResponse?.success || !seasonResponse.data) {
        const errorMsg = seasonResponse?.error || 'No current season found. Please contact an administrator to set up the current season.';
        console.error('[GameView] Failed to load season:', errorMsg);
        setError(errorMsg);
        return;
      }

      console.log('[GameView] Setting game and season data...');
      setGame(gameResponse.data.game);
      setCurrentSeason(seasonResponse.data.season);
      
      // Load favorite team (optional, don't fail if this doesn't work)
      if (user?.favoriteTeamId && teamsResponse?.success && teamsResponse.data) {
        try {
          const favTeam = teamsResponse.data.teams.find(t => t.id === user.favoriteTeamId);
          setFavoriteTeam(favTeam || null);
          console.log('[GameView] Set favorite team:', favTeam?.team_name);
        } catch (teamError) {
          console.warn('[GameView] Failed to load favorite team, continuing:', teamError);
        }
      }
      
      // Load current week games and user picks
      console.log('[GameView] Loading week data for season:', seasonResponse.data.season.id);
      try {
        await loadWeekData(seasonResponse.data.season.id, currentWeek, gameResponse.data.game.id);
      } catch (weekError) {
        console.error('[GameView] Error loading week data:', weekError);
        // This is not critical, show the game interface even if week data fails
        console.warn('[GameView] Week data loading failed, showing game interface anyway');
        setWeekGames([]);
        setUserPicks([]);
      }
      
      console.log('[GameView] Game data loaded successfully');

    } catch (err) {
      console.error('[GameView] Error loading game data:', err);
      setError(`Failed to load game data: ${err instanceof Error ? err.message : 'An unexpected error occurred. Please try refreshing the page.'}`);
    } finally {
      setLoading(false);
    }
  };

  const loadWeekData = async (seasonId: string, week: number, currentGameId?: string) => {
    try {
      console.log('[GameView] Loading week data with:', { seasonId, week, currentGameId });
      
      const [gamesResponse, picksResponse] = await Promise.all([
        api.getSeasonGames(seasonId, week),
        // Use the passed gameId or fall back to the current game or provided gameId
        api.getUserPicks({ gameId: currentGameId || game?.id || gameId || '', seasonId, week })
      ]);

      console.log('[GameView] Week games response:', gamesResponse);
      console.log('[GameView] User picks response:', picksResponse);

      if (gamesResponse.success && gamesResponse.data) {
        setWeekGames(gamesResponse.data.games);
        console.log('[GameView] Set week games:', gamesResponse.data.games.length);
      } else {
        console.error('[GameView] Failed to load week games:', gamesResponse.error);
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
        console.log('[GameView] Set user picks:', picksResponse.data.picks.length);
      } else {
        console.error('[GameView] Failed to load user picks:', picksResponse.error);
      }
    } catch (err) {
      console.error('[GameView] Error in loadWeekData:', err);
      setError(`Failed to load week data: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleWeekChange = async (newWeek: number) => {
    if (!currentSeason) return;
    
    setCurrentWeek(newWeek);
    setLoading(true);
    
    try {
      await loadWeekData(currentSeason.id, newWeek, game?.id || gameId);
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
        await loadWeekData(currentSeason.id, currentWeek, game?.id || gameId);
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

  // Add comprehensive render error handling
  try {
    if (isLoading || loading) {
      return (
        <div className="min-h-screen bg-gray-100 flex justify-center items-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading game data...</p>
            <div className="mt-2 text-sm text-gray-500">
              {gameSlug && <div>Game: {gameSlug}</div>}
              {gameId && <div>ID: {gameId}</div>}
            </div>
          </div>
        </div>
      );
    }

    if (!isAuthenticated || !user) {
      return (
        <div className="min-h-screen bg-gray-100 flex justify-center items-center">
          <div className="text-center">
            <p className="text-gray-600 mb-4">
              Please log in to view this game
            </p>
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
              <h3 className="font-bold text-lg mb-2">Error Loading Game</h3>
              <p className="mb-4">{error}</p>
              <details className="text-sm text-left">
                <summary className="cursor-pointer font-medium">Debug Information</summary>
                <div className="mt-2 p-2 bg-red-50 rounded">
                  <p><strong>Game ID:</strong> {gameId || 'Not provided'}</p>
                  <p><strong>Game Slug:</strong> {gameSlug || 'Not provided'}</p>
                  <p><strong>User:</strong> {user?.email || 'Not available'}</p>
                  <p><strong>Authentication:</strong> {isAuthenticated ? 'Yes' : 'No'}</p>
                  <p><strong>Game Data:</strong> {game ? 'Loaded' : 'Not loaded'}</p>
                  <p><strong>Season Data:</strong> {currentSeason ? 'Loaded' : 'Not loaded'}</p>
                </div>
              </details>
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
              <p className="mb-4">Game or season data not available</p>
              <div className="text-sm">
                <p><strong>Game:</strong> {game ? '✓ Loaded' : '✗ Missing'}</p>
                <p><strong>Season:</strong> {currentSeason ? '✓ Loaded' : '✗ Missing'}</p>
                <p><strong>User:</strong> {user ? '✓ Loaded' : '✗ Missing'}</p>
              </div>
            </div>
            <div className="space-x-3">
              <button
                onClick={() => {
                  console.log('[GameView] Reloading game data...', { game, currentSeason, user });
                  loadGameData();
                }}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Reload Data
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
  } catch (renderError) {
    console.error('[GameView] Render error in early checks:', renderError);
    return (
      <div className="min-h-screen bg-gray-100 flex justify-center items-center">
        <div className="text-center">
          <div className="bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg mb-4">
            <h3 className="font-bold text-lg mb-2">Render Error</h3>
            <p>Component failed to render properly</p>
            <details className="text-sm text-left mt-2">
              <summary className="cursor-pointer font-medium">Error Details</summary>
              <div className="mt-2 p-2 bg-red-50 rounded">
                <pre className="whitespace-pre-wrap">{String(renderError)}</pre>
              </div>
            </details>
          </div>
          <a
            href="/dashboard"
            className="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            Back to Dashboard
          </a>
        </div>
      </div>
    );
  }

  // Add safety checks for calculations
  const hasUnsavedChanges = (() => {
    try {
      return Object.keys(selectedPicks).some(footballGameId => {
        const existingPick = userPicks.find(p => p.football_game_id === footballGameId);
        return !existingPick || existingPick.pick_team_id !== selectedPicks[footballGameId] ||
               (tiebreakers[footballGameId] || 0) !== (existingPick.tiebreaker || 0);
      });
    } catch (error) {
      console.error('[GameView] Error calculating unsaved changes:', error);
      return false;
    }
  })();

  const getHeaderStyle = () => {
    try {
      if (favoriteTeam?.team_primary_color && favoriteTeam?.team_secondary_color) {
        return {
          background: `linear-gradient(135deg, ${favoriteTeam.team_primary_color} 0%, ${favoriteTeam.team_secondary_color} 100%)`
        };
      }
    } catch (error) {
      console.error('[GameView] Error calculating header style:', error);
    }
    // Use system default colors when no team is selected
    return {
      background: `linear-gradient(135deg, #013369 0%, #d50a0a 100%)`
    };
  };

  // Render team with error handling
  const renderTeam = (footballGame: NFLGame, isHome: boolean) => {
    try {
      const teamId = isHome ? footballGame.home_team_id : footballGame.away_team_id;
      const teamCode = isHome ? footballGame.home_team_code : footballGame.away_team_code;
      const teamCity = isHome ? footballGame.home_team_city : footballGame.away_team_city;
      const teamName = isHome ? footballGame.home_team_name : footballGame.away_team_name;
      const teamScore = isHome ? footballGame.home_score : footballGame.away_score;
      const primaryColor = (footballGame as any)[`${isHome ? 'home' : 'away'}_team_primary_color`] || '#666666';
      const secondaryColor = (footballGame as any)[`${isHome ? 'home' : 'away'}_team_secondary_color`] || '#cccccc';
      const teamLogo = (footballGame as any)[`${isHome ? 'home' : 'away'}_team_logo`];
      const isSelected = selectedPicks[footballGame.id] === teamId;
      const gameStarted = !canMakePicks(footballGame);

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
          onClick={() => !gameStarted && handlePickChange(footballGame.id, teamId)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 flex items-center justify-center bg-white rounded-lg shadow-sm">
                {teamLogo ? (
                  <img
                    src={teamLogo || `/logos/${teamCode}.svg`}
                    alt={`${teamCity} ${teamName} logo`}
                    className="w-10 h-10 object-contain"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      const container = target.parentElement;
                      if (container) {
                        container.innerHTML = `
                          <div class="w-8 h-8 rounded flex items-center justify-center text-xs font-bold text-white"
                               style="background-color: ${primaryColor}">
                            ${teamCode}
                          </div>
                        `;
                      }
                    }}
                  />
                ) : (
                  <div
                    className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold text-white"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {teamCode}
                  </div>
                )}
              </div>
              <div>
                <div className="font-bold text-gray-800">
                  {teamCity} {teamName}
                </div>
                <div className="flex items-center space-x-2">
                  <span
                    className="inline-block px-2 py-1 text-xs font-bold text-white rounded"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {isHome ? 'Home' : 'Visitor'}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <div className="text-2xl font-bold">
                {teamScore > 0 ? teamScore : '-'}
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
    } catch (error) {
      console.error('[GameView] Error rendering team:', error);
      return (
        <div className="border rounded-lg p-4 bg-red-50 border-red-200">
          <div className="text-red-600 text-sm">Error loading team data</div>
        </div>
      );
    }
  };

  try {
    return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-blue-600 text-white shadow-lg" style={getHeaderStyle()}>
        <div className="container mx-auto px-4 py-6">
          {/* Desktop Layout */}
          <div className="hidden md:flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <img
                src={favoriteTeam?.team_logo || '/logos/NFL.svg'}
                alt={favoriteTeam ? `${favoriteTeam.team_city} ${favoriteTeam.team_name} logo` : 'NFL logo'}
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
                  {game?.game_type ? (game.game_type.charAt(0).toUpperCase() + game.game_type.slice(1)) : 'Game'} Picks -
                  {currentSeason?.season || 'Loading'} Season
                </p>
                <p className="text-sm opacity-75">
                  {game.player_count} players
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
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
                  src={favoriteTeam?.team_logo || '/logos/NFL.svg'}
                  alt={favoriteTeam ? `${favoriteTeam.team_city} ${favoriteTeam.team_name} logo` : 'NFL logo'}
                  className="w-12 h-12 object-contain"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = '/logos/NFL.svg';
                    target.alt = 'NFL logo';
                  }}
                />
                <div>
                  <h1 className="text-2xl font-bold">{game.game_name}</h1>
                  <p className="text-sm opacity-90">
                    {game?.game_type ? (game.game_type.charAt(0).toUpperCase() + game.game_type.slice(1)) : 'Game'} Picks - {currentSeason?.season || 'Loading'}
                  </p>
                  <p className="text-xs opacity-75">
                    {game.player_count} players
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

        {/* Week Navigation */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center space-x-4">
              <h2 className="text-2xl font-bold text-gray-800">Week {currentWeek}</h2>
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

          {/* Score Update Badge - positioned after week buttons, only show for relevant weeks */}
          {currentSeason && (() => {
            // Only show ScoreUpdateBadge for weeks that have games which have started or completed
            const hasStartedOrCompletedGames = weekGames.some(game => {
              const gameStart = new Date(game.start_time);
              const now = new Date();
              
              // Show if game has started (past start time) or is not in scheduled status
              return now >= gameStart ||
                     (game.status && game.status !== 'scheduled' && game.status !== 'STATUS_SCHEDULED');
            });
            
            // Also show if there are any games with scores > 0 (meaning they've been updated at some point)
            const hasGameScores = weekGames.some(game =>
              (game.home_score && game.home_score > 0) ||
              (game.away_score && game.away_score > 0)
            );
            
            const shouldShowBadge = hasStartedOrCompletedGames || hasGameScores;
            
            return shouldShowBadge ? (
              <div className="flex justify-end mt-4">
                <ScoreUpdateBadge
                  seasonId={currentSeason.id}
                  week={currentWeek}
                  onUpdateComplete={(result) => {
                    if (result.updated) {
                      // Reload the week data to show updated scores
                      loadWeekData(currentSeason.id, currentWeek, game?.id || gameId);
                    }
                  }}
                />
              </div>
            ) : null;
          })()}
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
                        {targetGame?.game_type ? (targetGame.game_type.charAt(0).toUpperCase() + targetGame.game_type.slice(1)) : 'Game'} • {targetGame?.player_count || 0} players
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
  } catch (renderError) {
    console.error('[GameView] Critical render error:', renderError);
    return (
      <div className="min-h-screen bg-gray-100 flex justify-center items-center">
        <div className="text-center">
          <div className="bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg mb-4">
            <h3 className="font-bold text-lg mb-2">Component Error</h3>
            <p>The game view encountered an error while rendering</p>
            <details className="text-sm text-left mt-2">
              <summary className="cursor-pointer font-medium">Error Details</summary>
              <div className="mt-2 p-2 bg-red-50 rounded">
                <pre className="whitespace-pre-wrap text-xs">{String(renderError)}</pre>
              </div>
            </details>
          </div>
          <div className="space-x-3">
            <button
              onClick={() => window.location.reload()}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Reload Page
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
};

export default GameView;