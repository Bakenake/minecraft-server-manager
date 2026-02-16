import { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import UpdateBanner from '../UpdateBanner';
import { PageFooterAd } from '../AdBanner';
import { cn } from '../../lib/utils';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen overflow-hidden bg-dark-950">
      <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <UpdateBanner />
        <Header onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />

        <main className="flex-1 overflow-y-auto p-4 lg:p-6 safe-bottom">
          <div className="max-w-[1600px] mx-auto animate-fade-in">
            {children}
            <PageFooterAd className="mt-8" />
          </div>
        </main>
      </div>
    </div>
  );
}
