import React, { useState, useEffect } from 'react';
import type { NFLTeam } from '../utils/api';
import api from '../utils/api';

interface FavoriteTeamSelectorProps {
  currentFavoriteId?: string;
  onTeamSelect: (teamId: string) => void;
}

const FavoriteTeamSelector: React.FC<FavoriteTeamSelectorProps> = ({ 
  currentFavoriteId, 
  onTeamSelect 
}) => {
  const [teams, setTeams] = useState<NFLTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadTeams();
  }, []);

  const loadTeams = async () => {
    try {
      const response = await api.getTeams();
      if (response.success && response.data) {
        setTeams(response.data.teams);
      } else {
        setError('Failed to load teams');
      }
    } catch (err) {
      setError('Failed to load teams');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>;
  }

  if (error) {
    return <div className="text-red-600 text-sm">{error}</div>;
  }

  return (
    <select
      value={currentFavoriteId || ''}
      onChange={(e) => onTeamSelect(e.target.value)}
      className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
    >
      <option value="">Select a favorite team</option>
      {teams.map((team) => (
        <option key={team.id} value={team.id}>
          {team.team_city} {team.team_name}
        </option>
      ))}
    </select>
  );
};

export default FavoriteTeamSelector;