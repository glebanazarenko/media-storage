import React, { useState, useEffect, useRef } from 'react';
import { Download, Upload, Database, AlertCircle, Shield } from 'lucide-react';
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
  s3_key?: string; // Присутствует при завершении
  download_url?: string; // Присутствует при завершении
  error?: string; // Присутствует при ошибке
  message?: string; // Может присутствовать в статусе pending
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
  const [currentTaskType, setCurrentTaskType] = useState<'user' | 'full' | null>(null);
  const [pollingStatus, setPollingStatus] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Очистка интервала при размонтировании компонента или изменении task_id
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const startPolling = (taskId: string, taskType: 'user' | 'full') => {
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

          // --- ИЗМЕНЕНО: Выполняем переход по URL для скачивания ---
          const downloadUrl = backUpAPI.downloadBackupByTaskId(taskId);
          // Используем window.location.assign или window.location.href
          // Это выполнит редирект в той же вкладке, начав скачивание
          window.location.assign(downloadUrl);

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
    if (backupLoading || pollingStatus) return; // Предотвращаем двойной запуск

    setBackupLoading(true);
    setBackupError('');
    setBackupSuccess('');

    try {
      const response = await backUpAPI.initiateBackup();
      const taskId = response.data.task_id;

      setBackupLoading(false); // Завершаем индикатор загрузки инициации
      startPolling(taskId, 'user');
    } catch (error: any) {
      console.error('Initiate backup error:', error);
      setBackupLoading(false);
      setBackupError(t('backup.restoreError'));
    }
  };

  const handleDownloadFullBackup = async () => {
    if (fullBackupLoading || pollingStatus) return; // Предотвращаем двойной запуск

    setFullBackupLoading(true);
    setBackupError('');
    setBackupSuccess('');

    try {
      const response = await backUpAPI.initiateFullBackup();
      const taskId = response.data.task_id;

      setFullBackupLoading(false); // Завершаем индикатор загрузки инициации
      startPolling(taskId, 'full');
    } catch (error: any) {
      console.error('Initiate full backup error:', error);
      setFullBackupLoading(false);
      setBackupError(t('backup.restoreError'));
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
      const response = await backUpAPI.restoreBackup(formData);
      
      setRestoreSuccess(t('backup.restoreSuccessMessage', { restored_files: response.data.restored_files }));
    } catch (error: any) {
      console.error('Restore error:', error);
      setRestoreError(t('backup.restoreError'));
    } finally {
      setRestoreLoading(false);
      event.target.value = '';
    }
  };

  // Функция для отмены опроса вручную (опционально)
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
              disabled={backupLoading || pollingStatus} // Отключаем, если инициируется или идет опрос
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
                  <span>{t('backup.generating')}</span> {/* Новый перевод или строка */}
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>{t('backup.downloadButton')}</span>
                </>
              )}
            </button>
          </div>

          {/* Индикатор прогресса опроса */}
          {pollingStatus && currentTaskType === 'user' && (
            <div className="bg-blue-500/20 border border-blue-500/50 text-blue-200 px-3 py-2 rounded text-sm mt-2">
              {t('backup.generatingMessage')} {/* Новый перевод или строка */}
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
                disabled={fullBackupLoading || pollingStatus} // Отключаем, если инициируется или идет опрос
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
                    <span>{t('backup.generating')}</span> {/* Новый перевод или строка */}
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

            {/* Индикатор прогресса опроса */}
            {pollingStatus && currentTaskType === 'full' && (
              <div className="bg-blue-500/20 border border-blue-500/50 text-blue-200 px-3 py-2 rounded text-sm mt-2">
                {t('backup.generatingMessage')} {/* Новый перевод или строка */}
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

        {/* Upload Backup */}
        <div className="border border-slate-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-white font-medium flex items-center">
                <Upload className="w-4 h-4 mr-2" />
                {t('backup.restore')}
              </h3>
              <p className="text-slate-400 text-sm mt-1">
                {t('backup.restoreDescription')}
              </p>
            </div>
            <label className="flex items-center space-x-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-medium py-2 px-4 rounded-lg transition-all duration-300 text-sm cursor-pointer">
              <Upload className="w-4 h-4" />
              <span>{t('backup.selectFile')}</span>
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
            <p>• {t('backup.fileSupport')}</p>
            <p>• {t('backup.skipDuplicates')}</p>
            <p>• {t('backup.processTime')}</p>
            {user?.is_admin && (
              <p className="text-yellow-400">• {t('backup.adminRestore')}</p>
            )}
          </div>

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