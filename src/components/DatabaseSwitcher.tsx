import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $user, $isAuthenticated, $isLoading, initAuth } from '../stores/auth';
import {
  CircleStackIcon as DatabaseIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon
} from '@heroicons/react/24/outline';

interface DatabaseInfo {
  currentMode: 'production' | 'test';
  lastSwitched: string;
  databases: {
    production: {
      exists: boolean;
      size: number;
      modified: string | null;
      path: string;
    };
    test: {
      exists: boolean;
      size: number;
      modified: string | null;
      path: string;
    };
  };
}

const DatabaseSwitcher: React.FC = () => {
  const user = useStore($user);
  const isAuthenticated = useStore($isAuthenticated);
  const isLoading = useStore($isLoading);
  
  const [dbInfo, setDbInfo] = useState<DatabaseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [switching, setSwitching] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [populating, setPopulating] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      initAuth();
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && user?.isAdmin) {
      loadDatabaseInfo();
    }
  }, [isAuthenticated, user]);

  const loadDatabaseInfo = async () => {
    try {
      setLoading(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch('/api/admin/database/status', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setDbInfo(data.data);
      } else {
        setError('Failed to load database information');
      }
    } catch (err) {
      setError('Failed to load database information');
    } finally {
      setLoading(false);
    }
  };

  const switchDatabase = async (mode: 'production' | 'test') => {
    if (!dbInfo || mode === dbInfo.currentMode) return;

    setSwitching(true);
    setError('');
    setSuccess('');

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch('/api/admin/database/switch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ mode })
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(`Successfully switched to ${mode} database`);
        await loadDatabaseInfo();
        // Reload the page to ensure all components use the new database
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setError(data.error || 'Failed to switch database');
      }
    } catch (err) {
      setError('Failed to switch database');
    } finally {
      setSwitching(false);
    }
  };

  const resetTestDatabase = async () => {
    if (!confirm('Are you sure you want to reset the test database? This will overwrite all test data with production data.')) {
      return;
    }

    setResetting(true);
    setError('');
    setSuccess('');

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch('/api/admin/database/reset-test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('Test database reset successfully');
        await loadDatabaseInfo();
      } else {
        setError(data.error || 'Failed to reset test database');
      }
    } catch (err) {
      setError('Failed to reset test database');
    } finally {
      setResetting(false);
    }
  };

  const populateTestData = async () => {
    if (dbInfo?.currentMode !== 'test') {
      setError('Can only populate test data when in test mode');
      return;
    }

    if (!confirm('Are you sure you want to populate the test database with sample data? This may take a few moments.')) {
      return;
    }

    setPopulating(true);
    setError('');
    setSuccess('');

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch('/api/admin/database/populate-test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('Test data populated successfully');
        await loadDatabaseInfo();
      } else {
        setError(data.error || 'Failed to populate test data');
      }
    } catch (err) {
      setError('Failed to populate test data');
    } finally {
      setPopulating(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  if (!isAuthenticated || !user?.isAdmin) {
    return null;
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md">
      <div className="p-6 border-b">
        <div className="flex items-center space-x-2">
          <DatabaseIcon className="h-6 w-6 text-blue-600" />
          <h2 className="text-2xl font-bold text-gray-800">Database Switcher</h2>
        </div>
        <p className="text-gray-600 mt-1">Switch between production and test databases</p>
      </div>

      <div className="p-6">
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6 flex items-center space-x-2">
            <ExclamationTriangleIcon className="h-5 w-5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-6 flex items-center space-x-2">
            <CheckCircleIcon className="h-5 w-5" />
            <span>{success}</span>
          </div>
        )}

        {dbInfo && (
          <>
            {/* Current Status */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Current Status</h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-gray-600">Active Database:</span>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${
                        dbInfo.currentMode === 'production' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {dbInfo.currentMode.charAt(0).toUpperCase() + dbInfo.currentMode.slice(1)}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm text-gray-600">Last Switched:</span>
                    <div className="text-sm text-gray-800 mt-1">
                      {formatDate(dbInfo.lastSwitched)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Database Information */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Database Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Production Database */}
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-800">Production Database</h4>
                    {dbInfo.currentMode === 'production' && (
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Active</span>
                    )}
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Status:</span>
                      <span className={dbInfo.databases.production.exists ? 'text-green-600' : 'text-red-600'}>
                        {dbInfo.databases.production.exists ? 'Exists' : 'Missing'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Size:</span>
                      <span>{formatFileSize(dbInfo.databases.production.size)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Modified:</span>
                      <span>{formatDate(dbInfo.databases.production.modified)}</span>
                    </div>
                  </div>
                </div>

                {/* Test Database */}
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-800">Test Database</h4>
                    {dbInfo.currentMode === 'test' && (
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Active</span>
                    )}
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Status:</span>
                      <span className={dbInfo.databases.test.exists ? 'text-green-600' : 'text-red-600'}>
                        {dbInfo.databases.test.exists ? 'Exists' : 'Missing'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Size:</span>
                      <span>{formatFileSize(dbInfo.databases.test.size)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Modified:</span>
                      <span>{formatDate(dbInfo.databases.test.modified)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-800">Actions</h3>
              
              {/* Switch Database */}
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => switchDatabase('production')}
                  disabled={switching || dbInfo.currentMode === 'production'}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                >
                  {switching ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <DatabaseIcon className="h-4 w-4" />}
                  <span>Switch to Production</span>
                </button>

                <button
                  onClick={() => switchDatabase('test')}
                  disabled={switching || dbInfo.currentMode === 'test'}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                >
                  {switching ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <DatabaseIcon className="h-4 w-4" />}
                  <span>Switch to Test</span>
                </button>
              </div>

              {/* Test Database Actions */}
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={resetTestDatabase}
                  disabled={resetting}
                  className="bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                >
                  {resetting ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <ArrowPathIcon className="h-4 w-4" />}
                  <span>Reset Test Database</span>
                </button>

                <button
                  onClick={populateTestData}
                  disabled={populating || dbInfo.currentMode !== 'test'}
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                >
                  {populating ? <ClockIcon className="h-4 w-4 animate-spin" /> : <ClockIcon className="h-4 w-4" />}
                  <span>Populate Test Data</span>
                </button>
              </div>

              {/* Warning */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start space-x-2">
                  <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div className="text-sm text-yellow-800">
                    <p className="font-medium mb-1">Important Notes:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Switching databases will reload the application</li>
                      <li>Test data population only works when in test mode</li>
                      <li>Resetting test database will overwrite all test data</li>
                      <li>Always backup important data before switching</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DatabaseSwitcher;