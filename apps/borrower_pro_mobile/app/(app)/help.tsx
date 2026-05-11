import React from 'react';

import { HelpContactCard } from '@/components/help-contact-card';
import { HelpTopicList } from '@/components/help-topic-list';
import { PageScreen } from '@/components/page-screen';

export default function HelpScreen() {
  return (
    <PageScreen
      title="Help"
      subtitle="Practical guides to help you understand each step of your loan journey in the portal, from application through repayment and final discharge."
      showBackButton
      backFallbackHref="/settings-menu">
      <HelpContactCard />
      <HelpTopicList />
    </PageScreen>
  );
}
