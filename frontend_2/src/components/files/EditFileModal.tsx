import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { FileItem } from '../../types';
import { filesAPI } from '../../services/api';
import { TagInput } from './TagInput';

interface EditFileModalProps {
  file: FileItem;
  onClose: () => void;
  onSave: (updatedFile: FileItem) => void;
}

export const EditFileModal: React.FC<EditFileModalProps> = ({
  file,
  onClose,
  onSave,
}) => {
  const [description, setDescription] = useState(file.description || '');
  const [category, setCategory] = useState(file.category_name || '0+');
  const [tags, setTags] = useState<string[]>(file.tags.map(tag => tag.name));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await filesAPI.editFile(file.id, {
        description,
        category,
        tagNames: tags.join(',')
      });

      // Преобразуем ответ в формат FileItem
      const updatedFile: FileItem = {
        ...file,
        description: response.data.description,
        category_name: response.data.category_name,
        tags: response.data.tags.map((tag: any) => ({
          id: tag.id,
          name: tag.name
        }))
      };

      onSave(updatedFile);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update file');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-xl border border-slate-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">Edit File</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="space-y-6">
              {/* Preview */}
              <div className="bg-slate-800 rounded-lg p-4">
                <div className="flex items-center space-x-4">
                  {file.thumbnail_url ? (
                    <img
                      src={file.thumbnail_url}
                      alt={file.filename}
                      className="w-16 h-16 object-cover rounded"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-slate-700 rounded flex items-center justify-center">
                      <div className="text-slate-400">
                        {file.mime_type.startsWith('video/') ? '🎥' : 
                         file.mime_type.startsWith('image/') ? '🖼️' : '📄'}
                      </div>
                    </div>
                  )}
                  <div>
                    <h3 className="font-semibold text-white truncate max-w-xs">
                      {file.filename}
                    </h3>
                    <p className="text-slate-400 text-sm">
                      {file.category_name}
                    </p>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  rows={3}
                  placeholder="Enter file description..."
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="0+">0+ (General)</option>
                  <option value="16+">16+ (Teen)</option>
                  <option value="18+">18+ (Adult)</option>
                </select>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">
                  Tags
                </label>
                <TagInput
                  tags={tags}
                  onTagsChange={setTags}
                  placeholder="Add tags..."
                  allowNegative={false}
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-8">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};