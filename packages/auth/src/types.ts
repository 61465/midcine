import { z } from 'zod';

export const RoleSchema = z.enum([
  'super_admin',
  'tenant_admin',
  'radiologist',
  'referring_physician',
  'technician',
  'coordinator',
  'patient',
  'external_doctor',
]);
export type Role = z.infer<typeof RoleSchema>;

export const UserSessionSchema = z.object({
  userId: z.string().uuid(),
  tenantId: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
  role: RoleSchema,
  permissions: z.array(z.string()),
  expiresAt: z.number(),
  issuedAt: z.number(),
});
export type UserSession = z.infer<typeof UserSessionSchema>;

export interface AuthConfig {
  issuer: string;
  clientId: string;
  redirectUri: string;
  scopes?: string[];
  cookieDomain?: string;
}
