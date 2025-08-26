import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $user, $isAuthenticated, $isLoading, initAuth, logout } from '../stores/auth';
import type { PickemGame, GameParticipant, NFLTeam, GameInvitation } from '../utils/api';
import api from '../utils/api';
import { UserCircleIcon, ArrowLeftStartOnRectangleIcon, HomeIcon, Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';

interface GameManagementProps {
  gameId: string;
}

const GameManagement: React.FC<GameManagementProps> = ({ gameId }) => {
  const user = useStore($user);
  const isAuthenticated = useStore($isAuthenticated);
  const isLoading = useStore($isLoading);
  
  const [game, setGame] = useState<(PickemGame & { participants: GameParticipant[] }) | null>(null);
  const [favoriteTeam, setFavoriteTeam] = useState<NFLTeam | null>(null);
  const [invitations, setInvitations] = useState<GameInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [editingGameName, setEditingGameName] = useState(false);
  const [newGameName, setNewGameName] = useState('');
  const [savingGameName, setSavingGameName] = useState(false);
  const [deletingGame, setDeletingGame] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
  }, [isAuthenticated, user, isLoading, gameId]);

  const loadGameData = async () => {
    try {
      setLoading(true);
      const [gameResponse, teamsResponse, invitationsResponse] = await Promise.all([
        api.getGame(gameId),
        api.getTeams(),
        api.getGameInvitations(gameId)
      ]);

      if (!gameResponse.success || !gameResponse.data) {
        setError('Game not found or access denied');
        return;
      }

      setGame(gameResponse.data.game);
      setNewGameName(gameResponse.data.game.game_name);

      // Load invitations
      if (invitationsResponse.success && invitationsResponse.data) {
        setInvitations(invitationsResponse.data.invitations);
      }

      // Load favorite team for header styling
      if (user?.favoriteTeamId && teamsResponse.success && teamsResponse.data) {
        const team = teamsResponse.data.teams.find(t => t.id === user.favoriteTeamId);
        setFavoriteTeam(team || null);
      }

    } catch (err) {
      setError('Failed to load game data');
    } finally {
      setLoading(false);
    }
  };

  const handleInvitePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setInviting(true);
    setError('');
    setSuccess('');

    try {
      const response = await api.addPlayerToGame(gameId, inviteEmail.trim());

      if (response.success) {
        if (response.data?.type === 'direct_add') {
          setSuccess(`Successfully added ${inviteEmail} to the game`);
        } else if (response.data?.type === 'invitation_sent') {
          setSuccess(`Invitation sent to ${inviteEmail}. They'll receive an email to join the game.`);
        } else {
          setSuccess(`Successfully invited ${inviteEmail}`);
        }
        setInviteEmail('');
        // Reload game data to show new participant and invitations
        await loadGameData();
        // Clear success message after 5 seconds for invitations (longer message)
        setTimeout(() => setSuccess(''), 5000);
      } else {
        setError(response.error || 'Failed to invite player');
      }
    } catch (err) {
      setError('Failed to invite player');
    } finally {
      setInviting(false);
    }
  };

  const handleRemovePlayer = async (userId: string, playerName: string) => {
    if (!confirm(`Are you sure you want to remove ${playerName} from this game?`)) {
      return;
    }

    try {
      const response = await api.removePlayerFromGame(gameId, userId);

      if (response.success) {
        setSuccess(`Successfully removed ${playerName}`);
        // Reload game data to update participant list
        await loadGameData();
        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(response.error || 'Failed to remove player');
      }
    } catch (err) {
      setError('Failed to remove player');
    }
  };

  const handleCancelInvitation = async (invitationId: string, email: string) => {
    if (!confirm(`Are you sure you want to cancel the invitation for ${email}?`)) {
      return;
    }

    try {
      const response = await api.cancelGameInvitation(gameId, invitationId);

      if (response.success) {
        setSuccess(`Invitation for ${email} cancelled successfully`);
        // Remove the invitation from the list
        setInvitations(invitations.filter(inv => inv.id !== invitationId));
        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(response.error || 'Failed to cancel invitation');
      }
    } catch (err) {
      setError('Failed to cancel invitation');
    }
  };

  const handleUpdateGameName = async () => {
    if (!newGameName.trim() || newGameName.trim() === game?.game_name) {
      setEditingGameName(false);
      setNewGameName(game?.game_name || '');
      return;
    }

    setSavingGameName(true);
    setError('');
    setSuccess('');

    try {
      const response = await api.updateGame(gameId, { gameName: newGameName.trim() });

      if (response.success) {
        setSuccess('Game name updated successfully!');
        setEditingGameName(false);
        // Reload game data to show updated name
        await loadGameData();
        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(response.error || 'Failed to update game name');
      }
    } catch (err) {
      setError('Failed to update game name');
    } finally {
      setSavingGameName(false);
    }
  };

  const handleCancelGameNameEdit = () => {
    setEditingGameName(false);
    setNewGameName(game?.game_name || '');
  };

  const handleDeleteGame = async () => {
    if (!game) return;
    
    const confirmDelete = confirm(
      `Are you sure you want to delete "${game.game_name}"?\n\nThis action cannot be undone and will remove all participants, picks, and game data.`
    );
    
    if (!confirmDelete) return;

    setDeletingGame(true);
    setError('');
    setSuccess('');

    try {
      const response = await api.deleteGame(gameId);

      if (response.success) {
        setSuccess('Game deleted successfully! Redirecting to dashboard...');
        // Redirect to dashboard after a short delay
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 2000);
      } else {
        setError(response.error || 'Failed to delete game');
      }
    } catch (err) {
      setError('Failed to delete game');
    } finally {
      setDeletingGame(false);
    }
  };

  const getHeaderStyle = () => {
    if (favoriteTeam?.team_primary_color && favoriteTeam?.team_secondary_color) {
      return {
        background: `linear-gradient(135deg, ${favoriteTeam.team_primary_color} 0%, ${favoriteTeam.team_secondary_color} 100%)`
      };
    }
    // Use system default colors when no team is selected
    return {
      background: `linear-gradient(135deg, #013369 0%, #d50a0a 100%)`
    };
  };

  if (isLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated || !user || !game) {
    return (
      <div className="min-h-screen bg-gray-100 flex justify-center items-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">
            {error || 'Unable to load game data'}
          </p>
          <a
            href="/dashboard"
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
          >
            <HomeIcon className="h-4 w-4" />
            <span>Back to Dashboard</span>
          </a>
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
                <h1 className="text-3xl font-bold">Manage Game</h1>
                <p className="text-lg opacity-90">{game.game_name}</p>
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
                  <h1 className="text-2xl font-bold">Manage Game</h1>
                  <p className="text-sm opacity-90">{game.game_name}</p>
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

        {success && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-6">
            {success}
          </div>
        )}

        {/* Game Info */}
        <div className="bg-white rounded-lg shadow-md mb-8">
          <div className="p-6 border-b">
            <h2 className="text-2xl font-bold text-gray-800">Game Information</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">Game Name</h3>
                {editingGameName ? (
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={newGameName}
                      onChange={(e) => setNewGameName(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleUpdateGameName();
                        if (e.key === 'Escape') handleCancelGameNameEdit();
                      }}
                      autoFocus
                    />
                    <button
                      onClick={handleUpdateGameName}
                      disabled={savingGameName}
                      className="bg-green-600 text-white px-3 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 text-sm transition-colors"
                    >
                      {savingGameName ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={handleCancelGameNameEdit}
                      className="bg-gray-500 text-white px-3 py-2 rounded-md hover:bg-gray-600 text-sm transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <p className="text-lg font-semibold text-gray-900">{game.game_name}</p>
                    <button
                      onClick={() => setEditingGameName(true)}
                      className="text-blue-600 hover:text-blue-800 text-sm"
                      title="Edit game name"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500">Game Type</h3>
                <p className="text-lg font-semibold text-gray-900 capitalize">{game.game_type}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500">Total Participants</h3>
                <p className="text-lg font-semibold text-gray-900">{game.participants.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Current Participants */}
        <div className="bg-white rounded-lg shadow-md mb-8">
          <div className="p-6 border-b">
            <h2 className="text-2xl font-bold text-gray-800">Current Participants</h2>
            <p className="text-gray-600 mt-1">{game.participants.length} people in this game</p>
          </div>
          <div className="p-6">
            {game.participants.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-600">No participants yet. Invite some players to get started!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {game.participants.map((participant) => (
                  <div
                    key={participant.id}
                    className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-blue-600 font-semibold text-sm">
                          {participant.display_name?.charAt(0).toUpperCase() || 
                           participant.first_name?.charAt(0).toUpperCase() || 
                           participant.email?.charAt(0).toUpperCase() || '?'}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {participant.display_name || `${participant.first_name || ''} ${participant.last_name || ''}`.trim() || participant.email}
                        </p>
                        <p className="text-sm text-gray-500">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            participant.role === 'owner'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {participant.role === 'owner' ? 'Commissioner' : 'Player'}
                          </span>
                        </p>
                      </div>
                    </div>
                    {participant.role !== 'owner' && (
                      <button
                        onClick={() => handleRemovePlayer(participant.user_id, participant.display_name || 'Player')}
                        className="text-red-600 hover:text-red-800 text-sm font-medium transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Invite Players & Pending Invitations */}
        <div className="bg-white rounded-lg shadow-md mb-8">
          <div className="p-6 border-b">
            <h2 className="text-2xl font-bold text-gray-800">Invite Players</h2>
            <p className="text-gray-600 mt-1">Add players to your game by their email address</p>
          </div>
          <div className="p-6">
            <form onSubmit={handleInvitePlayer} className="flex gap-4">
              <div className="flex-1">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="Enter player's email address"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={inviting}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {inviting ? 'Inviting...' : 'Invite Player'}
              </button>
            </form>

            {/* Pending Invitations */}
            {invitations.length > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Pending Invitations ({invitations.length})</h3>
                <div className="space-y-3">
                  {invitations.map((invitation) => (
                    <div
                      key={invitation.id}
                      className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                          <span className="text-yellow-600 font-semibold text-sm">
                            {invitation.email.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{invitation.email}</p>
                          <p className="text-sm text-gray-500">
                            Invited by {invitation.invited_by_name} on{' '}
                            {new Date(invitation.created_at).toLocaleDateString()}
                          </p>
                          <p className="text-sm text-gray-500">
                            Expires: {new Date(invitation.expires_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleCancelInvitation(invitation.id, invitation.email)}
                        className="text-red-600 hover:text-red-800 text-sm font-medium transition-colors"
                      >
                        Cancel Invitation
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-gray-50 rounded-lg border border-gray-200 mt-12">
          <div className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-lg font-medium text-gray-900 mb-2">Delete Game</h3>
                <p className="text-sm text-gray-600">
                  This will permanently delete the game, all participants, and all picks. This action cannot be undone.
                </p>
              </div>
              <button
                onClick={handleDeleteGame}
                disabled={deletingGame}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2 ml-4"
              >
                {deletingGame ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    <span>Delete Game</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default GameManagement;