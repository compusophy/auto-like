"use client";

import { useEffect, useState } from 'react';
import { SettingsModal } from './components/SettingsModal';
import { FarcasterTools } from './components/FarcasterTools';
import { AuthWrapper } from './components/AuthWrapper';
import { Button } from '../components/ui/button';
import { Dialog, DialogTrigger } from '../components/ui/dialog';
import { Settings } from 'lucide-react';
import type { SignerData } from './lib/types';

export default function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSignerDeleted = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header with Settings Cog */}
      <header className="fixed top-0 right-0 p-4 z-30">
        <Dialog open={showSettings} onOpenChange={setShowSettings}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="rounded-full shadow-lg hover:shadow-xl transition-shadow duration-200"
              title="Settings & Database Status"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <SettingsModal 
            isOpen={showSettings} 
            onClose={() => setShowSettings(false)} 
            onSignerDeleted={handleSignerDeleted}
          />
        </Dialog>
      </header>

      {/* Main Content */}
      <main className="flex flex-col items-center justify-center min-h-screen p-8">
        <div className="w-full max-w-2xl">
          <AuthWrapper key={refreshKey}>
            {(signerData: SignerData | null) => (
              <FarcasterTools signerData={signerData} />
            )}
          </AuthWrapper>
        </div>
      </main>
    </div>
  );
} 