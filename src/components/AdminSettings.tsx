import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $user, $isAuthenticated, $isLoading, initAuth } from '../stores/auth';
import { HomeIcon, CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
// import DatabaseSwitcher from './DatabaseSwitcher';

interface Setting {
  key: string;
  value: string;
  encrypted: boolean;
  description: string;
}

const AdminSettings: React.FC = () => {
  const user = useStore($user);
  const isAuthenticated = useStore($isAuthenticated);
  const isLoading = useStore($isLoading);
  
  const [smtpSettings, setSmtpSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Default SMTP settings structure
  const defaultSmtpSettings: Setting[] = [
    { key: 'host', value: '', encrypted: false, description: 'SMTP server hostname (e.g., smtp.gmail.com)' },
    { key: 'port', value: '587', encrypted: false, description: 'SMTP server port (typically 587 for TLS)' },
    { key: 'user', value: '', encrypted: false, description: 'SMTP username/email address' },
    { key: 'pass', value: '', encrypted: true, description: 'SMTP password or app password' },
    { key: 'from', value: '', encrypted: false, description: 'From email address for outgoing emails' },
  ];

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
      loadSettings();
    } else if (!isLoading && !isAuthenticated) {
      window.location.href = '/';
    }
  }, [isAuthenticated, user, isLoading]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      
      const response = await fetch('/api/admin/settings/smtp', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        
        // Merge with default settings to ensure all fields are present
        const mergedSettings = defaultSmtpSettings.map(defaultSetting => {
          const existingSetting = data.settings.find((s: Setting) => s.key === defaultSetting.key);
          return existingSetting || defaultSetting;
        });
        
        setSmtpSettings(mergedSettings);
      } else {
        // If no settings exist, use defaults
        setSmtpSettings(defaultSmtpSettings);
      }
    } catch (err) {
      setError('Failed to load settings');
      setSmtpSettings(defaultSmtpSettings);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch('/api/admin/settings/smtp', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ settings: smtpSettings })
      });

      if (response.ok) {
        setSuccess('SMTP settings saved successfully!');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to save settings');
      }
    } catch (err) {
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const testSmtpConnection = async () => {
    try {
      setTesting(true);
      setTestResult(null);
      setError('');
      
      const settingsObj = smtpSettings.reduce((acc, setting) => {
        acc[setting.key] = setting.value;
        return acc;
      }, {} as Record<string, string>);

      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const response = await fetch('/api/admin/settings/smtp/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(settingsObj)
      });

      const data = await response.json();
      setTestResult(data);
      
      if (!data.success) {
        setError(data.error || 'SMTP test failed');
      }
    } catch (err) {
      setError('Failed to test SMTP connection');
      setTestResult({ success: false, message: 'Connection test failed' });
    } finally {
      setTesting(false);
    }
  };

  const updateSetting = (key: string, value: string) => {
    setSmtpSettings(prev => prev.map(setting => 
      setting.key === key ? { ...setting, value } : setting
    ));
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
      <header className="bg-indigo-600 text-white shadow-lg">
        <div className="container mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <div>
              <nav className="text-sm opacity-90 mb-2">
                <a href="/admin" className="hover:underline">Admin</a> / Settings
              </nav>
              <h1 className="text-3xl font-bold">System Settings</h1>
              <p className="text-lg opacity-90">Configure application settings</p>
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

        {success && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-6">
            {success}
          </div>
        )}

        {/* SMTP Settings */}
        <div className="bg-white rounded-lg shadow-md">
          <div className="p-6 border-b">
            <h2 className="text-2xl font-bold text-gray-800">SMTP Email Settings</h2>
            <p className="text-gray-600 mt-1">Configure email server settings for sending invitations and notifications</p>
          </div>

          <div className="p-6">
            <div className="space-y-6">
              {smtpSettings.map((setting) => (
                <div key={setting.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {setting.key.toUpperCase()}
                  </label>
                  <input
                    type={setting.key === 'pass' ? 'password' : setting.key === 'port' ? 'number' : 'text'}
                    value={setting.value}
                    onChange={(e) => updateSetting(setting.key, e.target.value)}
                    placeholder={setting.description}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-sm text-gray-500 mt-1">{setting.description}</p>
                </div>
              ))}

              {/* Test Result */}
              {testResult && (
                <div className={`p-4 rounded-md flex items-center space-x-2 ${
                  testResult.success 
                    ? 'bg-green-100 border border-green-300 text-green-800' 
                    : 'bg-red-100 border border-red-300 text-red-800'
                }`}>
                  {testResult.success ? (
                    <CheckCircleIcon className="h-5 w-5 text-green-600" />
                  ) : (
                    <ExclamationCircleIcon className="h-5 w-5 text-red-600" />
                  )}
                  <span>{testResult.message}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex space-x-4 pt-4">
                <button
                  onClick={saveSettings}
                  disabled={saving}
                  className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
                
                <button
                  onClick={testSmtpConnection}
                  disabled={testing || !smtpSettings.every(s => s.value.trim())}
                  className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {testing ? 'Testing...' : 'Test Connection'}
                </button>
              </div>

              <div className="text-sm text-gray-600 bg-gray-50 p-4 rounded-lg">
                <p className="font-medium mb-2">💡 Tips:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>For Gmail, use smtp.gmail.com with port 587 and an app password</li>
                  <li>For Outlook/Hotmail, use smtp-mail.outlook.com with port 587</li>
                  <li>Make sure to enable "Less secure app access" or use app-specific passwords</li>
                  <li>Test your connection before saving to ensure emails can be sent</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Database Switcher - Disabled due to flickering issues */}
        {/* <div className="mt-8">
          <DatabaseSwitcher />
        </div> */}
      </main>
    </div>
  );
};

export default AdminSettings;