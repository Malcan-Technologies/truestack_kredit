# PPG (Pemberi Pajak Gadai / Pawnbroker) Implementation Guide

> **Status**: Not yet implemented  
> **Current Focus**: PPW (Pemberi Pinjam Wang / Money Lender)  
> **Last Updated**: February 2026

## Overview

TrueKredit supports two types of licensed money lending businesses under KPKT (Kementerian Perumahan dan Kerajaan Tempatan):

| Type | Full Name (Malay) | English | Current Status |
|------|-------------------|---------|----------------|
| **PPW** | Pemberi Pinjam Wang | Money Lender | ✅ Implemented |
| **PPG** | Pemberi Pajak Gadai | Pawnbroker | ⏳ Planned |

This document outlines the key differences between PPW and PPG, and what needs to be implemented to support PPG tenants.

---

## Database Schema

The `TenantType` enum has already been added to the schema:

```prisma
enum TenantType {
  PPW // Pemberi Pinjam Wang (Money Lender)
  PPG // Pemberi Pajak Gadai (Pawnbroker)
}

model Tenant {
  // ...
  type TenantType // Required field
  // ...
}
```

**Current state**: Tenants can select PPW or PPG during registration. The type is stored and displayed in settings (read-only after registration).

---

## Key Differences: PPW vs PPG

### 1. Business Model

| Aspect | PPW (Money Lender) | PPG (Pawnbroker) |
|--------|-------------------|------------------|
| **Collateral** | May or may not require collateral | Always requires collateral (pledge) |
| **Loan Security** | Based on creditworthiness | Based on collateral value |
| **Default Handling** | Collection, legal action | Forfeiture of collateral |
| **Valuation** | Income-based | Asset valuation |

### 2. Interest Rate Regulations

| Regulation | PPW | PPG |
|------------|-----|-----|
| **Max Interest Rate** | 18% p.a. (unsecured) / 12% p.a. (secured - Jadual K) | 2% per month (24% p.a.) on loan value |
| **Late Payment** | Up to 8% p.a. on overdue | Different structure |
| **Calculation** | Flat or Declining Balance | Based on redemption value |

### 3. Loan Schedule Types

| Type | PPW | PPG |
|------|-----|-----|
| **Jadual J** | ✅ No collateral | ❌ Not applicable |
| **Jadual K** | ✅ With collateral | ❌ Not applicable |
| **Jadual Pajak Gadai** | ❌ Not applicable | ✅ Pawn schedule |

### 4. Required Documents

**PPW (Current Implementation):**
- IC Front/Back or Passport
- Payslip
- Bank Statement
- Employment Letter

**PPG (To Be Implemented):**
- IC Front/Back
- Collateral photos
- Collateral valuation report
- Pawn ticket/receipt
- Item description and condition report

### 5. Borrower Information

**PPW**: Full borrower profile with income verification, employment status, etc.

**PPG**: Simpler profile focused on:
- Basic identity verification
- Contact information
- Collateral details (new entity needed)

---

## Implementation Checklist for PPG

### Phase 1: Core Data Model

- [ ] Create `Collateral` model for pawn items
  ```prisma
  model Collateral {
    id            String   @id @default(cuid())
    tenantId      String
    borrowerId    String
    itemType      String   // GOLD, JEWELRY, ELECTRONICS, etc.
    description   String
    weight        Decimal? // For gold/jewelry
    purity        String?  // For gold (e.g., 916, 999)
    valuedAt      Decimal  // Appraised value
    loanValue     Decimal  // Loan given (typically 60-70% of value)
    photoUrls     Json     // Array of photo URLs
    status        CollateralStatus // PLEDGED, REDEEMED, FORFEITED
    pledgedAt     DateTime
    redemptionDue DateTime
    redeemedAt    DateTime?
    forfeitedAt   DateTime?
    // Relations
    tenant        Tenant   @relation(...)
    borrower      Borrower @relation(...)
    pawnTicket    PawnTicket?
  }
  ```

- [ ] Create `PawnTicket` model
  ```prisma
  model PawnTicket {
    id           String   @id @default(cuid())
    tenantId     String
    ticketNumber String   @unique
    collateralId String   @unique
    principal    Decimal
    interestRate Decimal  // Monthly rate
    issuedAt     DateTime
    expiresAt    DateTime // Typically 6 months
    status       PawnTicketStatus // ACTIVE, EXTENDED, REDEEMED, FORFEITED
    // Relations
    collateral   Collateral @relation(...)
  }
  ```

