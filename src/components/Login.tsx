import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $isAuthenticated, $isLoading, login, register, initAuth, forgotPassword } from '../stores/auth';
import type { NFLTeam } from '../utils/api';
import api from '../utils/api';
import { HomeIcon } from '@heroicons/react/24/outline';

const Login: React.FC = () => {
  const isAuthenticated = useStore($isAuthenticated);
  const isLoading = useStore($isLoading);
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [teams, setTeams] = useState<NFLTeam[]>([]);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    favoriteTeamId: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Only run on client side
    if (typeof window !== 'undefined') {
      initAuth();
      loadTeams();
    }
  }, []);

  const loadTeams = async () => {
    const response = await api.getTeams();
    if (response.success && response.data) {
      setTeams(response.data.teams);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      let result;
      if (mode === 'login') {
        result = await login(formData.email, formData.password);
        if (result.success) {
          // Redirect to dashboard
          window.location.href = '/dashboard';
        } else {
          setError(result.error || 'Authentication failed');
        }
      } else if (mode === 'register') {
        result = await register({
          email: formData.email,
          password: formData.password,
          firstName: formData.firstName,
          lastName: formData.lastName,
          favoriteTeamId: formData.favoriteTeamId || undefined,
        });
        if (result.success) {
          // Redirect to dashboard
          window.location.href = '/dashboard';
        } else {
          setError(result.error || 'Authentication failed');
        }
      } else if (mode === 'forgot') {
        result = await forgotPassword(formData.email);
        if (result.success) {
          setSuccess('If an account exists, a reset email has been sent. Please check your email.');
          setFormData({ ...formData, email: '' });
        } else {
          setError(result.error || 'Failed to send reset email');
        }
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

  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="text-center p-8">
        <p className="text-green-600 mb-4">You are logged in!</p>
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

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex mb-6">
        <button
          type="button"
          onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
          className={`flex-1 py-2 px-4 text-center font-medium rounded-l-lg transition-colors ${
            mode === 'login'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Login
        </button>
        <button
          type="button"
          onClick={() => { setMode('register'); setError(''); setSuccess(''); }}
          className={`flex-1 py-2 px-4 text-center font-medium transition-colors ${
            mode === 'register'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Register
        </button>
        <button
          type="button"
          onClick={() => { setMode('forgot'); setError(''); setSuccess(''); }}
          className={`flex-1 py-2 px-4 text-center font-medium rounded-r-lg transition-colors ${
            mode === 'forgot'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Reset Password
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}
        
        {success && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
            {success}
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
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {mode !== 'forgot' && (
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
        )}

        {mode === 'forgot' && (
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-4">
              Enter your email address and we'll send you a link to reset your password.
            </p>
          </div>
        )}

        {mode === 'register' && (
          <>
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
          </>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Processing...' :
           mode === 'login' ? 'Login' :
           mode === 'register' ? 'Register' :
           'Send Reset Email'}
        </button>

        {mode === 'login' && (
          <div className="text-center">
            <button
              type="button"
              onClick={() => { setMode('forgot'); setError(''); setSuccess(''); }}
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              Forgot your password?
            </button>
          </div>
        )}
      </form>
    </div>
  );
};

export default Login;