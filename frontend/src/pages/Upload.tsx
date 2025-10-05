import React from 'react';
import { Layout } from '../components/layout/Layout';
import { UploadForm } from '../components/files/UploadForm';

export const Upload: React.FC = () => {
  return (
    <Layout>
      <UploadForm />
    </Layout>
  );
};