import React from 'react';

import { PageScreen } from '@/components/page-screen';
import { ThemeSettingsCard } from '@/components/theme-settings-card';

export default function AppSettingsScreen() {
  return (
    <PageScreen
      title="App settings"
      subtitle="Preferences for how the mobile app behaves on this device."
      showBackButton
      showBottomNav
      backFallbackHref="/settings-menu">
      <ThemeSettingsCard />
    </PageScreen>
  );
}
