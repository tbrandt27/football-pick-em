import React, { useState, useEffect } from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import api, { type LastUpdateInfo, type OnDemandUpdateResult } from '../utils/api';

interface ScoreUpdateBadgeProps {
  seasonId: string;
  week: number;
  className?: string;
  onUpdateComplete?: (result: OnDemandUpdateResult) => void;
}

const ScoreUpdateBadge: React.FC<ScoreUpdateBadgeProps> = ({ 
  seasonId, 
  week, 
  className = '',
  onUpdateComplete 
}) => {
  const [updateInfo, setUpdateInfo] = useState<LastUpdateInfo | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadUpdateInfo();
  }, [seasonId, week]);

  const loadUpdateInfo = async () => {
    try {
      const response = await api.getScoresLastUpdated(seasonId, week);
      if (response.success && response.data) {
        setUpdateInfo(response.data);
      }
    } catch (err) {
      console.error('Failed to load update info:', err);
    }
  };

  const handleUpdate = async () => {
    if (isUpdating) return;

    setIsUpdating(true);
    setError('');

    try {
      const response = await api.updateScoresOnDemand(seasonId, week);
      if (response.success && response.data) {
        const result = response.data;
        
        // Refresh the update info
        await loadUpdateInfo();
        
        // Notify parent component
        if (onUpdateComplete) {
          onUpdateComplete(result);
        }
      } else {
        setError(response.error || 'Update failed');
      }
    } catch (err) {
      console.error('On-demand update failed:', err);
      setError('Update failed');
    } finally {
      setIsUpdating(false);
    }
  };

  if (!updateInfo) {
    return (
      <div className={`inline-flex items-center space-x-2 px-3 py-1 bg-gray-100 border border-gray-300 rounded-full text-sm text-gray-600 ${className}`}>
        <ArrowPathIcon className="h-4 w-4 animate-spin" />
        <span>Loading...</span>
      </div>
    );
  }

  const isStale = updateInfo.isStale;
  const badgeColor = isStale ? 'bg-yellow-100 border-yellow-300 text-yellow-800' : 'bg-green-100 border-green-300 text-green-800';
  const iconColor = isStale ? 'text-yellow-600' : 'text-green-600';

  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      {/* Status Display */}
      <div className={`inline-flex items-center space-x-2 px-3 py-1 border rounded-full text-sm ${badgeColor}`}>
        <span className="font-medium">
          Last score update: {updateInfo.formatted}
        </span>
        
        {isStale && !isUpdating && (
          <span className="inline-flex h-2 w-2 rounded-full bg-yellow-400 animate-pulse" title="Scores may be outdated" />
        )}
      </div>

      {/* Update Button */}
      <button
        onClick={handleUpdate}
        disabled={isUpdating}
        className={`inline-flex items-center space-x-2 px-3 py-1 border rounded-lg text-sm font-medium transition-colors ${
          isUpdating 
            ? 'bg-gray-100 border-gray-300 text-gray-500 cursor-not-allowed' 
            : 'bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100'
        }`}
        title={isStale ? 'Scores may be outdated - click to refresh' : 'Click to refresh scores'}
      >
        <ArrowPathIcon className={`h-4 w-4 ${isUpdating ? 'animate-spin' : ''}`} />
        <span>
          {isUpdating ? 'Updating...' : 'Update Scores'}
        </span>
      </button>
      
      {error && (
        <span className="text-red-600 text-xs">
          {error}
        </span>
      )}
    </div>
  );
};

export default ScoreUpdateBadge;