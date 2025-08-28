import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $user, $isAuthenticated, $isLoading, initAuth } from '../stores/auth';
import WeeklyGameView from './WeeklyGameView';
import SurvivorGameView from './SurvivorGameView';
import api from '../utils/api';
import type { PickemGame, GameParticipant } from '../utils/api';

interface GameViewRouterProps {
  gameId?: string;
  gameSlug?: string;
}

const GameViewRouter: React.FC<GameViewRouterProps> = ({ gameId, gameSlug }) => {
  const user = useStore($user);
  const isAuthenticated = useStore($isAuthenticated);
  const isLoading = useStore($isLoading);
  
  const [game, setGame] = useState<(PickemGame & { participants: GameParticipant[] }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    // Only run on client side
    if (typeof window !== 'undefined') {
      initAuth();
    }
  }, []);

  useEffect(() => {
    // Only load game once we have auth state and haven't initialized yet
    if (!isLoading && !initialized) {
      if (!isAuthenticated) {
        window.location.href = '/';
        return;
      }
      
      if (user) {
        setInitialized(true);
        loadGameType();
      }
    }
  }, [isLoading, isAuthenticated, user, initialized]);

  const loadGameType = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Load game data to determine type
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

      setGame(gameResponse.data.game);
      
    } catch (err) {
      console.error('Error loading game type:', err);
      setError(`Failed to load game: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  if (isLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex justify-center items-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading game...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen bg-gray-100 flex justify-center items-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Please log in to view this game</p>
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
            <p>{error}</p>
          </div>
          <div className="space-x-3">
            <button
              onClick={() => {
                setError('');
                loadGameType();
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

  if (!game) {
    return (
      <div className="min-h-screen bg-gray-100 flex justify-center items-center">
        <div className="text-center">
          <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-6 py-4 rounded-lg mb-4">
            <h3 className="font-bold text-lg mb-2">Game Not Found</h3>
            <p>The requested game could not be loaded</p>
          </div>
          <button
            onClick={loadGameType}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Reload Data
          </button>
        </div>
      </div>
    );
  }

  // Render the appropriate view based on game type
  if (game.type === 'survivor') {
    return <SurvivorGameView gameId={gameId} gameSlug={gameSlug} initialGameData={game} user={user} />;
  } else {
    return <WeeklyGameView gameId={gameId} gameSlug={gameSlug} />;
  }
};

export default GameViewRouter;