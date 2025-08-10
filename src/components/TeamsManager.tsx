import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $user, $isAuthenticated, $isLoading, initAuth } from '../stores/auth';
import { HomeIcon } from '@heroicons/react/24/outline';
import type { NFLTeam } from '../utils/api';
import api from '../utils/api';

const TeamsManager: React.FC = () => {
  const user = useStore($user);
  const isAuthenticated = useStore($isAuthenticated);
  const isLoading = useStore($isLoading);
  const [teams, setTeams] = useState<NFLTeam[]>([]);
  const [availableLogos, setAvailableLogos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [logosLoading, setLogosLoading] = useState(true);
  const [error, setError] = useState('');
  const [logoError, setLogoError] = useState('');
  const [editingTeam, setEditingTeam] = useState<NFLTeam | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      initAuth();
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && user) {
      if (!user.isAdmin) {
        window.location.href = '/dashboard';
        return;
      }
      loadTeams();
      loadAvailableLogos();
    } else if (!isLoading && !isAuthenticated) {
      window.location.href = '/';
    }
  }, [isAuthenticated, user, isLoading]);

  const loadTeams = async () => {
    try {
      setLoading(true);
      const response = await api.getTeams();
      if (response.success && response.data) {
        setTeams(response.data.teams);
      }
    } catch (err) {
      setError('Failed to load teams');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableLogos = async () => {
    try {
      setLogosLoading(true);
      setLogoError('');
      
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      if (!token) {
        setLogoError('Authentication token not found. Please log in again.');
        return;
      }

      const response = await fetch('/api/admin/team-logos', {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setAvailableLogos(data.logos || []);
        if (!data.logos || data.logos.length === 0) {
          setLogoError('No logos found in directory');
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        setLogoError(`Failed to load logos: ${response.status} - ${errorData.error || response.statusText}`);
      }
    } catch (err) {
      setLogoError(`Network error loading logos: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLogosLoading(false);
    }
  };

  const saveTeam = async (team: NFLTeam) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch(`/api/admin/teams/${team.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          team_city: team.team_city,
          team_name: team.team_name,
          team_primary_color: team.team_primary_color,
          team_secondary_color: team.team_secondary_color,
          team_logo: team.team_logo
        })
      });

      if (response.ok) {
        setTeams(teams.map(t => t.id === team.id ? team : t));
        setEditingTeam(null);
      } else {
        setError('Failed to save team changes');
      }
    } catch (err) {
      setError('Failed to save team changes');
    }
  };

  const handleLogoSelect = (logoFile: string) => {
    if (editingTeam) {
      setEditingTeam({
        ...editingTeam,
        team_logo: `/logos/${logoFile}`
      });
    }
  };

  if (isLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated || !user || !user.isAdmin) {
    return (
      <div className="min-h-screen bg-gray-100 flex justify-center items-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Access denied</p>
          <a href="/dashboard" className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2">
            <HomeIcon className="h-4 w-4" />
            <span>Go to Dashboard</span>
          </a>
        </div>
      </div>
    );
  }

  const groupedTeams = teams.reduce((acc, team) => {
    const conference = team.team_conference;
    if (!acc[conference]) {
      acc[conference] = {};
    }
    const division = team.team_division;
    if (!acc[conference][division]) {
      acc[conference][division] = [];
    }
    acc[conference][division].push(team);
    return acc;
  }, {} as Record<string, Record<string, NFLTeam[]>>);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-purple-600 text-white shadow-lg">
        <div className="container mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <div>
              <nav className="text-sm opacity-90 mb-2">
                <a href="/admin" className="hover:underline">Admin</a> / Teams
              </nav>
              <h1 className="text-3xl font-bold">NFL Teams Manager</h1>
              <p className="text-lg opacity-90">Manage NFL team information</p>
            </div>
            <div className="flex items-center space-x-4">
              <a
                href="/admin"
                className="bg-gray-600 text-white hover:bg-opacity-30 px-4 py-2 rounded-lg transition-colors"
              >
                Back to Admin
              </a>
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

        {logoError && (
          <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-6">
            <strong>Logo Loading Warning:</strong> {logoError}
            <button
              onClick={loadAvailableLogos}
              className="ml-3 text-yellow-800 underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Teams Overview */}
        <div className="bg-white rounded-lg shadow-md mb-8">
          <div className="p-6 border-b">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 flex items-center justify-center">
                <img
                  src="/logos/NFL.svg"
                  alt="NFL Logo"
                  className="w-12 h-12 object-contain"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const container = target.parentElement;
                    if (container) {
                      container.innerHTML = `
                        <div class="w-12 h-12 bg-gray-300 rounded flex items-center justify-center">
                          <span class="text-sm font-bold text-gray-600">NFL</span>
                        </div>
                      `;
                    }
                  }}
                />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-800">Teams Overview</h2>
                <p className="text-gray-600">Total: {teams.length} teams</p>
              </div>
            </div>
          </div>
          
          <div className="p-6">
            {Object.entries(groupedTeams).map(([conference, divisions]) => (
              <div key={conference} className="mb-8">
                <div className="flex items-center space-x-3 mb-4 border-b pb-2">
                  <div className="w-8 h-8 flex items-center justify-center">
                    <img
                      src={`/logos/${conference.toLowerCase()}_logo.svg`}
                      alt={`${conference} Conference Logo`}
                      className="w-8 h-8 object-contain"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const container = target.parentElement;
                        if (container) {
                          container.innerHTML = `
                            <div class="w-8 h-8 bg-gray-300 rounded flex items-center justify-center">
                              <span class="text-xs font-bold text-gray-600">${conference.slice(0, 3)}</span>
                            </div>
                          `;
                        }
                      }}
                    />
                  </div>
                  <h3 className="text-xl font-bold text-gray-800">
                    {conference} Conference
                  </h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {Object.entries(divisions).map(([division, divisionTeams]) => (
                    <div key={division} className="border rounded-lg p-4">
                      <h4 className="text-lg font-semibold text-gray-700 mb-3">
                        {division} Division
                      </h4>
                      
                      <div className="space-y-2">
                        {divisionTeams.map((team) => {
                          const primaryColor = team.team_primary_color || '#666666';
                          const secondaryColor = team.team_secondary_color || '#cccccc';
                          const gradientStyle = {
                            background: `linear-gradient(30deg, ${primaryColor} 0%, white 25%, white 75%, ${secondaryColor} 100%)`
                          };
                          
                          return (
                            <div
                              key={team.id}
                              className="flex items-center justify-between p-3 border rounded-lg hover:shadow-md transition-shadow"
                              style={gradientStyle}
                            >
                              <div className="flex items-center space-x-3">
                                <div className="w-12 h-12 flex items-center justify-center bg-white rounded-lg shadow-sm">
                                  {team.team_logo ? (
                                    <img
                                      src={team.team_logo}
                                      alt={`${team.team_city} ${team.team_name} logo`}
                                      className="w-10 h-10 object-contain"
                                      onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        target.style.display = 'none';
                                        target.parentElement!.innerHTML = `
                                          <div class="w-8 h-8 rounded flex items-center justify-center text-xs font-bold text-white" 
                                               style="background-color: ${team.team_primary_color || '#666'}">
                                            ${team.team_code}
                                          </div>
                                        `;
                                      }}
                                    />
                                  ) : (
                                    <div
                                      className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold text-white"
                                      style={{ backgroundColor: team.team_primary_color || '#666' }}
                                    >
                                      {team.team_code}
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <div className="font-medium text-gray-800">
                                    {team.team_city} {team.team_name}
                                  </div>
                                  <div className="text-sm text-gray-600">
                                    {team.team_code}
                                  </div>
                                </div>
                              </div>
                              
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => setEditingTeam(team)}
                                  className="bg-white bg-opacity-80 hover:bg-opacity-100 text-blue-600 hover:text-blue-800 px-3 py-1 rounded text-sm font-medium shadow-sm transition-all"
                                >
                                  Edit
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Edit Team Modal */}
        {editingTeam && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold mb-4">Edit Team</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Team Code
                  </label>
                  <input
                    type="text"
                    value={editingTeam.team_code}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={editingTeam.team_city}
                    onChange={(e) => setEditingTeam({...editingTeam, team_city: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Team Name
                  </label>
                  <input
                    type="text"
                    value={editingTeam.team_name}
                    onChange={(e) => setEditingTeam({...editingTeam, team_name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Primary Color
                  </label>
                  <input
                    type="color"
                    value={editingTeam.team_primary_color || '#000000'}
                    onChange={(e) => setEditingTeam({...editingTeam, team_primary_color: e.target.value})}
                    className="w-full h-10 border border-gray-300 rounded-md"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Secondary Color
                  </label>
                  <input
                    type="color"
                    value={editingTeam.team_secondary_color || '#ffffff'}
                    onChange={(e) => setEditingTeam({...editingTeam, team_secondary_color: e.target.value})}
                    className="w-full h-10 border border-gray-300 rounded-md"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Team Logo
                  </label>
                  <div className="border border-gray-300 rounded-md p-3">
                    {editingTeam.team_logo && (
                      <div className="flex items-center space-x-3 mb-3">
                        <div className="w-12 h-12 flex items-center justify-center bg-white rounded border">
                          <img
                            src={editingTeam.team_logo}
                            alt="Current logo"
                            className="w-12 h-12 object-contain"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              const container = target.parentElement;
                              if (container) {
                                container.innerHTML = `
                                  <div class="w-10 h-10 bg-gray-300 rounded flex items-center justify-center">
                                    <span class="text-xs font-bold text-gray-600">${editingTeam.team_code}</span>
                                  </div>
                                `;
                              }
                            }}
                          />
                        </div>
                        <span className="text-sm text-gray-600">Current logo</span>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-6 gap-2 max-h-48 overflow-y-auto">
                      {logosLoading ? (
                        <div className="col-span-6 text-center text-gray-500 py-4">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-2"></div>
                          Loading logos...
                        </div>
                      ) : logoError ? (
                        <div className="col-span-6 text-center py-4">
                          <div className="text-red-500 mb-2">Failed to load logos</div>
                          <button
                            onClick={loadAvailableLogos}
                            className="text-purple-600 hover:text-purple-800 underline"
                          >
                            Retry
                          </button>
                          <div className="mt-3 text-sm text-gray-600">
                            Or manually enter logo path:
                            <input
                              type="text"
                              placeholder="/logos/TEAM.svg"
                              className="block w-full mt-1 px-2 py-1 border border-gray-300 rounded text-sm"
                              onBlur={(e) => {
                                if (e.target.value.trim()) {
                                  setEditingTeam({...editingTeam, team_logo: e.target.value.trim()});
                                }
                              }}
                            />
                          </div>
                        </div>
                      ) : availableLogos.length === 0 ? (
                        <div className="col-span-6 text-center text-gray-500 py-4">
                          No logos found in directory
                        </div>
                      ) : (
                        availableLogos.map((logoFile) => (
                          <button
                            key={logoFile}
                            onClick={() => handleLogoSelect(logoFile)}
                            className={`p-2 border rounded-lg hover:bg-gray-50 transition-colors ${
                              editingTeam.team_logo === `/logos/${logoFile}`
                                ? 'border-purple-500 bg-purple-50'
                                : 'border-gray-200'
                            }`}
                          >
                            <img
                              src={`/logos/${logoFile}`}
                              alt={logoFile.replace('.svg', '')}
                              className="w-8 h-8 object-contain mx-auto"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                target.parentElement!.innerHTML = `<div class="text-xs text-gray-400">${logoFile.replace('.svg', '')}</div>`;
                              }}
                            />
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setEditingTeam(null)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => saveTeam(editingTeam)}
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default TeamsManager;