'use client';

import { useEffect, useState } from 'react';

/**
 * Tablet/iPad layout hook — tracks viewport size + drawer state.
 * Pure CSS breakpoints via Tailwind for style; JS only for drawer state.
 *
 * Breakpoints (match tailwind.config defaults):
 *   mobile:    < 768
 *   tabletPortrait: 768-1023
 *   tabletLandscape: 1024-1279
 *   desktop:   ≥ 1280
 */
export function useTabletLayout() {
  const [width, setWidth] = useState<number>(() =>
    typeof window === 'undefined' ? 1440 : window.innerWidth,
  );
  const [worklistOpen, setWorklistOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const isMobile = width < 768;
  const isTabletPortrait = width >= 768 && width < 1024;
  const isTabletLandscape = width >= 1024 && width < 1280;
  const isTablet = isTabletPortrait || isTabletLandscape;
  const isDesktop = width >= 1280;

  return {
    width,
    isMobile,
    isTabletPortrait,
    isTabletLandscape,
    isTablet,
    isDesktop,
    worklistOpen,
    setWorklistOpen,
    reportOpen,
    setReportOpen,
  };
}
