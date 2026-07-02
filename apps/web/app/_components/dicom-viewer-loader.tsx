'use client';

import dynamic from 'next/dynamic';

// Cornerstone3D ships WebWorkers + WASM codecs (openjph, libjpeg-turbo).
// These can only execute in the browser, so we force client-only loading
// to keep the route SSR-safe.
export const DicomViewer = dynamic(() => import('./dicom-viewer').then((m) => m.DicomViewer), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-black text-gray-400">
      جارٍ تجهيز عارض DICOM…
    </div>
  ),
});
