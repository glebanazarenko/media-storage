import React, { useState, useEffect, useRef } from 'react';
import { Download, Upload, Database, AlertCircle, Shield, RefreshCw } from 'lucide-react';
import { backUpAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';

interface BackupSectionProps {
  userId: string;
}

// Типы для статуса задачи
interface BackupStatusResponse {
  task_id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  s3_key?: string;
  download_url?: string;
  error?: string;
  message?: string;
}

// Тип для бэкапа из S3
interface BackupFile {
  s3_key: string;
  filename: string;
  size: number;
  last_modified: string;
}

export const BackupSection: React.FC<BackupSectionProps> = ({ userId }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [backupLoading, setBackupLoading] = useState(false);
  const [fullBackupLoading, setFullBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [backupSuccess, setBackupSuccess] = useState('');
  const [restoreSuccess, setRestoreSuccess] = useState('');
  const [backupError, setBackupError] = useState('');
  const [restoreError, setRestoreError] = useState('');

  // Состояния для опроса статуса
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [currentTaskType, setCurrentTaskType] = useState<'user' | 'full' | 'restore' | null>(null);
  const [pollingStatus, setPollingStatus] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Новые состояния для списка бэкапов
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null); // s3_key выбранного бэкапа

  // Очистка интервала при размонтировании компонента или изменении task_id
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // --- НОВЫЙ МЕТОД: Загрузка списка бэкапов ---
  const handleLoadBackups = async () => {
    setLoadingBackups(true);
    setBackupError('');
    try {
      const response = await backUpAPI.listBackups();
      setBackups(response.data);
      setSelectedBackup(null); // Сбросить выбор
    } catch (error: any) {
      console.error('Load backups error:', error);
      setBackupError(t('backup.loadBackupsError'));
    } finally {
      setLoadingBackups(false);
    }
  };

  // --- НОВЫЙ МЕТОД: Восстановление по s3_key ---
  const handleRestoreSelectedBackup = async () => {
    if (!selectedBackup || restoreLoading) return;

    setRestoreLoading(true);
    setRestoreError('');
    setRestoreSuccess('');

    try {
      const response = await backUpAPI.restoreBackupByS3Key({ s3_key: selectedBackup });
      const taskId = response.data.task_id;

      // Начинаем опрос статуса задачи
      startRestorePolling(taskId);
    } catch (error: any) {
      console.error('Restore error:', error);
      setRestoreError(t('backup.restoreError'));
      setRestoreLoading(false);
    }
  };

  // --- Остальные методы без изменений (startPolling, handleDownloadBackup, handleDownloadFullBackup) ---

  const startPolling = (taskId: string, taskType: 'user' | 'full') => {
    // (код остается тем же, но может быть немного изменен, чтобы не использовать window.location.assign)
    setCurrentTaskId(taskId);
    setCurrentTaskType(taskType);
    setPollingStatus(true);
    setBackupError(''); // Сброс ошибки перед опросом
    setBackupSuccess(''); // Сброс успеха перед опросом

    // Очищаем предыдущий интервал, если он был
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const response = await backUpAPI.getBackupStatus(taskId);
        const data: BackupStatusResponse = response.data;

        if (data.status === 'completed') {
          // Завершаем опрос
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setPollingStatus(false);
          setCurrentTaskId(null);
          setCurrentTaskType(null);

          // --- ИЗМЕНЕНО: Выполняем скачивание ---
          const downloadUrl = backUpAPI.downloadBackupByTaskId(taskId);
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = ''; // или конкретное имя файла, если известно
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          setBackupSuccess(t('backup.success'));
        } else if (data.status === 'failed') {
          // Завершаем опрос
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setPollingStatus(false);
          setCurrentTaskId(null);
          setCurrentTaskType(null);

          console.error('Backup task failed:', data.error);
          setBackupError(t('backup.restoreError') + (data.error ? ` (${data.error})` : ''));
        }
        // 'pending' или 'in_progress' - продолжаем опрос
      } catch (error: any) {
        console.error('Error polling backup status:', error);
        // Завершаем опрос при ошибке получения статуса
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        setPollingStatus(false);
        setCurrentTaskId(null);
        setCurrentTaskType(null);

        setBackupError(t('backup.restoreError'));
      }
    }, 5000); // Опрашивать каждые 5 секунд
  };

  const handleDownloadBackup = async () => {
    if (backupLoading || pollingStatus) return;

    setBackupLoading(true);
    setBackupError('');
    setBackupSuccess('');

    try {
      const response = await backUpAPI.initiateBackup();
      const taskId = response.data.task_id;

      setBackupLoading(false);
      startPolling(taskId, 'user');
    } catch (error: any) {
      console.error('Initiate backup error:', error);
      setBackupLoading(false);
      setBackupError(t('backup.restoreError'));
    }
  };

  const handleDownloadFullBackup = async () => {
    if (fullBackupLoading || pollingStatus) return;

    setFullBackupLoading(true);
    setBackupError('');
    setBackupSuccess('');

    try {
      const response = await backUpAPI.initiateFullBackup();
      const taskId = response.data.task_id;

      setFullBackupLoading(false);
      startPolling(taskId, 'full');
    } catch (error: any) {
      console.error('Initiate full backup error:', error);
      setFullBackupLoading(false);
      setBackupError(t('backup.restoreError'));
    }
  };

  // --- Изменённая функция опроса для восстановления ---
  const startRestorePolling = (taskId: string) => {
    setCurrentTaskId(taskId);
    setCurrentTaskType('restore');
    setPollingStatus(true);
    setRestoreError('');
    setRestoreSuccess('');

    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const response = await backUpAPI.getBackupStatus(taskId);
        const data: BackupStatusResponse = response.data;

        if (data.status === 'completed') {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setPollingStatus(false);
          setCurrentTaskId(null);
          setCurrentTaskType(null);
          setRestoreLoading(false);
          setRestoreSuccess(t('backup.restoreSuccessMessage', { restored_files: data.message?.restored_files || 'unknown' }));
        } else if (data.status === 'failed') {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setPollingStatus(false);
          setCurrentTaskId(null);
          setCurrentTaskType(null);
          setRestoreLoading(false);
          setRestoreError(t('backup.restoreError') + (data.error ? ` (${data.error})` : ''));
        }
      } catch (error: any) {
        console.error('Error polling restore status:', error);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        setPollingStatus(false);
        setCurrentTaskId(null);
        setCurrentTaskType(null);
        setRestoreLoading(false);
        setRestoreError(t('backup.restoreError'));
      }
    }, 5000);
  };

  // --- Остальные методы без изменений ---
  const handleCancelPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setPollingStatus(false);
    setCurrentTaskId(null);
    setCurrentTaskType(null);
    setBackupError(t('backup.pollingCancelled'));
  };

  return (
    <div className="bg-slate-900 rounded-xl p-6">
      <div className="flex items-center space-x-3 mb-6">
        <Database className="w-6 h-6 text-purple-400" />
        <h2 className="text-xl font-semibold text-white">{t('backup.title')}</h2>
      </div>

      <div className="space-y-6">
        {/* Download User Backup */}
        <div className="border border-slate-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-white font-medium flex items-center">
                <Download className="w-4 h-4 mr-2" />
                {t('backup.download')}
              </h3>
              <p className="text-slate-400 text-sm mt-1">
                {t('backup.downloadDescription')}
              </p>
            </div>
            <button
              onClick={handleDownloadBackup}
              disabled={backupLoading || pollingStatus}
              className="flex items-center space-x-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium py-2 px-4 rounded-lg transition-all duration-300 disabled:opacity-50 text-sm"
            >
              {backupLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>{t('common.loading')}</span>
                </>
              ) : pollingStatus && currentTaskType === 'user' ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>{t('backup.generating')}</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>{t('backup.downloadButton')}</span>
                </>
              )}
            </button>
          </div>

          {pollingStatus && currentTaskType === 'user' && (
            <div className="bg-blue-500/20 border border-blue-500/50 text-blue-200 px-3 py-2 rounded text-sm mt-2">
              {t('backup.generatingMessage')}
              <button
                onClick={handleCancelPolling}
                className="ml-2 text-xs text-blue-300 hover:text-white underline"
              >
                {t('common.cancel')}
              </button>
            </div>
          )}

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

        {/* Download Full Backup (Admin Only) */}
        {user?.is_admin && (
          <div className="border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-white font-medium flex items-center">
                  <Shield className="w-4 h-4 mr-2 text-yellow-400" />
                  {t('backup.downloadFull')}
                </h3>
                <p className="text-slate-400 text-sm mt-1">
                  {t('backup.downloadFullDescription')}
                </p>
              </div>
              <button
                onClick={handleDownloadFullBackup}
                disabled={fullBackupLoading || pollingStatus}
                className="flex items-center space-x-2 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white font-medium py-2 px-4 rounded-lg transition-all duration-300 disabled:opacity-50 text-sm"
              >
                {fullBackupLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>{t('common.loading')}</span>
                  </>
                ) : pollingStatus && currentTaskType === 'full' ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>{t('backup.generating')}</span>
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4" />
                    <span>{t('backup.fullBackupButton')}</span>
                  </>
                )}
              </button>
            </div>

            <div className="text-slate-400 text-xs mt-2">
              <p className="text-yellow-400 font-medium">⚠️ {t('backup.adminRequired')}</p>
              <p>• {t('backup.downloadFullDescription')}</p>
              <p>• {t('backup.largeFile')}</p>
              <p>• {t('backup.sensitiveData')}</p>
            </div>

            {pollingStatus && currentTaskType === 'full' && (
              <div className="bg-blue-500/20 border border-blue-500/50 text-blue-200 px-3 py-2 rounded text-sm mt-2">
                {t('backup.generatingMessage')}
                <button
                  onClick={handleCancelPolling}
                  className="ml-2 text-xs text-blue-300 hover:text-white underline"
                >
                  {t('common.cancel')}
                </button>
              </div>
            )}

            {backupSuccess && (
              <div className="bg-green-500/20 border border-green-500/50 text-green-200 px-3 py-2 rounded text-sm mt-2">
                {backupSuccess}
              </div>
            )}

            {backupError && (
              <div className="bg-red-500/20 border border-red-500/50 text-green-200 px-3 py-2 rounded text-sm mt-2 flex items-center">
                <AlertCircle className="w-4 h-4 mr-2" />
                {backupError}
              </div>
            )}
          </div>
        )}

        {/* NEW: Restore from S3 Backup */}
        <div className="border border-slate-700 rounded-lg p-4">
          <div className="mb-3">
            <h3 className="text-white font-medium flex items-center">
              <Upload className="w-4 h-4 mr-2" />
              {t('backup.restoreFromS3')}
            </h3>
            <p className="text-slate-400 text-sm mt-1">
              {t('backup.restoreFromS3Description')}
            </p>
          </div>

          <div className="flex flex-wrap gap-3 mb-3">
            <button
              onClick={handleLoadBackups}
              disabled={loadingBackups}
              className="flex items-center space-x-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-medium py-2 px-4 rounded-lg transition-all duration-300 text-sm disabled:opacity-50"
            >
              {loadingBackups ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>{t('backup.loadingBackups')}</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>{t('backup.loadBackups')}</span>
                </>
              )}
            </button>

            <button
              onClick={handleRestoreSelectedBackup}
              disabled={!selectedBackup || restoreLoading}
              className="flex items-center space-x-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-medium py-2 px-4 rounded-lg transition-all duration-300 text-sm disabled:opacity-50"
            >
              {restoreLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>{t('common.loading')}</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>{t('backup.restoreSelected')}</span>
                </>
              )}
            </button>
          </div>

          {backupError && (
            <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-3 py-2 rounded text-sm mt-2 flex items-center">
              <AlertCircle className="w-4 h-4 mr-2" />
              {backupError}
            </div>
          )}

