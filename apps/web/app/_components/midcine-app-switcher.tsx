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

const routes = [
  { id: 'worklist', name: 'Worklist', nameAr: 'قائمة العمل', url: '/worklist', icon: ListChecks },
  { id: 'reader', name: 'Reader', nameAr: 'القارئ', url: '/reader/demo', icon: ScanEye },
  { id: 'anatomy', name: 'Anatomy', nameAr: 'التشريح', url: '/anatomy', icon: Heart },
  { id: 'patient', name: 'Patient', nameAr: 'المريض', url: '/patient/demo', icon: User },
  { id: 'insights', name: 'Insights', nameAr: 'الرؤى', url: '/insights', icon: Sparkles },
  { id: 'connect', name: 'Connect', nameAr: 'الاتصال', url: '/connect', icon: Send },
  { id: 'console', name: 'Console', nameAr: 'وحدة التحكم', url: '/console', icon: Settings },
  { id: 'm', name: 'Mobile', nameAr: 'الجوّال', url: '/m', icon: Smartphone },
];

export function MidcineAppSwitcher({ currentAppId = 'worklist' }: { currentAppId?: string }) {
  return <AppSwitcher apps={routes} currentAppId={currentAppId} />;
}
