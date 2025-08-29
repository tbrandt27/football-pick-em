import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $isAuthenticated, $isLoading, registerWithInvite, initAuth } from '../stores/auth';
import type { NFLTeam } from '../utils/api';
import api from '../utils/api';
import { HomeIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface RegisterProps {
  inviteToken?: string;
}

const Register: React.FC<RegisterProps> = ({ inviteToken }) => {
  const isAuthenticated = useStore($isAuthenticated);
  const isLoading = useStore($isLoading);
  const [teams, setTeams] = useState<NFLTeam[]>([]);
  const [invitation, setInvitation] = useState<any>(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    favoriteTeamId: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [validatingToken, setValidatingToken] = useState(!!inviteToken);

  useEffect(() => {
    // Only run on client side
    if (typeof window !== 'undefined') {
      initAuth();
      loadTeams();
      
      if (inviteToken) {
        validateInviteToken();
      }
    }
  }, [inviteToken]);

  const loadTeams = async () => {
    const response = await api.getTeams();
    if (response.success && response.data) {
      setTeams(response.data.teams);
    }
  };

  const validateInviteToken = async () => {
    if (!inviteToken) return;
    
    setValidatingToken(true);
    try {
      const response = await api.getInvitationByToken(inviteToken);
      if (response.success && response.data?.invitation) {
        setInvitation(response.data.invitation);
        setFormData(prev => ({
          ...prev,
          email: response.data!.invitation.email
        }));
      } else {
        setError('Invalid or expired invitation link');
      }
    } catch (err) {
      setError('Failed to validate invitation');
    } finally {
      setValidatingToken(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inviteToken) {
      setError('No invitation token provided');
      return;
    }
    
    setError('');
    setLoading(true);

    try {
      const result = await registerWithInvite({
        email: formData.email,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
        favoriteTeamId: formData.favoriteTeamId || undefined,
        inviteToken
      });

      if (result.success) {
        // Redirect to dashboard
        window.location.href = '/dashboard';
      } else {
        setError(result.error || 'Registration failed');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  // Show loading spinner while validating token or auth
  if (isLoading || validatingToken) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">
          {validatingToken ? 'Validating invitation...' : 'Loading...'}
        </span>
      </div>
    );
  }

  // If already authenticated, show success message
  if (isAuthenticated) {
    return (
      <div className="text-center p-8">
        <p className="text-green-600 mb-4">You are already logged in!</p>
        <a
          href="/dashboard"
          className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
        >
          <HomeIcon className="h-4 w-4" />
          <span>Go to Dashboard</span>
        </a>
      </div>
    );
  }

  // Show error if no invite token or invalid token
  if (!inviteToken || (error && !invitation)) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center space-x-3 text-red-600 mb-4">
          <ExclamationTriangleIcon className="h-6 w-6" />
          <h2 className="text-lg font-semibold">Invalid Invitation</h2>
        </div>
        <p className="text-gray-700 mb-4">
          {error || 'This registration page requires a valid invitation token.'}
        </p>
        <a
          href="/"
          className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Return to Login
        </a>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          {invitation?.is_admin_invitation ? 'Create Admin Account' : 'Accept Invitation'}
        </h2>
        {invitation && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-blue-800">
              {invitation.is_admin_invitation ? (
                <>You've been invited to become an <strong>administrator</strong> for NFL Pick'em!</>
              ) : (
                <>You've been invited to join <strong>"{invitation.game_name}"</strong></>
              )}
            </p>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            required
            disabled
            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600 focus:outline-none"
          />
          <p className="text-xs text-gray-500 mt-1">Email is pre-filled from your invitation</p>
        </div>

        <div>
          <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
            First Name
          </label>
          <input
            type="text"
            id="firstName"
            name="firstName"
            value={formData.firstName}
            onChange={handleInputChange}
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
            name="lastName"
            value={formData.lastName}
            onChange={handleInputChange}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <input
            type="password"
            id="password"
            name="password"
            value={formData.password}
            onChange={handleInputChange}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="favoriteTeamId" className="block text-sm font-medium text-gray-700 mb-1">
            Favorite Team (Optional)
          </label>
          <select
            id="favoriteTeamId"
            name="favoriteTeamId"
            value={formData.favoriteTeamId}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select a team...</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.team_city} {team.team_name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Creating Account...' : 'Create Account & Join'}
        </button>
      </form>
    </div>
  );
};

export default Register;