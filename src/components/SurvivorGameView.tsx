
import React, { useState, useEffect } from 'react';
import { logout } from '../stores/auth';
import type { PickemGame, GameParticipant, Season, NFLGame, Pick, NFLTeam, TeamSurvivorStats } from '../utils/api';
import api from '../utils/api';
import { UserCircleIcon, HomeIcon, ArrowLeftStartOnRectangleIcon, Bars3Icon, XMarkIcon, ClockIcon, CheckCircleIcon, ChartBarIcon } from '@heroicons/react/24/outline';
import ScoreUpdateBadge from './ScoreUpdateBadge';
import SurvivorStandingsView from './SurvivorStandingsView';

interface SurvivorGameViewProps {
  gameId?: string;
  gameSlug?: string;
  initialGameData?: (PickemGame & { participants: GameParticipant[] });
  user?: any; // User from auth store
}

interface SurvivorStats {
  totalPlayers: number;
  aliveCount: number;
  eliminatedCount: number;
  currentWeekSubmissions: number;
}

interface TeamPickHistory {
  teamId: string;
  week: number;
  result?: 'win' | 'loss' | 'pending';
}

// Using TeamSurvivorStats from api.ts instead

const SurvivorGameView: React.FC<SurvivorGameViewProps> = ({ gameId, gameSlug, initialGameData, user }) => {
  
  const [game, setGame] = useState<(PickemGame & { participants: GameParticipant[] }) | null>(initialGameData || null);
  const [currentSeason, setCurrentSeason] = useState<Season | null>(null);
  const [currentWeek, setCurrentWeek] = useState<number>(1);
  const [teams, setTeams] = useState<NFLTeam[]>([]);
  const [userPickHistory, setUserPickHistory] = useState<TeamPickHistory[]>([]);
  const [survivorStats, setSurvivorStats] = useState<SurvivorStats | null>(null);
  const [teamPickPercentages, setTeamPickPercentages] = useState<TeamSurvivorStats[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [currentWeekPick, setCurrentWeekPick] = useState<Pick | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingPick, setSavingPick] = useState(false);
  const [favoriteTeam, setFavoriteTeam] = useState<NFLTeam | null>(null);
  const [defaultTeam, setDefaultTeam] = useState<NFLTeam | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [picksLocked, setPicksLocked] = useState(false);
  const [teamsPlayingThisWeek, setTeamsPlayingThisWeek] = useState<Set<string>>(new Set());
  const [showStandings, setShowStandings] = useState(false);

  useEffect(() => {
    // Initialize data when component mounts
    if (initialGameData && user) {
      initializeGameData();
    } else if (!initialGameData) {
      setError('No game data provided.');
      setLoading(false);
    } else if (!user) {
      setError('User not provided.');
      setLoading(false);
    }
  }, []); // Empty dependency array - only run once on mount

  const initializeGameData = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Use initialGameData if available (from router)
      if (initialGameData) {
        // Verify this is a survivor game
        if (initialGameData.type !== 'survivor') {
          setError('This is not a survivor game.');
          return;
        }

        setGame(initialGameData);
        
        // Load season, teams, and other data
        const [seasonResponse, teamsResponse] = await Promise.all([
          api.getCurrentSeason(),
          api.getTeams()
        ]);

        if (!seasonResponse?.success || !seasonResponse.data) {
          setError('No current season found.');
          return;
        }

        if (!teamsResponse?.success || !teamsResponse.data) {
          setError('Failed to load teams data.');
          return;
        }

        setCurrentSeason(seasonResponse.data.season);
        setTeams(teamsResponse.data.teams);
        
        // Always load the default team for fallback
        await loadDefaultTeam();
        
        // Load favorite team
        if (user?.favoriteTeamId) {
          const favTeam = teamsResponse.data.teams.find(t => t.id === user.favoriteTeamId);
          setFavoriteTeam(favTeam || null);
        } else {
          setFavoriteTeam(null);
        }
        
        // Load survivor-specific data
        await loadSurvivorData(initialGameData.id, seasonResponse.data.season.id);
      } else {
        setError('No game data provided.');
      }
      
    } catch (err) {
      console.error('Error initializing game data:', err);
      setError(`Failed to load game data: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const loadSurvivorData = async (gameId: string, seasonId: string) => {
    try {
      // Get current season status to determine current week
      const seasonStatusResponse = await api.getSeasonStatus();
      let currentWeekToUse = 1;
      
      if (seasonStatusResponse.success && seasonStatusResponse.data) {
        currentWeekToUse = seasonStatusResponse.data.status.isPreseason ? 1 : seasonStatusResponse.data.status.week;
        setCurrentWeek(currentWeekToUse);
      }

      // Load all data in parallel without interdependencies
      const [
        userPicksResponse,
        gamesResponse,
        summaryResponse,
        survivorStatsResponse
      ] = await Promise.allSettled([
        api.getUserPicks({
          gameId,
          seasonId,
          userId: user?.id
        }),
        api.getSeasonGames(seasonId, currentWeekToUse),
        api.getPicksSummary(gameId, seasonId),
        api.getSurvivorStats(gameId, seasonId, currentWeekToUse)
      ]);

      // Track which teams are playing this week for bye week detection
      if (gamesResponse.status === 'fulfilled' &&
          gamesResponse.value.success &&
          gamesResponse.value.data &&
          gamesResponse.value.data.games) {
        const playingTeams = new Set<string>();
        gamesResponse.value.data.games.forEach(game => {
          playingTeams.add(game.home_team_id);
          playingTeams.add(game.away_team_id);
        });
        setTeamsPlayingThisWeek(playingTeams);
      }

      // Process user picks
      if (userPicksResponse.status === 'fulfilled' && userPicksResponse.value.success && userPicksResponse.value.data) {
        const pickHistory: TeamPickHistory[] = userPicksResponse.value.data.picks.map(pick => ({
          teamId: pick.pick_team_id,
          week: pick.week,
          result: pick.is_correct === null ? 'pending' : pick.is_correct ? 'win' : 'loss'
        }));
        setUserPickHistory(pickHistory);

        // Find current week pick
        const currentPick = userPicksResponse.value.data.picks.find(p => p.week === currentWeekToUse);
        setCurrentWeekPick(currentPick || null);
        setSelectedTeam(currentPick?.pick_team_id || null);
      }

      // Check if picks are locked
      if (gamesResponse.status === 'fulfilled' &&
          gamesResponse.value.success &&
          gamesResponse.value.data &&
          gamesResponse.value.data.games &&
          gamesResponse.value.data.games.length > 0) {
        const now = new Date();
        const firstGameStart = new Date(Math.min(...gamesResponse.value.data.games.map(g => new Date(g.start_time).getTime())));
        setPicksLocked(now >= firstGameStart);
      }

      // Process survivor stats
      if (summaryResponse.status === 'fulfilled' && summaryResponse.value.success && summaryResponse.value.data && game) {
        const totalPlayers = game.participants?.length || 0;
        
        // Check if any games this week have been completed
        let hasCompletedGames = false;
        if (gamesResponse.status === 'fulfilled' &&
            gamesResponse.value.success &&
            gamesResponse.value.data &&
            gamesResponse.value.data.games) {
          hasCompletedGames = gamesResponse.value.data.games.some(g =>
            g.status && g.status !== 'scheduled' && g.status !== 'STATUS_SCHEDULED'
          );
        }
        
        // Only count eliminations if games have actually been completed
        // Before games are played, everyone should be alive
        let eliminatedCount = 0;
        if (hasCompletedGames) {
          const eliminatedPlayers = summaryResponse.value.data.summary.filter(s =>
            s.total_picks > 0 && s.correct_picks < s.total_picks
          );
          eliminatedCount = eliminatedPlayers.length;
        }
        
        const aliveCount = totalPlayers - eliminatedCount;

        // Count current week submissions from survivor stats
        let currentWeekPickCount = 0;
        if (survivorStatsResponse.status === 'fulfilled' &&
            survivorStatsResponse.value.success &&
            survivorStatsResponse.value.data) {
          currentWeekPickCount = survivorStatsResponse.value.data.teamStats.reduce((sum, team) => sum + team.pickCount, 0);
        }

        setSurvivorStats({
          totalPlayers,
          aliveCount,
          eliminatedCount,
          currentWeekSubmissions: currentWeekPickCount
        });
      }

      // Process team pick percentages
      if (survivorStatsResponse.status === 'fulfilled' && survivorStatsResponse.value.success && survivorStatsResponse.value.data) {
        setTeamPickPercentages(survivorStatsResponse.value.data.teamStats);
      }

    } catch (err) {
      console.error('Error loading survivor data:', err);
      // Set safe defaults
      setSurvivorStats({
        totalPlayers: game?.participants?.length || 0,
        aliveCount: game?.participants?.length || 0,
        eliminatedCount: 0,
        currentWeekSubmissions: 0
      });
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

  const handleTeamSelect = (teamId: string) => {
    if (picksLocked) {
      return; // Can't select if picks are locked
    }
    
    // Check if this team was used in a PREVIOUS week (not current week)
    const usedInPreviousWeek = userPickHistory.some(p => p.teamId === teamId && p.week !== currentWeek);
    if (usedInPreviousWeek) {
      return; // Can't select a team used in previous weeks
    }
    
    // Allow selection/deselection - if clicking the same team, deselect it
    if (selectedTeam === teamId) {
      setSelectedTeam(null);
    } else {
      setSelectedTeam(teamId);
    }
  };

  const handleSavePick = async () => {
    if (!selectedTeam || !game || !currentSeason || picksLocked) return;
    
    setSavingPick(true);
    setError('');
    
    try {
      // For survivor games, we need to find any game for the current week where the selected team is playing
      const gamesResponse = await api.getSeasonGames(currentSeason.id, currentWeek);
      
      if (!gamesResponse.success || !gamesResponse.data || !gamesResponse.data.games.length) {
        setError('No games found for current week');
        return;
      }

      // Find a game where the selected team is playing
      const teamGame = gamesResponse.data.games.find(g =>
        g.home_team_id === selectedTeam || g.away_team_id === selectedTeam
      );

      if (!teamGame) {
        setError('Selected team is not playing this week');
        return;
      }

      const response = await api.makePick({
        gameId: game.id,
        footballGameId: teamGame.id,
        pickTeamId: selectedTeam
      });

      if (response.success) {
        // Reload survivor data to reflect the new pick
        await loadSurvivorData(game.id, currentSeason.id);
      } else {
        setError(response.error || 'Failed to save pick');
      }
    } catch (err) {
      setError('Failed to save pick');
    } finally {
      setSavingPick(false);
    }
  };

  const getTeamStatus = (team: NFLTeam) => {
    // Check if team was used in a PREVIOUS week (not current week)
    const pickedInPreviousWeek = userPickHistory.find(p => p.teamId === team.id && p.week !== currentWeek);
    
    if (pickedInPreviousWeek) {
      return {
        status: 'used' as const,
        week: pickedInPreviousWeek.week,
        result: pickedInPreviousWeek.result
      };
    }
    
    if (selectedTeam === team.id) {
      return { status: 'selected' as const };
    }
    
    return { status: 'available' as const };
  };

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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex justify-center items-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading survivor game...</p>
        </div>
      </div>
    );
  }

  // GameViewRouter already handles auth, so just check for user
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-100 flex justify-center items-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">User not loaded</p>
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
            <p>{error}</p>
          </div>
          <div className="space-x-3">
            <button
              onClick={() => {
                setError('');
                initializeGameData();
              }}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
            <a href="/dashboard" className="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700 transition-colors">
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
            onClick={initializeGameData}
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
                  Survivor Pool - {currentSeason?.season || 'Loading'} Season
                </p>
                <p className="text-sm opacity-75">
                  {game.player_count} players
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <a href="/dashboard" className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2">
                <HomeIcon className="h-4 w-4" />
                <span>Dashboard</span>
              </a>
              <a href="/profile" className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2">
                <UserCircleIcon className="h-4 w-4" />
                <span>Profile</span>
              </a>
              <button onClick={logout} className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2">
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
                  <p className="text-sm opacity-90">Survivor Pool - {currentSeason?.season}</p>
                </div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="bg-blue-500 hover:bg-blue-600 text-white p-2 rounded-lg transition-colors"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
              </button>
            </div>

            {/* Mobile Menu */}
            {mobileMenuOpen && (
              <div className="mt-4 pt-4 border-t border-blue-500">
                <div className="space-y-2">
                  <a href="/dashboard" className="flex items-center space-x-3 bg-purple-500 hover:bg-purple-600 text-white px-4 py-3 rounded-lg transition-colors" onClick={() => setMobileMenuOpen(false)}>
                    <HomeIcon className="h-5 w-5" />
                    <span>Dashboard</span>
                  </a>
                  <a href="/profile" className="flex items-center space-x-3 bg-blue-500 hover:bg-blue-600 text-white px-4 py-3 rounded-lg transition-colors" onClick={() => setMobileMenuOpen(false)}>
                    <UserCircleIcon className="h-5 w-5" />
                    <span>Profile</span>
                  </a>
                  <button onClick={() => { setMobileMenuOpen(false); logout(); }} className="w-full flex items-center space-x-3 bg-red-500 hover:bg-red-600 text-white px-4 py-3 rounded-lg transition-colors">
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

        {/* Week Information and Status */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">Week {currentWeek}</h2>
              <div className="text-sm text-gray-500 mt-1">{currentSeason?.season || '2024'} Season</div>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowStandings(!showStandings)}
                className={`inline-flex items-center space-x-2 px-3 py-1 border rounded-lg text-sm font-medium transition-colors ${
                  showStandings
                    ? 'bg-gray-100 border-gray-400 text-gray-800'
                    : 'bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-100'
                }`}
              >
                <ChartBarIcon className="h-4 w-4" />
                <span>{showStandings ? 'Hide Standings' : 'Show Standings'}</span>
              </button>
              {picksLocked ? (
                <div className="flex items-center text-red-600">
                  <ClockIcon className="h-5 w-5 mr-1" />
                  <span className="font-medium">Picks Locked</span>
                </div>
              ) : (
                <div className="flex items-center text-green-600">
                  <CheckCircleIcon className="h-5 w-5 mr-1" />
                  <span className="font-medium">Picks Open</span>
                </div>
              )}
            </div>
          </div>

          {/* Survivor Stats */}
          {survivorStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-200">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{survivorStats.aliveCount}</div>
                <div className="text-sm text-gray-500">Still Alive</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{survivorStats.eliminatedCount}</div>
                <div className="text-sm text-gray-500">Eliminated</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{survivorStats.currentWeekSubmissions}</div>
                <div className="text-sm text-gray-500">Week {currentWeek} Picks</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{survivorStats.totalPlayers}</div>
                <div className="text-sm text-gray-500">Total Players</div>
              </div>
            </div>
          )}

          {/* Score Update Badge */}
          {currentSeason && (
            <div className="flex justify-end mt-4">
              <ScoreUpdateBadge
                seasonId={currentSeason.id}
                week={currentWeek}
                onUpdateComplete={(result) => {
                  if (result.updated) {
                    loadSurvivorData(game.id, currentSeason.id);
                  }
                }}
              />
            </div>
          )}
        </div>

        {/* Standings View */}
        {showStandings && currentSeason && (
          <div className="mb-8">
            <SurvivorStandingsView
              game={game}
              currentSeason={currentSeason}
              currentWeek={currentWeek}
              teams={teams}
              picksLocked={picksLocked}
            />
          </div>
        )}

        {/* Team Selection Grid */}
        <div className="bg-white rounded-lg shadow-md">
          <div className="p-6 border-b">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-800">
                {picksLocked ? `Week ${currentWeek} Picks` : `Choose Your Team for Week ${currentWeek}`}
              </h3>
              {!picksLocked && selectedTeam && (
                <button
                  onClick={handleSavePick}
                  disabled={savingPick}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {savingPick ? 'Saving...' : 'Save Pick'}
                </button>
              )}
            </div>
            {!picksLocked && (
              <p className="text-sm text-gray-600 mt-2">
                Select a team for this week. You can only pick each team once during the season. Click to Select/Deselect.
              </p>
            )}
          </div>

          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
              {teams.map((team) => {
                const teamStatus = getTeamStatus(team);
                const pickPercentage = teamPickPercentages.find(p => p.teamId === team.id);
                
                // Check if team is on bye (not playing this week)
                const isOnBye = !teamsPlayingThisWeek.has(team.id);
                
                return (
                  <div
                    key={team.id}
                    className={`
                      border rounded-lg p-4 transition-all
                      ${teamStatus.status === 'selected' ? 'border-green-500 bg-green-50 shadow-lg' :
                        teamStatus.status === 'used' ? 'border-gray-300 bg-gray-100 opacity-60 cursor-not-allowed' :
                        isOnBye ? 'border-yellow-300 bg-yellow-50 cursor-not-allowed' :
                        picksLocked ? 'border-gray-200 cursor-not-allowed' :
                        'border-gray-200 hover:border-gray-300 cursor-pointer hover:shadow-md'}
                    `}
                    onClick={() => !picksLocked && !isOnBye && teamStatus.status !== 'used' && handleTeamSelect(team.id)}
                  >
                    <div className="text-center">
                      {/* Team Logo */}
                      <div className="w-16 h-16 mx-auto mb-2 flex items-center justify-center">
                        <img
                          src={team.team_logo || `/logos/${team.team_code}.svg`}
                          alt={`${team.team_city} ${team.team_name} logo`}
                          className="w-14 h-14 object-contain"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            const container = target.parentElement;
                            if (container) {
                              container.innerHTML = `
                                <div class="w-12 h-12 rounded bg-gray-300 flex items-center justify-center text-xs font-bold text-gray-600">
                                  ${team.team_code}
                                </div>
                              `;
                            }
                          }}
                        />
                      </div>
                      
                      {/* Team Name */}
                      <div className="font-bold text-sm text-gray-800 mb-1">
                        {team.team_city}
                      </div>
                      <div className="text-xs text-gray-600 mb-2">
                        {team.team_name}
                      </div>
                      
                      {/* Status Indicators */}
                      {teamStatus.status === 'used' && (
                        <div className="text-xs text-red-600 font-medium">
                          Used Week {teamStatus.week}
                          {teamStatus.result === 'loss' && ' (L)'}
                          {teamStatus.result === 'win' && ' (W)'}
                          {teamStatus.result === 'pending' && ' (?)'}
                        </div>
                      )}
                      {isOnBye && teamStatus.status !== 'used' && (
                        <div className="text-xs text-yellow-600 font-medium">
                          BYE WEEK
                        </div>
                      )}
                      {teamStatus.status === 'selected' && (
                        <div className="text-xs text-green-600 font-medium">
                          {picksLocked ? 'Week Pick' : 'Selected'}
                        </div>
                      )}
                      {!isOnBye && teamStatus.status === 'available' && !picksLocked && (
                        <div className="text-xs text-blue-600 font-medium">
                          Available
                        </div>
                      )}
                      
                      {/* Pick Percentage (shown when picks are locked) */}
                      {picksLocked && pickPercentage && (
                        <div className="text-xs text-purple-600 font-medium mt-1">
                          {pickPercentage.pickCount} picks ({pickPercentage.percentage.toFixed(1)}%)
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </main>
    </div>
  );
};

export default SurvivorGameView;