### Phase 2: UI Changes

- [ ] **Dashboard**: Show collateral-focused metrics instead of loan-focused
  - Total collateral value
  - Items due for redemption
  - Forfeiture warnings

- [ ] **Borrower Profile**: Simplified for PPG
  - Remove income/employment fields
  - Add collateral history section

- [ ] **Loan Application**: Replace with "Pawn Transaction"
  - Collateral entry form
  - Photo upload
  - Valuation calculator
  - Pawn ticket generation

- [ ] **Products**: Different product configuration
  - Replace loan terms with pawn period options
  - Different interest calculation
  - Redemption value calculator

### Phase 3: Calculations

- [ ] **PPG Interest Calculation**
  ```typescript
  // PPG: 2% per month on loan value
  function calculatePawnInterest(principal: number, months: number): number {
    const monthlyRate = 0.02; // 2% per month
    return principal * monthlyRate * months;
  }

  // Redemption value = Principal + Interest
  function calculateRedemptionValue(principal: number, months: number): number {
    return principal + calculatePawnInterest(principal, months);
  }
  ```

- [ ] **Valuation Rules**
  - Gold: Based on weight × purity × market price
  - Jewelry: Based on appraisal
  - Electronics: Based on market value with depreciation

### Phase 4: Reports & Compliance

- [ ] **PPG-specific reports**
  - Collateral inventory report
  - Redemption due report
  - Forfeiture register
  - Monthly interest income report

- [ ] **Regulatory compliance**
  - Pawn ticket format per KPKT requirements
  - Forfeiture notice format
  - Auction records (for forfeited items)

### Phase 5: Conditional Rendering

- [ ] Add tenant type checks throughout the application:
  ```typescript
  // Example: Conditional navigation
  const isPPG = tenant?.type === 'PPG';
  
  // Show different menu items
  {isPPG ? (
    <NavItem href="/collateral">Collateral</NavItem>
  ) : (
    <NavItem href="/loans">Loans</NavItem>
  )}
  ```

- [ ] Create feature flags or conditional components:
  ```typescript
  // components/tenant-type-guard.tsx
  export function PPWOnly({ children }: { children: React.ReactNode }) {
    const { tenant } = useTenantContext();
    if (tenant?.type !== 'PPW') return null;
    return <>{children}</>;
  }

  export function PPGOnly({ children }: { children: React.ReactNode }) {
    const { tenant } = useTenantContext();
    if (tenant?.type !== 'PPG') return null;
    return <>{children}</>;
  }
  ```

---

## Files to Modify for PPG

### Backend
| File | Changes Needed |
|------|----------------|
| `prisma/schema.prisma` | Add Collateral, PawnTicket models |
| `modules/loans/*` | Conditional logic or separate PPG module |
| `modules/products/*` | PPG product configuration |
| `routes/api/*` | PPG-specific endpoints |

### Admin Frontend
| File | Changes Needed |
|------|----------------|
| `app/(dashboard)/dashboard/page.tsx` | Conditional dashboard metrics |
| `app/(dashboard)/borrowers/*` | Simplified borrower form for PPG |
| `app/(dashboard)/loans/*` | Replace with pawn transactions for PPG |
| `app/(dashboard)/products/*` | PPG product configuration |
| `components/sidebar.tsx` | Conditional navigation |

---

## Testing Strategy

1. **Unit Tests**: Separate test suites for PPG calculations
2. **Integration Tests**: Test PPG-specific API endpoints
3. **E2E Tests**: Full pawn transaction flow

---

## Migration Path

When implementing PPG:

1. Create database migrations for new models
2. Update seed.ts with PPG demo data
3. Implement UI components with feature flags
4. Test with a dedicated PPG test tenant
5. Document PPG-specific user guides

---

## References

- KPKT Pawnbroker Regulations
- Akta Pemegang Pajak Gadai 1972
- State pawnbroker licensing requirements

---

## Notes

- PPG implementation should not break existing PPW functionality
- Use feature flags or tenant type checks for conditional behavior
- Consider creating separate route groups: `app/(ppw)/*` and `app/(ppg)/*` if differences are significant
