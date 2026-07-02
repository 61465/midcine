'use client';

import {
  ListChecks,
  ScanEye,
  User,
  Sparkles,
  Send,
  Settings,
  Smartphone,
  Heart,
} from 'lucide-react';
import { AppSwitcher } from '@midcine/ui';
import { useLocale } from '../../lib/i18n';

const routes = [
  { id: 'worklist', name: 'Worklist', nameAr: 'قائمة العمل', url: '/worklist', icon: ListChecks },
  { id: 'reader', name: 'Reader', nameAr: 'القارئ', url: '/worklist', icon: ScanEye },
  { id: 'anatomy', name: 'Anatomy', nameAr: 'أطلس الأمراض', url: '/anatomy', icon: Heart },
  { id: 'patient', name: 'Patient', nameAr: 'المريض', url: '/worklist', icon: User },
  { id: 'insights', name: 'Insights', nameAr: 'الرؤى', url: '/insights', icon: Sparkles },
  { id: 'connect', name: 'Connect', nameAr: 'الاتصال', url: '/connect', icon: Send },
  { id: 'console', name: 'Console', nameAr: 'الإعدادات', url: '/console', icon: Settings },
  { id: 'm', name: 'Mobile', nameAr: 'الجوّال', url: '/m', icon: Smartphone },
];

export function MidcineAppSwitcher({ currentAppId = 'worklist' }: { currentAppId?: string }) {
  const { locale } = useLocale();
  // Present the correct name column depending on locale.
  const apps = routes.map((r) => ({
    ...r,
    // Show English name in EN mode by putting it in the nameAr slot
    // (AppSwitcher renders nameAr — we swap the string based on locale).
    nameAr: locale === 'en' ? r.name : r.nameAr,
  }));
  return <AppSwitcher apps={apps} currentAppId={currentAppId} />;
}
