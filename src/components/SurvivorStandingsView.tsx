import React, { useState, useEffect } from 'react';
import type { PickemGame, GameParticipant, Season, Pick, NFLTeam, PicksSummary } from '../utils/api';
import api from '../utils/api';
import { CheckCircleIcon, XMarkIcon, ClockIcon, EyeSlashIcon } from '@heroicons/react/24/outline';

interface SurvivorStandingsViewProps {
  game: PickemGame & { participants: GameParticipant[] };
  currentSeason: Season;
  currentWeek: number;
  teams: NFLTeam[];
  picksLocked: boolean;
}

interface PlayerStanding {
  user_id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  status: 'alive' | 'eliminated';
  total_picks: number;
  correct_picks: number;
  previous_week_pick?: {
    team_id: string;
    team_city: string;
    team_name: string;
    team_code: string;
    result: 'win' | 'loss' | 'pending';
  };
  current_week_pick?: {
    team_id: string;
    team_city: string;
    team_name: string;
    team_code: string;
  };
  elimination_week?: number;
}

const SurvivorStandingsView: React.FC<SurvivorStandingsViewProps> = ({
  game,
  currentSeason,
  currentWeek,
  teams,
  picksLocked
}) => {
  const [standings, setStandings] = useState<PlayerStanding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadStandings();
  }, [game.id, currentSeason.id, currentWeek]);

  const loadStandings = async () => {
    try {
      setLoading(true);
      setError('');

      // Get picks summary for all players
      const summaryResponse = await api.getPicksSummary(game.id, currentSeason.id);
      if (!summaryResponse.success || !summaryResponse.data) {
        throw new Error('Failed to load picks summary');
      }

      // Get all picks for previous and current week for all participants
      const previousWeek = Math.max(1, currentWeek - 1);
      const [previousWeekPicksResponse, currentWeekPicksResponse] = await Promise.allSettled([
        // Get picks for previous week
        api.getUserPicks({
          gameId: game.id,
          seasonId: currentSeason.id,
          week: previousWeek
        }),
        // Get picks for current week
        api.getUserPicks({
          gameId: game.id,
          seasonId: currentSeason.id,
          week: currentWeek
        })
      ]);

      const previousWeekPicks: Pick[] = previousWeekPicksResponse.status === 'fulfilled' && 
        previousWeekPicksResponse.value.success ? 
        previousWeekPicksResponse.value.data?.picks || [] : [];

      const currentWeekPicks: Pick[] = currentWeekPicksResponse.status === 'fulfilled' && 
        currentWeekPicksResponse.value.success ? 
        currentWeekPicksResponse.value.data?.picks || [] : [];

      // Create standings data
      const playerStandings: PlayerStanding[] = game.participants.map(participant => {
        const userSummary = summaryResponse.data?.summary.find(s => s.user_id === participant.user_id);
        
        // Determine if player is eliminated
        const isEliminated = userSummary ? 
          userSummary.total_picks > 0 && userSummary.correct_picks < userSummary.total_picks : 
          false;

        // Find previous week pick
        const previousPick = previousWeekPicks.find(p => p.user_id === participant.user_id);
        let previousWeekPick;
        if (previousPick) {
          previousWeekPick = {
            team_id: previousPick.pick_team_id,
            team_city: previousPick.pick_team_city,
            team_name: previousPick.pick_team_name,
            team_code: previousPick.pick_team_code,
            result: previousPick.is_correct === null ? 'pending' as const : 
                   previousPick.is_correct ? 'win' as const : 'loss' as const
          };
        }

        // Find current week pick
        const currentPick = currentWeekPicks.find(p => p.user_id === participant.user_id);
        let currentWeekPick;
        if (currentPick) {
          currentWeekPick = {
            team_id: currentPick.pick_team_id,
            team_city: currentPick.pick_team_city,
            team_name: currentPick.pick_team_name,
            team_code: currentPick.pick_team_code
          };
        }

        // Find elimination week (first week with incorrect pick)
        let eliminationWeek;
        if (isEliminated && userSummary) {
          // This is a simplified approach - in a full implementation, 
          // you'd need to get all picks chronologically to find the exact elimination week
          eliminationWeek = userSummary.total_picks;
        }

        return {
          user_id: participant.user_id,
          first_name: participant.first_name,
          last_name: participant.last_name,
          display_name: participant.display_name,
          status: isEliminated ? 'eliminated' : 'alive',
          total_picks: userSummary?.total_picks || 0,
          correct_picks: userSummary?.correct_picks || 0,
          previous_week_pick: previousWeekPick,
          current_week_pick: currentWeekPick,
          elimination_week: eliminationWeek
        };
      });

      // Sort: alive players first (by most correct picks), then eliminated players (by week eliminated)
      playerStandings.sort((a, b) => {
        if (a.status !== b.status) {
          return a.status === 'alive' ? -1 : 1;
        }
        
        if (a.status === 'alive') {
          // For alive players, sort by most correct picks, then by most total picks
          if (a.correct_picks !== b.correct_picks) {
            return b.correct_picks - a.correct_picks;
          }
          return b.total_picks - a.total_picks;
        } else {
          // For eliminated players, sort by elimination week (latest first)
          return (b.elimination_week || 0) - (a.elimination_week || 0);
        }
      });

      setStandings(playerStandings);
    } catch (err) {
      console.error('Error loading survivor standings:', err);
      setError(`Failed to load standings: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const getTeamLogo = (teamCode: string) => {
    const team = teams.find(t => t.team_code === teamCode);
    return team?.team_logo || `/logos/${teamCode}.svg`;
  };

  const getTeamColors = (teamCode: string) => {
    const team = teams.find(t => t.team_code === teamCode);
    return {
      primary: team?.team_primary_color || '#666666',
      secondary: team?.team_secondary_color || '#cccccc'
    };
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3"></div>
          <span className="text-gray-600">Loading standings...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      </div>
    );
  }

  const alivePlayerCount = standings.filter(p => p.status === 'alive').length;
  const eliminatedPlayerCount = standings.filter(p => p.status === 'eliminated').length;

  return (
    <div className="bg-white rounded-lg shadow-md">
      <div className="p-6 border-b">
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-bold text-gray-800">Survivor Standings</h3>
          <div className="flex items-center space-x-4 text-sm">
            <div className="flex items-center text-green-600">
              <CheckCircleIcon className="h-4 w-4 mr-1" />
              <span>{alivePlayerCount} Alive</span>
            </div>
            <div className="flex items-center text-red-600">
              <XMarkIcon className="h-4 w-4 mr-1" />
              <span>{eliminatedPlayerCount} Eliminated</span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-2 font-medium text-gray-700">Player</th>
                <th className="text-left py-3 px-2 font-medium text-gray-700">Status</th>
                <th className="text-left py-3 px-2 font-medium text-gray-700">Record</th>
                <th className="text-left py-3 px-2 font-medium text-gray-700">
                  Week {Math.max(1, currentWeek - 1)} Pick
                </th>
                <th className="text-left py-3 px-2 font-medium text-gray-700">
                  Week {currentWeek} Pick
                </th>
              </tr>
            </thead>
            <tbody>
              {standings.map((player, index) => (
                <tr 
                  key={player.user_id} 
                  className={`border-b border-gray-100 ${
                    player.status === 'eliminated' ? 'opacity-60' : ''
                  }`}
                >
                  {/* Player Name */}
                  <td className="py-4 px-2">
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                        player.status === 'alive' ? 'bg-green-500' : 'bg-red-500'
                      }`}>
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-medium text-gray-800">
                          {player.display_name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {player.first_name} {player.last_name}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="py-4 px-2">
                    <div className="flex items-center">
                      {player.status === 'alive' ? (
                        <div className="flex items-center text-green-600">
                          <CheckCircleIcon className="h-5 w-5 mr-1" />
                          <span className="font-medium">Alive</span>
                        </div>
                      ) : (
                        <div className="flex items-center text-red-600">
                          <XMarkIcon className="h-5 w-5 mr-1" />
                          <span className="font-medium">
                            Eliminated
                            {player.elimination_week && (
                              <span className="text-sm ml-1">(Week {player.elimination_week})</span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Record */}
                  <td className="py-4 px-2">
                    <div className="text-sm">
                      <div className="font-medium">
                        {player.correct_picks}-{player.total_picks - player.correct_picks}
                      </div>
                      <div className="text-gray-500">
                        {player.total_picks > 0 
                          ? `${((player.correct_picks / player.total_picks) * 100).toFixed(0)}%`
                          : '0%'
                        }
                      </div>
                    </div>
                  </td>

                  {/* Previous Week Pick */}
                  <td className="py-4 px-2">
                    {player.previous_week_pick ? (
                      <div className="flex items-center space-x-2">
                        <img
                          src={getTeamLogo(player.previous_week_pick.team_code)}
                          alt={`${player.previous_week_pick.team_city} ${player.previous_week_pick.team_name} logo`}
                          className="w-6 h-6 object-contain"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            const container = target.parentElement;
                            if (container) {
                              const colors = getTeamColors(player.previous_week_pick!.team_code);
                              container.innerHTML = `
                                <div class="w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-white" 
                                     style="background-color: ${colors.primary}">
                                  ${player.previous_week_pick!.team_code}
                                </div>
                              ` + container.innerHTML.substring(container.innerHTML.indexOf('</div>') + 6);
                            }
                          }}
                        />
                        <div>
                          <div className="text-sm font-medium">
                            {player.previous_week_pick.team_code}
                          </div>
                          <div className={`text-xs ${
                            player.previous_week_pick.result === 'win' ? 'text-green-600' :
                            player.previous_week_pick.result === 'loss' ? 'text-red-600' :
                            'text-gray-500'
                          }`}>
                            {player.previous_week_pick.result === 'win' ? '✓ Win' :
                             player.previous_week_pick.result === 'loss' ? '✗ Loss' :
                             '? Pending'}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-400 text-sm">No pick</span>
                    )}
                  </td>

                  {/* Current Week Pick */}
                  <td className="py-4 px-2">
                    {/* Only show current week picks if picks are locked (games have started) */}
                    {picksLocked && player.current_week_pick ? (
                      <div className="flex items-center space-x-2">
                        <img
                          src={getTeamLogo(player.current_week_pick.team_code)}
                          alt={`${player.current_week_pick.team_city} ${player.current_week_pick.team_name} logo`}
                          className="w-6 h-6 object-contain"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            const container = target.parentElement;
                            if (container) {
                              const colors = getTeamColors(player.current_week_pick!.team_code);
                              container.innerHTML = `
                                <div class="w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-white" 
                                     style="background-color: ${colors.primary}">
                                  ${player.current_week_pick!.team_code}
                                </div>
                              ` + container.innerHTML.substring(container.innerHTML.indexOf('</div>') + 6);
                            }
                          }}
                        />
                        <div>
                          <div className="text-sm font-medium">
                            {player.current_week_pick.team_code}
                          </div>
                          <div className="text-xs text-gray-500">
                            Current pick
                          </div>
                        </div>
                      </div>
                    ) : !picksLocked ? (
                      <div className="flex items-center text-gray-400 text-sm">
                        <EyeSlashIcon className="h-4 w-4 mr-1" />
                        <span>Hidden</span>
                      </div>
                    ) : player.status === 'alive' ? (
                      <span className="text-yellow-600 text-sm">No pick yet</span>
                    ) : (
                      <span className="text-gray-400 text-sm">Eliminated</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {standings.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-600">No players found for this game.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SurvivorStandingsView;