// Route group layout — Legal disclaimer banner + SessionLock + ErrorBoundary.

import { SessionLock } from '../_components/auth/session-lock';
import { ErrorBoundary } from '../_components/error-boundary';
import { DisclaimerBanner } from '../_components/legal/disclaimer-banner';

export default function RoomLayout({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <div className="flex h-screen flex-col">
        <DisclaimerBanner />
        <div className="min-h-0 flex-1">{children}</div>
      </div>
      <SessionLock />
    </ErrorBoundary>
  );
}
