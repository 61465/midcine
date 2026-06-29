/**
 * midcine OHIF v3 config — Orthanc DICOMweb endpoint
 */
window.config = {
  routerBasename: '/',
  showStudyList: true,
  showLoadingIndicator: true,
  experimentalStudyBrowserSort: true,
  maxNumberOfWebWorkers: 3,

  // وضع RTL للوحات الجانبية
  i18n: {
    defaultLanguage: 'ar-EG',
    debug: false,
  },

  extensions: [
    '@ohif/extension-default',
    '@ohif/extension-cornerstone',
    '@ohif/extension-cornerstone-dicom-sr',
    '@ohif/extension-cornerstone-dicom-seg',
    '@ohif/extension-measurement-tracking',
  ],
  modes: [
    '@ohif/mode-longitudinal',
    '@ohif/mode-basic-dev-mode',
  ],

  customizationService: {
    // إضافة hanging protocol للـ 3D MPR على CT
  },

  hotkeys: [
    { commandName: 'incrementActiveViewport', label: 'Next Viewport', keys: ['right'] },
    { commandName: 'decrementActiveViewport', label: 'Prev Viewport', keys: ['left'] },
    { commandName: 'rotateViewportCW', label: 'Rotate Right', keys: ['r'] },
    { commandName: 'rotateViewportCCW', label: 'Rotate Left', keys: ['l'] },
    { commandName: 'flipViewportHorizontal', label: 'Flip H', keys: ['h'] },
    { commandName: 'flipViewportVertical', label: 'Flip V', keys: ['v'] },
    { commandName: 'invertViewport', label: 'Invert', keys: ['i'] },
    { commandName: 'resetViewport', label: 'Reset', keys: ['space'] },
    { commandName: 'toggleCine', label: 'Cine', keys: ['c'] },
  ],

  dataSources: [
    {
      friendlyName: 'midcine Orthanc',
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'midcine',
      configuration: {
        name: 'midcine',
        wadoUriRoot: 'http://localhost:13042/wado',
        qidoRoot: 'http://localhost:13042/dicom-web',
        wadoRoot: 'http://localhost:13042/dicom-web',
        qidoSupportsIncludeField: true,
        supportsReject: false,
        supportsStow: true,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: false,
        supportsWildcard: true,
        requestOptions: {},
      },
    },
  ],
  defaultDataSourceName: 'midcine',

  // تفعيل ميزات Cornerstone3D متقدمة
  cornerstoneExtensionConfig: {
    tools: {
      VolumeRotate: { enabled: true },
      MIP: { enabled: true },
      Crosshairs: { enabled: true },
    },
    enableVolumeViewport: true,
    enable3DMPR: true,
  },
};
