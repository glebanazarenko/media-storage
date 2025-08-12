import React, { useState } from 'react';
import { Header } from './components/Layout/Header';
import { Sidebar } from './components/Sidebar/Sidebar';
import { MediaGrid } from './components/Media/MediaGrid';
import { UploadModal } from './components/Upload/UploadModal';
import { useMediaFiles } from './hooks/useMediaFiles';

function App() {
  const [activeSection, setActiveSection] = useState('all');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const { files, loading, updateFilters, addFiles } = useMediaFiles();

  const handleSearch = (query: string) => {
    updateFilters({ query });
  };

  const handleUpload = (newFiles: File[]) => {
    addFiles(newFiles);
  };

  const handleFileAction = (file: any, action: string) => {
    console.log(`Action: ${action} on file:`, file.originalName);
    // Handle file actions like view, download, share, edit, delete
  };

  // Mock user data
  const user = {
    username: 'demo_user',
    avatar: undefined,
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      {/* Header */}
      <Header
        onUpload={() => setIsUploadModalOpen(true)}
        onSearch={handleSearch}
        user={user}
      />

      <div className="flex h-[calc(100vh-4rem)]">
        {/* Sidebar */}
        <Sidebar
          activeSection={activeSection}
          onSectionChange={setActiveSection}
        />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-6">
            {/* Header Section */}
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-white mb-2">
                {activeSection === 'all' && 'All Media'}
                {activeSection === 'recent' && 'Recent Files'}
                {activeSection === 'favorites' && 'Favorites'}
                {activeSection === 'collections' && 'Collections'}
                {activeSection === 'shared' && 'Shared with Me'}
              </h1>
              <p className="text-gray-400">
                {loading ? 'Loading...' : `${files.length} files found`}
              </p>
            </div>

            {/* Media Grid */}
            <MediaGrid
              files={files}
              loading={loading}
              onFileAction={handleFileAction}
            />
          </div>
        </main>
      </div>

      {/* Upload Modal */}
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUpload={handleUpload}
      />
    </div>
  );
}

export default App;