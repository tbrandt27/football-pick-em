import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $user, $isAuthenticated, $isLoading, initAuth } from '../stores/auth';
import { HomeIcon } from '@heroicons/react/24/outline';

interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_admin: boolean;
  email_verified: boolean;
  last_login: string | null;
  created_at: string;
  game_count: number;
}

interface Invitation {
  id: string;
  email: string;
  status: string;
  expires_at: string;
  created_at: string;
  game_name: string;
  invited_by_name: string;
}

const UsersManager: React.FC = () => {
  const user = useStore($user);
  const isAuthenticated = useStore($isAuthenticated);
  const isLoading = useStore($isLoading);
  const [users, setUsers] = useState<User[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [showAdminInviteForm, setShowAdminInviteForm] = useState(false);
  const [inviteFormData, setInviteFormData] = useState({
    email: '',
    gameId: ''
  });
  const [adminInviteEmail, setAdminInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [invitingAdmin, setInvitingAdmin] = useState(false);
  const [showConfirmInviteModal, setShowConfirmInviteModal] = useState(false);
  const [confirmInviteData, setConfirmInviteData] = useState({
    invitationId: '',
    email: '',
    firstName: '',
    lastName: '',
    tempPassword: ''
  });
  const [confirmingInvitation, setConfirmingInvitation] = useState(false);
  const [sendingPasswordReset, setSendingPasswordReset] = useState<string | null>(null);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [showDeleteUserModal, setShowDeleteUserModal] = useState(false);
  const [resetPasswordData, setResetPasswordData] = useState({
    userId: '',
    userName: '',
    userEmail: ''
  });
  const [deleteUserData, setDeleteUserData] = useState({
    userId: '',
    userName: '',
    userEmail: ''
  });

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
      loadUsers();
    } else if (!isLoading && !isAuthenticated) {
      window.location.href = '/';
    }
  }, [isAuthenticated, user, isLoading]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      
      const [usersResponse, invitationsResponse, gamesResponse] = await Promise.all([
        fetch('/api/admin/users', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('/api/admin/invitations', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('/api/admin/games', {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (usersResponse.ok) {
        const userData = await usersResponse.json();
        setUsers(userData.users);
      } else {
        setError('Failed to load users');
      }

      if (invitationsResponse.ok) {
        const invitationData = await invitationsResponse.json();
        setInvitations(invitationData.invitations);
      }

      if (gamesResponse.ok) {
        const gamesData = await gamesResponse.json();
        setGames(gamesData.games || []);
      }
    } catch (err) {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const toggleAdminStatus = async (userId: string, isAdmin: boolean) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch(`/api/admin/users/${userId}/admin`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ isAdmin })
      });

      if (response.ok) {
        setUsers(users.map(u => 
          u.id === userId ? { ...u, is_admin: isAdmin } : u
        ));
      } else {
        setError('Failed to update admin status');
      }
    } catch (err) {
      setError('Failed to update admin status');
    }
  };

  const verifyUserEmail = async (userId: string, userName: string, userEmail: string) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch(`/api/admin/users/${userId}/verify-email`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        setUsers(users.map(u =>
          u.id === userId ? { ...u, email_verified: true } : u
        ));
        
        // Show success message briefly
        setError('');
        const successDiv = document.createElement('div');
        successDiv.className = 'bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-6';
        successDiv.textContent = result.message || `Email verified for ${userName}`;
        
        // Insert success message at the top of the main content area
        const mainContent = document.querySelector('main');
        if (mainContent && mainContent.firstChild) {
          mainContent.insertBefore(successDiv, mainContent.firstChild);
          setTimeout(() => successDiv.remove(), 5000);
        }
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to verify email');
      }
    } catch (err) {
      setError('Failed to verify email');
    }
  };

  const cancelInvitation = async (invitationId: string) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch(`/api/admin/invitations/${invitationId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        setInvitations(invitations.filter(inv => inv.id !== invitationId));
      } else {
        setError('Failed to cancel invitation');
      }
    } catch (err) {
      setError('Failed to cancel invitation');
    }
  };

  const openConfirmInviteModal = (invitationId: string, email: string) => {
    setConfirmInviteData({
      invitationId,
      email,
      firstName: '',
      lastName: '',
      tempPassword: ''
    });
    setShowConfirmInviteModal(true);
  };

  const confirmInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmInviteData.firstName.trim() || !confirmInviteData.lastName.trim() || !confirmInviteData.tempPassword.trim()) {
      setError('First name, last name, and temporary password are required');
      return;
    }

    setConfirmingInvitation(true);
    setError('');

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch(`/api/admin/invitations/${confirmInviteData.invitationId}/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          firstName: confirmInviteData.firstName.trim(),
          lastName: confirmInviteData.lastName.trim(),
          tempPassword: confirmInviteData.tempPassword.trim()
        })
      });

      if (response.ok) {
        const result = await response.json();
        // Remove the invitation from the list since it's now confirmed
        setInvitations(invitations.filter(inv => inv.id !== confirmInviteData.invitationId));
        
        // Close modal
        setShowConfirmInviteModal(false);
        setConfirmInviteData({
          invitationId: '',
          email: '',
          firstName: '',
          lastName: '',
          tempPassword: ''
        });
        
        // Show success message with temporary password
        setError('');
        const successDiv = document.createElement('div');
        successDiv.className = 'bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-6';
        successDiv.innerHTML = `
          <div class="font-semibold">Account created for ${confirmInviteData.email}</div>
          <div>Name: ${confirmInviteData.firstName} ${confirmInviteData.lastName}</div>
          <div>Temporary password: <code class="bg-green-200 px-2 py-1 rounded font-mono">${confirmInviteData.tempPassword}</code></div>
          <div class="text-sm mt-1">Send this password to the user securely</div>
        `;
        
        // Insert success message at the top of the main content area
        const mainContent = document.querySelector('main');
        if (mainContent && mainContent.firstChild) {
          mainContent.insertBefore(successDiv, mainContent.firstChild);
          setTimeout(() => successDiv.remove(), 15000); // Show longer for password
        }
        
        // Reload users to show the new account
        await loadUsers();
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to confirm invitation');
      }
    } catch (err) {
      setError('Failed to confirm invitation');
    } finally {
      setConfirmingInvitation(false);
    }
  };

  const deleteUser = async (userId: string, userName: string, userEmail: string) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        setUsers(users.filter(u => u.id !== userId));
        // Show success message briefly
        setError('');
        const successDiv = document.createElement('div');
        successDiv.className = 'bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-6';
        successDiv.textContent = `User "${userName}" (${userEmail}) deleted successfully`;
        
        // Insert success message at the top of the main content area
        const mainContent = document.querySelector('main');
        if (mainContent && mainContent.firstChild) {
          mainContent.insertBefore(successDiv, mainContent.firstChild);
          setTimeout(() => successDiv.remove(), 5000);
        }
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to delete user');
      }
    } catch (err) {
      setError('Failed to delete user');
    }
  };

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteFormData.email.trim() || !inviteFormData.gameId) return;

    setInviting(true);
    setError('');

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch(`/api/admin/invite-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          email: inviteFormData.email.trim(),
          gameId: inviteFormData.gameId
        })
      });

      if (response.ok) {
        const result = await response.json();
        setShowInviteForm(false);
        setInviteFormData({ email: '', gameId: '' });
        setError('');
        
        // Show success message briefly
        const successDiv = document.createElement('div');
        successDiv.className = 'bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-6';
        successDiv.textContent = result.message || 'User invitation sent successfully';
        
        // Insert success message at the top of the main content area
        const mainContent = document.querySelector('main');
        if (mainContent && mainContent.firstChild) {
          mainContent.insertBefore(successDiv, mainContent.firstChild);
          setTimeout(() => successDiv.remove(), 5000);
        }
        
        // Reload data to show any updates
        await loadUsers();
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to send invitation');
      }
    } catch (err) {
      setError('Failed to send invitation');
    } finally {
      setInviting(false);
    }
  };

  const handleInviteAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminInviteEmail.trim()) return;

    setInvitingAdmin(true);
    setError('');

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch(`/api/admin/invite-admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          email: adminInviteEmail.trim()
        })
      });

      if (response.ok) {
        const result = await response.json();
        setShowAdminInviteForm(false);
        setAdminInviteEmail('');
        setError('');
        
        // Show success message briefly
        const successDiv = document.createElement('div');
        successDiv.className = 'bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-6';
        successDiv.textContent = result.message || 'Admin invitation sent successfully';
        
        // Insert success message at the top of the main content area
        const mainContent = document.querySelector('main');
        if (mainContent && mainContent.firstChild) {
          mainContent.insertBefore(successDiv, mainContent.firstChild);
          setTimeout(() => successDiv.remove(), 5000);
        }
        
        // Reload data to show any updates
        await loadUsers();
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to send admin invitation');
      }
    } catch (err) {
      setError('Failed to send admin invitation');
    } finally {
      setInvitingAdmin(false);
    }
  };

  const sendPasswordReset = async (userId: string, userName: string, userEmail: string) => {
    setSendingPasswordReset(userId);
    setError('');

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch(`/api/admin/users/${userId}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        
        // Show success message briefly
        const successDiv = document.createElement('div');
        successDiv.className = 'bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-6';
        successDiv.textContent = result.message || `Password reset email sent to ${userName}`;
        
        // Insert success message at the top of the main content area
        const mainContent = document.querySelector('main');
        if (mainContent && mainContent.firstChild) {
          mainContent.insertBefore(successDiv, mainContent.firstChild);
          setTimeout(() => successDiv.remove(), 5000);
        }
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to send password reset email');
      }
    } catch (err) {
      setError('Failed to send password reset email');
    } finally {
      setSendingPasswordReset(null);
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

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-green-600 text-white shadow-lg">
        <div className="container mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <div>
              <nav className="text-sm opacity-90 mb-2">
                <a href="/admin" className="hover:underline">Admin</a> / Users
              </nav>
              <h1 className="text-3xl font-bold">Users Manager</h1>
              <p className="text-lg opacity-90">Manage user accounts and permissions</p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowInviteForm(true)}
                className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Invite User
              </button>
              <button
                onClick={() => setShowAdminInviteForm(true)}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Invite Admin
              </button>
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

        {/* Users Table */}
        <div className="bg-white rounded-lg shadow-md">
          <div className="p-6 border-b">
            <h2 className="text-2xl font-bold text-gray-800">All Users</h2>
            <p className="text-gray-600">Total: {users.length} users</p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Games
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Joined
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((userData) => (
                  <tr key={userData.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                            <span className="text-sm font-medium text-gray-700">
                              {(userData.first_name || 'U').charAt(0)}{(userData.last_name || 'U').charAt(0)}
                            </span>
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {userData.first_name || 'Unknown'} {userData.last_name || 'User'}
                          </div>
                          <div className="text-sm text-gray-500">
                            {userData.is_admin && (
                              <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                                Admin
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{userData.email}</div>
                      <div className="text-sm text-gray-500">
                        {userData.email_verified ? (
                          <span className="text-green-600">✓ Verified</span>
                        ) : (
                          <div className="flex items-center space-x-2">
                            <span className="text-yellow-600">⚠ Unverified</span>
                            <button
                              onClick={() => {
                                if (confirm(`Manually verify email for ${userData.first_name || 'Unknown'} ${userData.last_name || 'User'}?\n\nThis will mark their email as verified without requiring them to click a verification link.`)) {
                                  verifyUserEmail(userData.id, `${userData.first_name || 'Unknown'} ${userData.last_name || 'User'}`, userData.email);
                                }
                              }}
                              className="bg-blue-100 text-blue-700 hover:bg-blue-200 px-2 py-1 rounded text-xs font-medium"
                              title="Manually verify email"
                            >
                              Verify
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {userData.last_login ? (
                          <span className="text-green-600">Active</span>
                        ) : (
                          <span className="text-gray-500">Never logged in</span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">
                        {userData.last_login && 
                          `Last: ${new Date(userData.last_login).toLocaleDateString()}`
                        }
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {userData.game_count} games
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(userData.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      {userData.id !== user?.id && (
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => toggleAdminStatus(userData.id, !userData.is_admin)}
                            className={`px-3 py-1 rounded text-xs font-medium ${
                              userData.is_admin
                                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                            }`}
                          >
                            {userData.is_admin ? 'Remove Admin' : 'Make Admin'}
                          </button>
                          <button
                            onClick={() => {
                              setResetPasswordData({
                                userId: userData.id,
                                userName: `${userData.first_name || 'Unknown'} ${userData.last_name || 'User'}`,
                                userEmail: userData.email
                              });
                              setShowResetPasswordModal(true);
                            }}
                            disabled={sendingPasswordReset === userData.id}
                            className="bg-yellow-100 text-yellow-700 hover:bg-yellow-200 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1 rounded text-xs font-medium"
                          >
                            {sendingPasswordReset === userData.id ? 'Sending...' : 'Reset Password'}
                          </button>
                          <button
                            onClick={() => {
                              setDeleteUserData({
                                userId: userData.id,
                                userName: `${userData.first_name || 'Unknown'} ${userData.last_name || 'User'}`,
                                userEmail: userData.email
                              });
                              setShowDeleteUserModal(true);
                            }}
                            className="bg-red-100 text-red-700 hover:bg-red-200 px-3 py-1 rounded text-xs font-medium"
                          >
                            Delete User
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pending Invitations */}
        <div className="bg-white rounded-lg shadow-md mt-8">
          <div className="p-6 border-b">
            <h2 className="text-2xl font-bold text-gray-800">Pending Invitations</h2>
            <p className="text-gray-600">Total: {invitations.length} pending invitations</p>
          </div>
          
          {invitations.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Game
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Invited By
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sent
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Expires
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {invitations.map((invitation) => (
                    <tr key={invitation.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{invitation.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{invitation.game_name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{invitation.invited_by_name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(invitation.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(invitation.expires_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => openConfirmInviteModal(invitation.id, invitation.email)}
                            className="bg-green-100 text-green-700 hover:bg-green-200 px-3 py-1 rounded text-xs font-medium"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Cancel invitation for ${invitation.email}?`)) {
                                cancelInvitation(invitation.id);
                              }
                            }}
                            className="bg-red-100 text-red-700 hover:bg-red-200 px-3 py-1 rounded text-xs font-medium"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 text-center">
              <div className="text-gray-500 mb-4">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2M4 13h2m13-8l-4 4m0 0l-4-4m4 4V3" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Pending Invitations</h3>
              <p className="text-gray-500 mb-4">There are currently no pending user invitations.</p>
              <div className="flex space-x-3 justify-center">
                <button
                  onClick={() => setShowInviteForm(true)}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Invite a User
                </button>
                <button
                  onClick={() => setShowAdminInviteForm(true)}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Invite an Admin
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Invite User Modal */}
        {showInviteForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">Invite User to Game</h3>
              <form onSubmit={handleInviteUser} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={inviteFormData.email}
                    onChange={(e) => setInviteFormData({...inviteFormData, email: e.target.value})}
                    placeholder="Enter user's email address"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Assign to Game
                  </label>
                  <select
                    value={inviteFormData.gameId}
                    onChange={(e) => setInviteFormData({...inviteFormData, gameId: e.target.value})}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a game...</option>
                    {games.filter(game => game.is_active).map(game => (
                      <option key={game.id} value={game.id}>
                        {game.name || game.game_name} ({game.participant_count} players)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowInviteForm(false);
                      setInviteFormData({ email: '', gameId: '' });
                      setError('');
                    }}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={inviting}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {inviting ? 'Sending...' : 'Send Invitation'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Invite Admin Modal */}
        {showAdminInviteForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">Invite Admin User</h3>
              <form onSubmit={handleInviteAdmin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={adminInviteEmail}
                    onChange={(e) => setAdminInviteEmail(e.target.value)}
                    placeholder="Enter admin user's email address"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-yellow-800">
                        Admin Invitation
                      </h3>
                      <div className="mt-2 text-sm text-yellow-700">
                        <p>This will invite the user to become an administrator with full access to manage users, games, and system settings.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAdminInviteForm(false);
                      setAdminInviteEmail('');
                      setError('');
                    }}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={invitingAdmin}
                    className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {invitingAdmin ? 'Sending...' : 'Send Admin Invitation'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Confirm Invitation Modal */}
        {showConfirmInviteModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">Confirm Invitation</h3>
              <p className="text-gray-600 mb-4">
                Create account for <strong>{confirmInviteData.email}</strong>
              </p>
              
              <form onSubmit={confirmInvitation} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    First Name
                  </label>
                  <input
                    type="text"
                    value={confirmInviteData.firstName}
                    onChange={(e) => setConfirmInviteData({...confirmInviteData, firstName: e.target.value})}
                    placeholder="Enter first name"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={confirmInviteData.lastName}
                    onChange={(e) => setConfirmInviteData({...confirmInviteData, lastName: e.target.value})}
                    placeholder="Enter last name"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Temporary Password
                  </label>
                  <input
                    type="text"
                    value={confirmInviteData.tempPassword}
                    onChange={(e) => setConfirmInviteData({...confirmInviteData, tempPassword: e.target.value})}
                    placeholder="Enter temporary password"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    This password will be shown to you after account creation.
                  </p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-blue-800">
                        Account Creation
                      </h3>
                      <div className="mt-2 text-sm text-blue-700">
                        <p>This will create a user account with the provided details and the user will be added to the invited game.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowConfirmInviteModal(false);
                      setConfirmInviteData({
                        invitationId: '',
                        email: '',
                        firstName: '',
                        lastName: '',
                        tempPassword: ''
                      });
                      setError('');
                    }}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={confirmingInvitation}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {confirmingInvitation ? 'Creating Account...' : 'Create Account'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Reset Password Confirmation Modal */}
        {showResetPasswordModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">Send Password Reset Email</h3>
              <p className="text-gray-600 mb-4">
                Send password reset email to <strong>{resetPasswordData.userName}</strong> ({resetPasswordData.userEmail})?
              </p>
              <p className="text-sm text-gray-500 mb-6">
                This will send them an email with a link to reset their password.
              </p>
              
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowResetPasswordModal(false);
                    setResetPasswordData({ userId: '', userName: '', userEmail: '' });
                  }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sendPasswordReset(resetPasswordData.userId, resetPasswordData.userName, resetPasswordData.userEmail);
                    setShowResetPasswordModal(false);
                    setResetPasswordData({ userId: '', userName: '', userEmail: '' });
                  }}
                  className="bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 transition-colors"
                >
                  Send Reset Email
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete User Confirmation Modal */}
        {showDeleteUserModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4 text-red-700">Delete User Account</h3>
              <p className="text-gray-600 mb-4">
                Are you sure you want to delete user <strong>{deleteUserData.userName}</strong> ({deleteUserData.userEmail})?
              </p>
              
              <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">
                      This action cannot be undone
                    </h3>
                    <div className="mt-2 text-sm text-red-700">
                      <p>This will permanently delete:</p>
                      <ul className="list-disc list-inside mt-1">
                        <li>All their picks and game data</li>
                        <li>Their game participations</li>
                        <li>Any games they commissioned will be transferred to you</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteUserModal(false);
                    setDeleteUserData({ userId: '', userName: '', userEmail: '' });
                  }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    deleteUser(deleteUserData.userId, deleteUserData.userName, deleteUserData.userEmail);
                    setShowDeleteUserModal(false);
                    setDeleteUserData({ userId: '', userName: '', userEmail: '' });
                  }}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
                >
                  Delete User
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default UsersManager;