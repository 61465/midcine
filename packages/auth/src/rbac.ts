import type { Role, UserSession } from './types';

export const PERMISSIONS = {
  STUDIES_READ: 'studies:read',
  STUDIES_WRITE: 'studies:write',
  REPORTS_READ: 'reports:read',
  REPORTS_WRITE: 'reports:write',
  REPORTS_SIGN: 'reports:sign',
  PATIENTS_READ: 'patients:read',
  PATIENTS_WRITE: 'patients:write',
  USERS_MANAGE: 'users:manage',
  BILLING_VIEW: 'billing:view',
  CONSENT_REQUEST: 'consent:request',
  CROSS_HOSPITAL_LOOKUP: 'cross_hospital:lookup',
} as const;

type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: Object.values(PERMISSIONS),
  tenant_admin: [
    PERMISSIONS.STUDIES_READ,
    PERMISSIONS.REPORTS_READ,
    PERMISSIONS.PATIENTS_READ,
    PERMISSIONS.USERS_MANAGE,
    PERMISSIONS.BILLING_VIEW,
  ],
  radiologist: [
    PERMISSIONS.STUDIES_READ,
    PERMISSIONS.STUDIES_WRITE,
    PERMISSIONS.REPORTS_READ,
    PERMISSIONS.REPORTS_WRITE,
    PERMISSIONS.REPORTS_SIGN,
    PERMISSIONS.PATIENTS_READ,
    PERMISSIONS.CROSS_HOSPITAL_LOOKUP,
  ],
  referring_physician: [
    PERMISSIONS.STUDIES_READ,
    PERMISSIONS.REPORTS_READ,
    PERMISSIONS.PATIENTS_READ,
    PERMISSIONS.CONSENT_REQUEST,
  ],
  technician: [PERMISSIONS.STUDIES_READ, PERMISSIONS.STUDIES_WRITE],
  coordinator: [PERMISSIONS.PATIENTS_READ, PERMISSIONS.PATIENTS_WRITE],
  patient: [PERMISSIONS.REPORTS_READ],
  external_doctor: [PERMISSIONS.STUDIES_READ, PERMISSIONS.REPORTS_READ],
};

export function hasPermission(session: UserSession, permission: Permission): boolean {
  if (session.permissions.includes(permission)) return true;
  return ROLE_PERMISSIONS[session.role]?.includes(permission) ?? false;
}

export function requirePermission(session: UserSession, permission: Permission): void {
  if (!hasPermission(session, permission)) {
    throw new Error(`forbidden: missing permission ${permission}`);
  }
}
