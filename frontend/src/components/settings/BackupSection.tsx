import React, { useState } from 'react';
import { Download, Upload, Database, AlertCircle } from 'lucide-react';
import { backUpAPI } from '../../services/api';

interface BackupSectionProps {
  userId: string;
}

export const BackupSection: React.FC<BackupSectionProps> = ({ userId }) => {
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [backupSuccess, setBackupSuccess] = useState('');
  const [restoreSuccess, setRestoreSuccess] = useState('');
  const [backupError, setBackupError] = useState('');
  const [restoreError, setRestoreError] = useState('');

  const handleDownloadBackup = async () => {
    setBackupLoading(true);
    setBackupError('');
    setBackupSuccess('');

    try {
      // Используем backUpAPI для загрузки бэкапа
      const response = await backUpAPI.downloadBackup();
      
      // Создаем ссылку для скачивания файла
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().split('T')[0];
      link.setAttribute('download', `backup_${userId}_${timestamp}.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      setBackupSuccess('Backup downloaded successfully!');
    } catch (error: any) {
      console.error('Backup error:', error);
      setBackupError(error.response?.data?.message || 'Failed to download backup. Please try again.');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleUploadBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setRestoreLoading(true);
    setRestoreError('');
    setRestoreSuccess('');

    const formData = new FormData();
    formData.append('backup_file', file);

    try {
      // Используем backUpAPI для восстановления бэкапа
      const response = await backUpAPI.restoreBackup(formData);
      
      setRestoreSuccess(response.data.message || `Backup restored successfully! ${response.data.restored_files} files restored.`);
    } catch (error: any) {
      console.error('Restore error:', error);
      setRestoreError(error.response?.data?.message || 'Failed to restore backup. Please try again.');
    } finally {
      setRestoreLoading(false);
      event.target.value = ''; // Сбросить input
    }
  };

  return (
    <div className="bg-slate-900 rounded-xl p-6">
      <div className="flex items-center space-x-3 mb-6">
        <Database className="w-6 h-6 text-purple-400" />
        <h2 className="text-xl font-semibold text-white">Data Backup & Restore</h2>
      </div>

      <div className="space-y-6">
        {/* Download Backup */}
        <div className="border border-slate-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-white font-medium flex items-center">
                <Download className="w-4 h-4 mr-2" />
                Download Backup
              </h3>
              <p className="text-slate-400 text-sm mt-1">
                Create a complete backup of all your files and metadata
              </p>
            </div>
            <button
              onClick={handleDownloadBackup}
              disabled={backupLoading}
              className="flex items-center space-x-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium py-2 px-4 rounded-lg transition-all duration-300 disabled:opacity-50 text-sm"
            >
              {backupLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Download</span>
                </>
              )}
            </button>
          </div>

          {backupSuccess && (
            <div className="bg-green-500/20 border border-green-500/50 text-green-200 px-3 py-2 rounded text-sm mt-2">
              {backupSuccess}
            </div>
          )}

          {backupError && (
            <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-3 py-2 rounded text-sm mt-2 flex items-center">
              <AlertCircle className="w-4 h-4 mr-2" />
              {backupError}
            </div>
          )}
        </div>

        {/* Upload Backup */}
        <div className="border border-slate-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-white font-medium flex items-center">
                <Upload className="w-4 h-4 mr-2" />
                Restore from Backup
              </h3>
              <p className="text-slate-400 text-sm mt-1">
                Upload and restore your data from a backup file
              </p>
            </div>
            <label className="flex items-center space-x-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-medium py-2 px-4 rounded-lg transition-all duration-300 text-sm cursor-pointer">
              <Upload className="w-4 h-4" />
              <span>Select File</span>
              <input
                type="file"
                accept=".zip"
                onChange={handleUploadBackup}
                disabled={restoreLoading}
                className="hidden"
              />
            </label>
          </div>

          <div className="text-slate-400 text-xs mt-2">
            <p>• Only .zip backup files are supported</p>
            <p>• Existing files with same IDs will be skipped</p>
            <p>• This process may take several minutes for large backups</p>
          </div>

          {restoreSuccess && (
            <div className="bg-green-500/20 border border-green-500/50 text-green-200 px-3 py-2 rounded text-sm mt-3">
              {restoreSuccess}
            </div>
          )}

          {restoreError && (
            <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-3 py-2 rounded text-sm mt-3 flex items-center">
              <AlertCircle className="w-4 h-4 mr-2" />
              {restoreError}
            </div>
          )}
        </div>

        {/* Backup Info */}
        <div className="bg-slate-800/50 rounded-lg p-4 text-sm">
          <h4 className="text-white font-medium mb-2">Backup Information</h4>
          <ul className="text-slate-300 space-y-1">
            <li>• Backup includes all files, metadata, tags, and categories</li>
            <li>• Files are stored with their original names and paths</li>
            <li>• Duplicate files are automatically detected and skipped</li>
            <li>• Backup files are encrypted for security</li>
            <li>• Recommended to backup regularly for data safety</li>
          </ul>
        </div>
      </div>
    </div>
  );
};