export const TENANT_DATA_UPDATED_EVENT = "tenant-data-updated";

export function dispatchTenantDataUpdated(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(TENANT_DATA_UPDATED_EVENT));
  }
}