{backups.length > 0 && (
            <div className="mt-3">
              <label className="block text-slate-300 text-sm mb-2">{t('backup.selectBackup')}:</label>
              <div className="max-h-60 overflow-y-auto border border-slate-600 rounded-lg bg-slate-800 p-2">
                {backups.map((backup) => (
                  <div
                    key={backup.s3_key}
                    className={`p-2 rounded cursor-pointer mb-1 ${
                      selectedBackup === backup.s3_key
                        ? 'bg-blue-500/50 border border-blue-500'
                        : 'hover:bg-slate-700'
                    }`}
                    onClick={() => setSelectedBackup(backup.s3_key)}
                  >
                    <div className="flex justify-between items-center"> {/* Изменено: добавлен items-center */}
                      <div className="flex-1"> {/* Обернем текст в div для лучшего контроля ширины */}
                        <div className="flex justify-between">
                          <span className="text-white">{backup.filename}</span>
                          <span className="text-slate-400 text-xs">
                            {(backup.size / (1024 * 1024)).toFixed(2)} MB
                          </span>
                        </div>
                        <div className="text-slate-500 text-xs">
                          {new Date(backup.last_modified).toLocaleString()}
                        </div>
                      </div>
                      {/* --- НОВАЯ КНОПКА СКАЧИВАНИЯ --- */}
                      {user?.is_admin && ( // Показываем только админу
                        <button
                          onClick={(e) => {
                            e.stopPropagation(); // Останавливаем всплытие, чтобы не сработал onClick div
                            const downloadUrl = backUpAPI.downloadBackupByS3Key(backup.s3_key);
                            const link = document.createElement('a');
                            link.href = downloadUrl;
                            link.target = '_blank'; // Открываем в новой вкладке/окне
                            link.rel = 'noopener noreferrer';
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                          }}
                          className="ml-2 p-1 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium rounded text-xs"
                          title={t('backup.download')} // Добавим подсказку
                        >
                          <Download className="w-3 h-3" /> {/* Иконка для кнопки */}
                        </button>
                      )}
                      {/* --- /НОВАЯ КНОПКА --- */}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pollingStatus && currentTaskType === 'restore' && (
            <div className="bg-blue-500/20 border border-blue-500/50 text-blue-200 px-3 py-2 rounded text-sm mt-2">
              {t('backup.restoringMessage')}
              <button
                onClick={handleCancelPolling}
                className="ml-2 text-xs text-blue-300 hover:text-white underline"
              >
                {t('common.cancel')}
              </button>
            </div>
          )}

          {restoreSuccess && (
            <div className="bg-green-500/20 border border-green-500/50 text-green-200 px-3 py-2 rounded text-sm mt-3">
              {restoreSuccess}
            </div>
          )}

          {restoreError && (
            <div className="bg-red-500/20 border border-red-500/50 text-green-200 px-3 py-2 rounded text-sm mt-3 flex items-center">
              <AlertCircle className="w-4 h-4 mr-2" />
              {restoreError}
            </div>
          )}
        </div>

        {/* Backup Info */}
        <div className="bg-slate-800/50 rounded-lg p-4 text-sm">
          <h4 className="text-white font-medium mb-2">{t('backup.info')}</h4>
          <ul className="text-slate-300 space-y-1">
            <li>• {t('backup.info1')}</li>
            <li>• {t('backup.info2')}</li>
            <li>• {t('backup.info3')}</li>
            <li>• {t('backup.info4')}</li>
            <li>• {t('backup.info5')}</li>
            {user?.is_admin && (
              <li className="text-yellow-400">• {t('backup.fullInfo')}</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
};