import type { BorrowerMeResponse, BorrowerProfile } from '@kredit/borrower';
import React, { createContext, useContext } from 'react';

type BorrowerAccessState = {
  hasBorrowerProfiles: boolean;
  isCheckingBorrowerProfiles: boolean;
  profileCount: number;
  profiles: BorrowerProfile[];
  activeBorrowerId: string | null;
  activeBorrower: BorrowerProfile | null;
  switchingProfileId: string | null;
  borrowerContextVersion: number;
  refreshBorrowerProfiles: () => Promise<BorrowerMeResponse['data'] | null>;
  switchBorrowerProfile: (borrowerId: string) => Promise<void>;
};

const BorrowerAccessContext = createContext<BorrowerAccessState | null>(null);

export function BorrowerAccessProvider({
  value,
  children,
}: {
  value: BorrowerAccessState;
  children: React.ReactNode;
}) {
  return (
    <BorrowerAccessContext.Provider value={value}>{children}</BorrowerAccessContext.Provider>
  );
}

export function useBorrowerAccess() {
  const context = useContext(BorrowerAccessContext);
  if (!context) {
    throw new Error('useBorrowerAccess must be used within BorrowerAccessProvider');
  }

  return context;
}
