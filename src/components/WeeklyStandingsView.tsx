import React, { useState, useEffect } from 'react';
import type { PickemGame, GameParticipant, Season, PicksSummary } from '../utils/api';
import api from '../utils/api';
import { TrophyIcon, StarIcon } from '@heroicons/react/24/outline';

interface WeeklyStandingsViewProps {
  game: PickemGame & { participants: GameParticipant[] };
  currentSeason: Season;
  currentWeek: number;
}

interface PlayerStanding {
  user_id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  total_picks: number;
  correct_picks: number;
  pick_percentage: number;
  rank: number;
  tied?: boolean;
}

const WeeklyStandingsView: React.FC<WeeklyStandingsViewProps> = ({
  game,
  currentSeason,
  currentWeek
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

      // Get picks summary for all players across all weeks
      const summaryResponse = await api.getPicksSummary(game.id, currentSeason.id);
      if (!summaryResponse.success || !summaryResponse.data) {
        throw new Error('Failed to load picks summary');
      }

      // Create standings data from summary and game participants
      const playerStandings: PlayerStanding[] = game.participants.map(participant => {
        const userSummary = summaryResponse.data?.summary.find(s => s.user_id === participant.user_id);
        
        return {
          user_id: participant.user_id,
          first_name: participant.first_name,
          last_name: participant.last_name,
          display_name: participant.display_name,
          total_picks: userSummary?.total_picks || 0,
          correct_picks: userSummary?.correct_picks || 0,
          pick_percentage: userSummary?.pick_percentage || 0,
          rank: 0 // Will be set below
        };
      });

      // Sort players by total correct picks (descending), then by pick percentage, then by total picks
      playerStandings.sort((a, b) => {
        // First, sort by correct picks (more is better)
        if (a.correct_picks !== b.correct_picks) {
          return b.correct_picks - a.correct_picks;
        }
        
        // If tied on correct picks, sort by pick percentage (higher is better)
        if (a.pick_percentage !== b.pick_percentage) {
          return b.pick_percentage - a.pick_percentage;
        }
        
        // If still tied, sort by total picks (more is better - shows more participation)
        return b.total_picks - a.total_picks;
      });

      // Assign ranks, handling ties
      let currentRank = 1;
      for (let i = 0; i < playerStandings.length; i++) {
        if (i > 0) {
          const current = playerStandings[i];
          const previous = playerStandings[i - 1];
          
          // Check if this player is tied with the previous player
          if (current.correct_picks === previous.correct_picks && 
              current.pick_percentage === previous.pick_percentage) {
            // Same rank as previous player
            playerStandings[i].rank = previous.rank;
            playerStandings[i].tied = true;
            playerStandings[i - 1].tied = true; // Mark previous as tied too
          } else {
            // New rank
            currentRank = i + 1;
            playerStandings[i].rank = currentRank;
          }
        } else {
          // First player
          playerStandings[i].rank = currentRank;
        }
      }

      setStandings(playerStandings);
    } catch (err) {
      console.error('Error loading weekly standings:', err);
      setError(`Failed to load standings: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const getRankDisplay = (rank: number, tied?: boolean) => {
    if (rank === 1) {
      return <TrophyIcon className="h-5 w-5 text-yellow-500" />;
    } else if (rank === 2) {
      return <div className="w-5 h-5 rounded-full bg-gray-400 flex items-center justify-center text-white text-xs font-bold">2</div>;
    } else if (rank === 3) {
      return <div className="w-5 h-5 rounded-full bg-amber-600 flex items-center justify-center text-white text-xs font-bold">3</div>;
    } else {
      return <span className="text-gray-600 font-medium">{rank}</span>;
    }
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) {
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    } else if (rank <= 3) {
      return "bg-blue-100 text-blue-800 border-blue-200";
    } else if (rank <= 5) {
      return "bg-green-100 text-green-800 border-green-200";
    } else {
      return "bg-gray-100 text-gray-800 border-gray-200";
    }
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

  const topPlayer = standings[0];
  const averageCorrectPicks = standings.length > 0 
    ? standings.reduce((sum, p) => sum + p.correct_picks, 0) / standings.length 
    : 0;

  return (
    <div className="bg-white rounded-lg shadow-md">
      <div className="p-6 border-b">
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-bold text-gray-800">Weekly Pick Standings</h3>
          <div className="text-sm text-gray-600">
            Season Total • Through Week {currentWeek}
          </div>
        </div>
        
        {/* Quick Stats */}
        {standings.length > 0 && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="flex items-center">
                <TrophyIcon className="h-5 w-5 text-yellow-500 mr-2" />
                <div>
                  <div className="text-sm font-medium text-gray-700">Leader</div>
                  <div className="text-lg font-bold text-gray-900">
                    {topPlayer?.display_name || 'N/A'}
                  </div>
                  <div className="text-sm text-gray-600">
                    {topPlayer?.correct_picks || 0} correct picks
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center">
                <StarIcon className="h-5 w-5 text-blue-500 mr-2" />
                <div>
                  <div className="text-sm font-medium text-gray-700">Average</div>
                  <div className="text-lg font-bold text-gray-900">
                    {averageCorrectPicks.toFixed(1)}
                  </div>
                  <div className="text-sm text-gray-600">
                    correct picks
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="flex items-center">
                <div className="w-5 h-5 bg-green-500 rounded-full mr-2"></div>
                <div>
                  <div className="text-sm font-medium text-gray-700">Players</div>
                  <div className="text-lg font-bold text-gray-900">
                    {standings.length}
                  </div>
                  <div className="text-sm text-gray-600">
                    participating
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="p-6">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-2 font-medium text-gray-700">Rank</th>
                <th className="text-left py-3 px-2 font-medium text-gray-700">Player</th>
                <th className="text-center py-3 px-2 font-medium text-gray-700">Correct</th>
                <th className="text-center py-3 px-2 font-medium text-gray-700">Total</th>
                <th className="text-center py-3 px-2 font-medium text-gray-700">Percentage</th>
                <th className="text-center py-3 px-2 font-medium text-gray-700">Record</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((player, index) => (
                <tr 
                  key={player.user_id} 
                  className={`border-b border-gray-100 ${
                    player.rank <= 3 ? 'bg-gradient-to-r from-blue-50 to-transparent' : ''
                  }`}
                >
                  {/* Rank */}
                  <td className="py-4 px-2">
                    <div className="flex items-center space-x-2">
                      {getRankDisplay(player.rank, player.tied)}
                      {player.tied && (
                        <span className="text-xs text-gray-500">(T)</span>
                      )}
                    </div>
                  </td>

                  {/* Player Name */}
                  <td className="py-4 px-2">
                    <div className="flex items-center space-x-3">
                      <div className={`px-2 py-1 rounded-full border text-xs font-medium ${getRankBadge(player.rank)}`}>
                        #{player.rank}
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

                  {/* Correct Picks */}
                  <td className="py-4 px-2 text-center">
                    <div className="text-lg font-bold text-green-600">
                      {player.correct_picks}
                    </div>
                  </td>

                  {/* Total Picks */}
                  <td className="py-4 px-2 text-center">
                    <div className="text-lg font-medium text-gray-800">
                      {player.total_picks}
                    </div>
                  </td>

                  {/* Percentage */}
                  <td className="py-4 px-2 text-center">
                    <div className={`text-lg font-medium ${
                      player.pick_percentage >= 70 ? 'text-green-600' :
                      player.pick_percentage >= 50 ? 'text-yellow-600' :
                      'text-red-600'
                    }`}>
                      {player.pick_percentage.toFixed(1)}%
                    </div>
                  </td>

                  {/* Record */}
                  <td className="py-4 px-2 text-center">
                    <div className="text-sm">
                      <div className="font-medium">
                        {player.correct_picks}-{player.total_picks - player.correct_picks}
                      </div>
                      {player.total_picks === 0 && (
                        <div className="text-gray-400">No picks yet</div>
                      )}
                    </div>
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

export default WeeklyStandingsView;