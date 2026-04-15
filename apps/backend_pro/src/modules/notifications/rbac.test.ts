import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TENANT_ROLE_TEMPLATES,
  TENANT_PERMISSIONS,
} from '@kredit/shared';

describe('notification RBAC defaults', () => {
  it('includes notification permissions in the tenant permission catalog', () => {
    expect(TENANT_PERMISSIONS).toEqual(
      expect.arrayContaining([
        'notifications.view',
        'notifications.manage_settings',
        'notifications.send_broadcast',
        'notifications.view_logs',
      ])
    );
  });

  it('grants notification access to the expected default roles', () => {
    const opsAdmin = DEFAULT_TENANT_ROLE_TEMPLATES.find(
      (role) => role.key === 'OPS_ADMIN'
    );
    const generalStaff = DEFAULT_TENANT_ROLE_TEMPLATES.find(
      (role) => role.key === 'GENERAL_STAFF'
    );
    const auditor = DEFAULT_TENANT_ROLE_TEMPLATES.find(
      (role) => role.key === 'AUDITOR_READONLY'
    );

    expect(opsAdmin?.permissions).toEqual(
      expect.arrayContaining([
        'notifications.view',
        'notifications.manage_settings',
        'notifications.send_broadcast',
        'notifications.view_logs',
      ])
    );
    expect(generalStaff?.permissions).toContain('notifications.view');
    expect(auditor?.permissions).toContain('notifications.view_logs');
  });
});
