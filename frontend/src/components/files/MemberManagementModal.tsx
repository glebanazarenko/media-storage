// frontend/src/components/files/MemberManagementModal.tsx
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus, UserX } from 'lucide-react';
import { usersAPI, groupsAPI, User } from '../../services/api';
import { Group } from '../../types';

interface MemberManagementModalProps {
  groupId: string;
  onClose: () => void;
  currentUserId: string;
  creatorId: string;
  accessLevel: string;
}

// Тип для участника группы
interface GroupMember {
  user_id: string;
  role: string; // 'admin', 'editor', 'reader'
  user: User; // Вложенный объект пользователя
}

export const MemberManagementModal: React.FC<MemberManagementModalProps> = ({ groupId, onClose, currentUserId, creatorId, accessLevel }) => {
  const { t } = useTranslation();
  const [users, setUsers] = useState<User[]>([]); // Список всех пользователей (для приглашения)
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [errorUsers, setErrorUsers] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]); // Список участников группы
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [errorMembers, setErrorMembers] = useState<string | null>(null);
  const [newMemberEmail, setNewMemberEmail] = useState(''); // Для приглашения можно использовать email или username
  const [newMemberRole, setNewMemberRole] = useState<'reader' | 'editor'>('reader');
  const [loadingInvite, setLoadingInvite] = useState(false);
  const [errorInvite, setErrorInvite] = useState<string | null>(null);

  // Загрузка всех пользователей (для выбора при приглашении)
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoadingUsers(true);
        setErrorUsers(null);
        const response = await usersAPI.getUsers();
        if (response.data && Array.isArray(response.data.data)) {
            setUsers(response.data.data.filter((u: User) => u.id !== currentUserId));
        } else if (Array.isArray(response.data)) {
            setUsers(response.data.filter((u: User) => u.id !== currentUserId));
        } else {
            console.error("Unexpected API response structure for getUsers:", response);
            setErrorUsers(t('file.unexpectedApiResponse'));
        }
      } catch (err: any) {
        console.error('Error fetching users:', err);
        setErrorUsers(err.response?.data?.detail || t('file.failedToUpdate'));
      } finally {
        setLoadingUsers(false);
      }
    };

    fetchUsers();
  }, [t, currentUserId]);

  // Загрузка участников группы
  useEffect(() => {
    const fetchGroupMembers = async () => {
      try {
        setLoadingMembers(true);
        setErrorMembers(null);
        const response = await groupsAPI.getGroupMembers(groupId); // Используем новую функцию
        // Предполагаемая структура ответа: { data: { members: [...] } } или { data: [...] }
        let membersData = response.data;
        if (membersData && Array.isArray(membersData.members)) {
          // Если ответ в формате { data: { members: [...] } }
          setGroupMembers(membersData.members);
        } else if (Array.isArray(membersData)) {
          // Если ответ в формате { data: [...] }
          setGroupMembers(membersData);
        } else {
          // Если структура неожиданная
          console.error("Unexpected API response structure for getGroupMembers:", response);
          setErrorMembers(t('file.unexpectedApiResponse'));
          setGroupMembers([]); // Устанавливаем пустой массив, если ошибка
        }
      } catch (err: any) {
        console.error('Error fetching group members:', err);
        // Обработка ошибки из API
        const errorMessage = err.response?.data?.detail || err.message || t('file.failedToUpdate');
        setErrorMembers(errorMessage);
        setGroupMembers([]); // Устанавливаем пустой массив в случае ошибки
      } finally {
        setLoadingMembers(false);
      }
    };

    fetchGroupMembers();
  }, [groupId, t]);

  const handleInvite = async () => {
    if (!newMemberEmail || !groupId) return;

    setLoadingInvite(true);
    setErrorInvite(null);
    try {
      let targetUserId = '';
      // Поиск по email или username в списке всех пользователей
      const foundUser = users.find(u => u.email === newMemberEmail || u.username === newMemberEmail);
      if (foundUser) {
          targetUserId = foundUser.id;
      } else {
          alert(t('file.userNotFound'));
          return;
      }

      if (targetUserId) {
        await groupsAPI.inviteMember(groupId, { user_id: targetUserId, role: newMemberRole });
        // После успешного приглашения, обновляем список участников
        // Для простоты, перезагрузим список, чтобы получить обновленные данные от бэкенда
        // setGroupMembers(prev => [...prev, { user_id: targetUserId, role: newMemberRole, user: foundUser }]);
        // onClose(); // Или оставить открытым, если нужно добавить еще
        // Перезагрузка списка участников
        const response = await groupsAPI.getGroupMembers(groupId);
        let membersData = response.data;
        if (membersData && Array.isArray(membersData.members)) {
          setGroupMembers(membersData.members);
        } else if (Array.isArray(membersData)) {
          setGroupMembers(membersData);
        } else {
          console.error("Unexpected API response structure for getGroupMembers after invite:", response);
          setErrorMembers(t('file.unexpectedApiResponse'));
        }
        setNewMemberEmail(''); // Очистить поле ввода
        // onClose(); // Закрыть после приглашения, если нужно
      } else {
        alert(t('file.userNotFound'));
      }
    } catch (err: any) {
      console.error('Error inviting member:', err);
      setErrorInvite(err.response?.data?.detail || t('file.failedToInvite'));
    } finally {
        setLoadingInvite(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (userId === creatorId) {
        alert(t('file.cannotRemoveCreator'));
        return;
    }
    if (window.confirm(t('file.confirmRemoveMember'))) {
        try {
            await groupsAPI.removeMember(groupId, userId);
            // После удаления, перезагрузим список участников
            const response = await groupsAPI.getGroupMembers(groupId);
            let membersData = response.data;
            if (membersData && Array.isArray(membersData.members)) {
              setGroupMembers(membersData.members);
            } else if (Array.isArray(membersData)) {
              setGroupMembers(membersData);
            } else {
              console.error("Unexpected API response structure for getGroupMembers after remove:", response);
              setErrorMembers(t('file.unexpectedApiResponse'));
            }
            // onClose(); // Опционально: закрыть после удаления
        } catch (err: any) {
            console.error('Error removing member:', err);
            alert(err.response?.data?.detail || t('file.failedToRemove'));
        }
    }
  };

  const handleChangeRole = async (userId: string, newRole: 'reader' | 'editor' | 'admin') => { // Добавлен 'admin'
    if (userId === creatorId) {
        alert(t('file.cannotChangeCreatorRole'));
        return;
    }
    try {
        await groupsAPI.updateMemberRole(groupId, userId, { role: newRole });
        // После обновления роли, перезагрузим список участников
        const response = await groupsAPI.getGroupMembers(groupId);
        let membersData = response.data;
        if (membersData && Array.isArray(membersData.members)) {
          setGroupMembers(membersData.members);
        } else if (Array.isArray(membersData)) {
          setGroupMembers(membersData);
        } else {
          console.error("Unexpected API response structure for getGroupMembers after role change:", response);
          setErrorMembers(t('file.unexpectedApiResponse'));
        }
        // onClose(); // Опционально: закрыть после изменения роли
    } catch (err: any) {
        console.error('Error updating member role:', err);
        alert(err.response?.data?.detail || t('file.failedToUpdateRole'));
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-white">{t('file.manageMembers')}</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white"
            >
              &times;
            </button>
          </div>

          {/* Приглашение участника */}
          <div className="mb-6 p-4 bg-slate-700 rounded-lg">
            <h3 className="font-semibold text-white mb-2">{t('file.inviteMember')}</h3>
            <div className="flex space-x-2">
              <select
                value={newMemberEmail}
                onChange={(e) => setNewMemberEmail(e.target.value)}
                className="flex-grow bg-slate-600 text-white rounded-lg px-3 py-2"
              >
                <option value="">{t('file.selectUser')}</option>
                {users.map(user => (
                  <option key={user.id} value={user.email || user.username}>{user.username} ({user.email})</option>
                ))}
              </select>
              <select
                value={newMemberRole}
                onChange={(e) => setNewMemberRole(e.target.value as 'reader' | 'editor')}
                className="bg-slate-600 text-white rounded-lg px-3 py-2"
              >
                <option value="reader">{t('file.roleReader')}</option>
                <option value="editor">{t('file.roleEditor')}</option>
              </select>
              <button
                onClick={handleInvite}
                disabled={loadingInvite}
                className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors flex items-center"
              >
                {loadingInvite ? <span>{t('file.loading')}</span> : <><UserPlus className="w-4 h-4 mr-1" /> {t('file.invite')}</>}
              </button>
            </div>
            {errorInvite && <p className="text-red-500 mt-2">{errorInvite}</p>}
          </div>

          {/* Список участников группы */}
          <div>
            <h3 className="font-semibold text-white mb-2">{t('file.membersList')}</h3>
            {loadingMembers ? (
              <p className="text-slate-400">{t('file.loading')}</p>
            ) : errorMembers ? (
              <p className="text-red-500">{errorMembers}</p>
            ) : (
              <ul className="space-y-2">
                {groupMembers.map(member => (
                  <li key={member.user_id} className="flex justify-between items-center bg-slate-700 p-2 rounded">
                    <div>
                      <span className="text-white">{member.user?.username || 'Unknown User'}</span>
                      <span className="text-slate-400 text-sm ml-2">({member.user?.email || 'no-email'})</span>
                      {member.user_id === creatorId && <span className="ml-2 text-purple-400 text-xs">({t('file.creator')})</span>}
                    </div>
                    <div className="flex items-center space-x-2">
                      {/* Выбор роли (только если текущий пользователь админ, не создатель и не сам пользователь) */}
                      {accessLevel === 'admin' && member.user_id !== creatorId && member.user_id !== currentUserId && (
                        <>
                          <select
                            value={member.role}
                            onChange={(e) => handleChangeRole(member.user_id, e.target.value as 'reader' | 'editor' | 'admin')} // Обновлено
                            className="bg-slate-600 text-white rounded-lg px-2 py-1 text-sm"
                          >
                            <option value="reader">{t('file.roleReader')}</option>
                            <option value="editor">{t('file.roleEditor')}</option>
                            <option value="admin">{t('file.roleAdmin')}</option> {/* Добавлена роль admin */}
                          </select>
                          <button
                            onClick={() => handleRemoveMember(member.user_id)}
                            className="text-red-500 hover:text-red-400"
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      {/* Отображение роли, если не админ или создатель или сам пользователь */}
                      {(accessLevel !== 'admin' || member.user_id === creatorId || member.user_id === currentUserId) && (
                        <span className="text-slate-400 text-sm">
                          {member.role}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};