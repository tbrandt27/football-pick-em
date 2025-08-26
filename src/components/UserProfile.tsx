import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $user, $isAuthenticated, $isLoading, initAuth, logout } from '../stores/auth';
import type { NFLTeam } from '../utils/api';
import api from '../utils/api';
import FavoriteTeamSelector from './FavoriteTeamSelector';
import { ArrowLeftStartOnRectangleIcon, HomeIcon } from '@heroicons/react/24/outline';

const UserProfile: React.FC = () => {
  const user = useStore($user);
  const isAuthenticated = useStore($isAuthenticated);
  const isLoading = useStore($isLoading);
  
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [favoriteTeamId, setFavoriteTeamId] = useState('');
  const [favoriteTeam, setFavoriteTeam] = useState<NFLTeam | null>(null);
  const [defaultTeam, setDefaultTeam] = useState<NFLTeam | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      initAuth();
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && user) {
      loadUserData();
    } else if (!isLoading && !isAuthenticated) {
      window.location.href = '/';
    }
  }, [isAuthenticated, user, isLoading]);

  const loadUserData = async () => {
    try {
      setLoading(true);
      setFirstName(user?.firstName || '');
      setLastName(user?.lastName || '');
      setEmail(user?.email || '');
      setFavoriteTeamId(user?.favoriteTeamId || '');

      // Always load the default team for fallback
      await loadDefaultTeam();

      // Load favorite team details if one is set
      if (user?.favoriteTeamId) {
        const teamsResponse = await api.getTeams();
        if (teamsResponse.success && teamsResponse.data) {
          const team = teamsResponse.data.teams.find(t => t.id === user.favoriteTeamId);
          setFavoriteTeam(team || null);
        }
      } else {
        setFavoriteTeam(null);
      }
    } catch (err) {
      setError('Failed to load user data');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const updateData = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        favoriteTeamId: favoriteTeamId === '' ? undefined : favoriteTeamId
      };
      
      const response = await api.updateUser(updateData);

      if (response.success && response.data) {
        setSuccess('Profile updated successfully!');
        
        // Update the global user state in the auth store
        $user.set(response.data.user);
        
        // Don't overwrite local state - keep the current selections
        // The local state already reflects what the user selected
        
        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(response.error || 'Failed to update profile');
      }
    } catch (err) {
      setError('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleFavoriteTeamSelect = (teamId: string, team?: NFLTeam) => {
    setFavoriteTeamId(teamId);
    // Update favorite team display immediately
    setFavoriteTeam(team || null);
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

  if (isLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen bg-gray-100 flex justify-center items-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Please log in to continue</p>
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

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-blue-600 text-white shadow-lg" style={getHeaderStyle()}>
        <div className="container mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
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
                <h1 className="text-3xl font-bold">User Profile</h1>
                <p className="text-lg opacity-90">Manage your account settings</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <a
                href="/dashboard"
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
              >
                <HomeIcon className="h-4 w-4" />
                <span>Dashboard</span>
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

        <div className="bg-white rounded-lg shadow-md">
          <div className="p-6 border-b">
            <h2 className="text-2xl font-bold text-gray-800">Profile Settings</h2>
            <p className="text-gray-600 mt-1">Update your personal information and preferences</p>
          </div>

          <div className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Name Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
                    First Name
                  </label>
                  <input
                    type="text"
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Email Field (Read-only) */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500 cursor-not-allowed"
                />
                <p className="text-sm text-gray-500 mt-1">Email cannot be changed. Contact support if needed.</p>
              </div>

              {/* Favorite Team */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Favorite Team
                </label>
                <div className="flex items-center space-x-4">
                  <FavoriteTeamSelector
                    currentFavoriteId={favoriteTeamId}
                    onTeamSelect={handleFavoriteTeamSelect}
                  />
                  {favoriteTeam && (
                    <div className="flex items-center space-x-2 text-sm text-gray-600">
                      <span>Selected:</span>
                      <div className="flex items-center space-x-1">
                        {favoriteTeam.team_logo && (
                          <img
                            src={favoriteTeam.team_logo}
                            alt={`${favoriteTeam.team_city} ${favoriteTeam.team_name} logo`}
                            className="w-6 h-6 object-contain"
                          />
                        )}
                        <span className="font-medium">
                          {favoriteTeam.team_city} {favoriteTeam.team_name}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  Your favorite team will be used to customize header colors and themes throughout the app.
                </p>
              </div>

              {/* Submit Button */}
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
};

export default UserProfile;