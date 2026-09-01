/**
 * CT EVOLUTION — SENIOR PACS WORKSTATION
 * script.js — Core engine
 *
 * Architecture:
 *  - Real CT images loaded via HTMLImageElement + drawImage()
 *  - Era physics simulation applied via getImageData() pixel manipulation
 *  - Full DICOM-like tooling: Pan, Zoom, Rotate, Flip, Ruler, HU Probe
 *  - W/L windowing via canvas pixel luminance rescaling
 *  - Colormap LUTs applied per-pixel
 *  - Cine loop player
 *  - Compare mode (side by side, two different eras)
 */

/* ============================================================
   0-A. PROXY HELPER (must be before ERA_DB)
   ============================================================ */
function proxyUrl(externalUrl) {
  if (
    typeof location !== 'undefined' &&
    (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ) {
    return `/proxy?url=${encodeURIComponent(externalUrl)}`;
  }
  return externalUrl;
}

/* ============================================================
   0. ERA DATABASE — Real CT images from Wikimedia (via local proxy)
   ============================================================ */
const ERA_DB = {
  era1: {
    id: 'era1',
    year: '1972',
    name: 'الجيل الأول — Pencil Beam',
    techShort: 'EMI Mark I · 80×80 Matrix · FBP',
    scanTime: 300,
    matrix: 80,
    dose: 20,
    slices: 2,
    noise: 0.65,
    pixelSize: 6,
    blur: 4,
    kVp: 120,
    mAs: 600,
    // Brain CT — heavy noise/blur simulates 1972 quality
    imageUrl: proxyUrl(
      'https://upload.wikimedia.org/wikipedia/commons/5/50/Computed_tomography_of_human_brain_-_large.png',
    ),
    fallbackUrl: null,
    noisePattern: 'heavy',
    physics: `في عام 1972 ابتكر السير غودفري هاونسفيلد (Godfrey Hounsfield) جهاز EMI Mark I بمعهد مستشفى أتكينسون مورلي في لندن.
كان الجهاز يستخدم قلم إشعاع واحد (Pencil Beam) يتحرك خطياً ثم يدور بزيادة 1°، مكملاً 180° في 300 ثانية للشريحة الواحدة.
المصفوفة: 80×80 بكسل فقط (6400 بكسل)، وسمك الشريحة 13 مم، وجرعة إشعاعية 20 mSv للشريحة.
خوارزمية FBP البدائية أنتجت صوراً ضبابية بحواف غير حادة مع ضوضاء عالية جداً.
حصل هاونسفيلد وكورماك على جائزة نوبل للطب 1979 تقديراً لهذا الاختراع.`,
    compare:
      'قياساً بالتصوير الحديث: الجرعة أعلى 13 مرة، الدقة أقل بـ 40 مرة، وزمن الفحص أبطأ بـ 2000 مرة.',
    specs: [
      { k: 'Matrix', v: '80×80', cls: 'warn' },
      { k: 'Slice Time', v: '300 sec', cls: 'warn' },
      { k: 'Dose', v: '20 mSv', cls: 'warn' },
      { k: 'Slices/Study', v: '2', cls: 'warn' },
      { k: 'Recon', v: 'FBP', cls: '' },
      { k: 'SNR', v: '12 dB', cls: 'warn' },
    ],
    dicomTags: [
      ['(0008,0060)', 'Modality', 'CS', 'CT'],
      ['(0008,0021)', 'Series Date', 'DA', '19720927'],
      ['(0008,0031)', 'Series Time', 'TM', '093200'],
      ['(0008,1030)', 'Study Description', 'LO', 'BRAIN CT - FIRST GEN'],
      ['(0018,0050)', 'Slice Thickness', 'DS', '13.0'],
      ['(0018,0060)', 'KVP', 'DS', '120'],
      ['(0018,1151)', 'X-Ray Tube Current', 'IS', '600'],
      ['(0018,0088)', 'Spacing Between Slices', 'DS', '13.0'],
      ['(0028,0010)', 'Rows', 'US', '80'],
      ['(0028,0011)', 'Columns', 'US', '80'],
      ['(0028,0030)', 'Pixel Spacing', 'DS', '3.0\\3.0'],
      ['(0028,1050)', 'Window Center', 'DS', '40'],
      ['(0028,1051)', 'Window Width', 'DS', '400'],
      ['(0028,0100)', 'Bits Allocated', 'US', '16'],
      ['(0028,1052)', 'Rescale Intercept', 'DS', '-1000'],
    ],
    report: {
      technique:
        'Non-contrast axial CT acquisition using EMI Mark I pencil-beam scanner. Matrix 80×80. Single detector element. Scan time 300 seconds per image. No reformats available.',
      findings:
        'Limited diagnostic quality due to first-generation scanner constraints. High image noise significantly limits grey-white matter differentiation. Identifiable midline structures visible. Bony calvaria delineated. No gross mass lesion identified on this limited examination.',
      impression:
        '1. First-generation CT scan of limited diagnostic quality. 2. No definitive acute intracranial abnormality identified, though sensitivity is low. 3. Follow-up with modern CT recommended for complete evaluation.',
    },
  },

  era2: {
    id: 'era2',
    year: '1982',
    name: 'الجيل الثالث — Fan Beam',
    techShort: 'Fan Beam · 256×256 · FBP',
    scanTime: 4.8,
    matrix: 256,
    dose: 10,
    slices: 10,
    noise: 0.3,
    pixelSize: 2,
    blur: 1.5,
    kVp: 120,
    mAs: 300,
    imageUrl: proxyUrl(
      'https://upload.wikimedia.org/wikipedia/commons/5/50/Computed_tomography_of_human_brain_-_large.png',
    ),
    fallbackUrl: null,
    noisePattern: 'medium',
    physics: `الجيل الثالث من الثمانينيات: حزمة المروحة (Fan Beam) مع 256–512 كاشفاً في صف واحد.
الأنبوب والكواشف تدور معاً (Rotate-Rotate geometry)، مما رفع السرعة لـ 4.8 ثانية للشريحة.
مصفوفة 256×256 (65,536 بكسل) بدلاً من 6,400 — زيادة في الدقة 10 أضعاف.
خوارزمية FBP المحسّنة مع فلاتر Shepp-Logan أنتجت صوراً أكثر حدة.
الجرعة انخفضت لـ 10 mSv بفضل الكواشف الأكثر كفاءة وكولماتور أفضل.`,
    compare:
      'أسرع 60 مرة من الجيل الأول، دقة أعلى 10 مرات، لكن الجرعة لا تزال أعلى من الحديثة بـ 7 مرات.',
    specs: [
      { k: 'Matrix', v: '256×256', cls: '' },
      { k: 'Slice Time', v: '4.8 sec', cls: '' },
      { k: 'Dose', v: '10 mSv', cls: 'warn' },
      { k: 'Slices/Study', v: '10', cls: '' },
      { k: 'Recon', v: 'FBP', cls: '' },
      { k: 'SNR', v: '28 dB', cls: '' },
    ],
    dicomTags: [
      ['(0008,0060)', 'Modality', 'CS', 'CT'],
      ['(0008,0021)', 'Series Date', 'DA', '19820615'],
      ['(0008,1030)', 'Study Description', 'LO', 'BRAIN CT - THIRD GEN SCANNER'],
      ['(0018,0050)', 'Slice Thickness', 'DS', '10.0'],
      ['(0018,0060)', 'KVP', 'DS', '120'],
      ['(0018,1151)', 'X-Ray Tube Current', 'IS', '300'],
      ['(0028,0010)', 'Rows', 'US', '256'],
      ['(0028,0011)', 'Columns', 'US', '256'],
      ['(0028,0030)', 'Pixel Spacing', 'DS', '0.9\\0.9'],
      ['(0028,1050)', 'Window Center', 'DS', '40'],
      ['(0028,1051)', 'Window Width', 'DS', '400'],
      ['(0028,0100)', 'Bits Allocated', 'US', '16'],
      ['(0028,1052)', 'Rescale Intercept', 'DS', '-1000'],
    ],
    report: {
      technique:
        'Non-contrast axial CT brain using third-generation fan-beam scanner. Matrix 256×256. 10mm contiguous axial images. FBP reconstruction with Shepp-Logan filter.',
      findings:
        'Improved image quality compared to first-generation CT. Grey-white matter differentiation present but limited by residual noise. Ventricular system normal in size and configuration. No focal parenchymal lesion. Basal ganglia structures visible. No evidence of acute hemorrhage.',
      impression:
        '1. No acute intracranial pathology identified. 2. Image quality limited by 1980s scanner technology. 3. Modern CT would provide significantly improved anatomical detail.',
    },
  },

  era3: {
    id: 'era3',
    year: '1998',
    name: 'الحلزوني — Multi-Slice',
    techShort: 'Helical 4-Slice · 512² · Iterative',
    scanTime: 0.8,
    matrix: 512,
    dose: 6.5,
    slices: 64,
    noise: 0.12,
    pixelSize: 0,
    blur: 0.5,
    kVp: 120,
    mAs: 200,
    imageUrl: proxyUrl(
      'https://upload.wikimedia.org/wikipedia/commons/5/50/Computed_tomography_of_human_brain_-_large.png',
    ),
    fallbackUrl: null,
    noisePattern: 'light',
    physics: `التسعينيات شهدت ثورة التصوير الحلزوني (Helical/Spiral CT): المريض يتحرك عبر حلقة الأنبوب الدوارة بشكل مستمر.
ظهرت الأجهزة متعددة الشرائح (4-Slice, 16-Slice) مع صفوف كواشف متعددة، تُغطي 40 مم في دورة واحدة.
مصفوفة 512×512 بتباعد بكسل 0.5 مم — دقة تشريحية ممتازة.
خوارزميات Iterative Reconstruction قللت الجرعة 30–50٪ مع صور أنقى.
أتاح التصوير المجسم (MPR) مشاهدة المقاطع السهمية والتاجية بجودة عالية.`,
    compare: 'بداية العصر الحديث: سرعة مقبولة، دقة 512², لكن الجرعة لا تزال مرتفعة نسبياً بدون AI.',
    specs: [
      { k: 'Matrix', v: '512×512', cls: 'good' },
      { k: 'Slice Time', v: '0.8 sec', cls: 'good' },
      { k: 'Dose', v: '6.5 mSv', cls: '' },
      { k: 'Slices/Study', v: '64', cls: 'good' },
      { k: 'Recon', v: 'Iterative', cls: 'good' },
      { k: 'SNR', v: '35 dB', cls: 'good' },
    ],
    dicomTags: [
      ['(0008,0060)', 'Modality', 'CS', 'CT'],
      ['(0008,0021)', 'Series Date', 'DA', '19980310'],
      ['(0008,1030)', 'Study Description', 'LO', 'BRAIN CT - HELICAL 4-SLICE'],
      ['(0018,0050)', 'Slice Thickness', 'DS', '5.0'],
      ['(0018,0060)', 'KVP', 'DS', '120'],
      ['(0018,1151)', 'X-Ray Tube Current', 'IS', '200'],
      ['(0018,9089)', 'Diffusion Gradient Orientation', 'FD', '0.0\\0.0\\0.0'],
      ['(0028,0010)', 'Rows', 'US', '512'],
      ['(0028,0011)', 'Columns', 'US', '512'],
      ['(0028,0030)', 'Pixel Spacing', 'DS', '0.5\\0.5'],
      ['(0028,1050)', 'Window Center', 'DS', '40'],
      ['(0028,1051)', 'Window Width', 'DS', '400'],
      ['(0028,0100)', 'Bits Allocated', 'US', '16'],
      ['(0028,1052)', 'Rescale Intercept', 'DS', '-1000'],
    ],
    report: {
      technique:
        'Non-contrast axial CT brain using 4-slice helical scanner. Matrix 512×512, 5mm slice thickness, 120kVp/200mAs. Iterative reconstruction applied. Coronal and sagittal reformats available.',
      findings:
        'Good quality examination. Brain parenchyma demonstrates normal grey-white matter differentiation. Ventricular system normal in caliber. Cerebral sulci are appropriate for age. Basal cisterns patent. No abnormal density lesion. Cerebellopontine angles clear. Midline structures in normal position.',
      impression:
        '1. Normal brain CT for age and clinical presentation. 2. Adequate diagnostic quality with helical multi-slice technique. 3. No acute intracranial abnormality.',
    },
  },

  present: {
    id: 'present',
    year: '2024',
    name: 'التصوير المتقدم — AI Recon',
    techShort: '640-Slice · AI DLR · 0.15s',
    scanTime: 0.15,
    matrix: 512,
    dose: 1.5,
    slices: 640,
    noise: 0.0,
    pixelSize: 0,
    blur: 0,
    kVp: 120,
    mAs: 200,
    imageUrl: proxyUrl(
      'https://upload.wikimedia.org/wikipedia/commons/5/50/Computed_tomography_of_human_brain_-_large.png',
    ),
    fallbackUrl: null,
    noisePattern: 'none',
    physics: `أجهزة 2024: Siemens SOMATOM X.cite (640 شريحة)، Canon Aquilion ONE PRISM (320 شريحة)، GE Revolution Apex.
الكاشف يغطي 16 سم في دورة واحدة — يصوّر القلب بضربة قلب واحدة (0.15 ثانية).
إعادة البناء بالذكاء الاصطناعي (Deep Learning Reconstruction = DLR):
شبكة عصبية U-Net مُدرَّبة على أكثر من 100,000 زوج صور. تفصل الإشارة عن الضوضاء بدقة لا تصلها الخوارزميات الكلاسيكية.
الجرعة: 1.5 mSv فقط (مقارنة بـ 20 mSv عام 1972).
دقة إيزوتروبية 0.24 مم × 0.24 مم × 0.24 مم في ثلاثة أبعاد.`,
    compare: 'الحاضر هو التكامل: سرعة فائقة + أقل جرعة + أعلى دقة + إعادة بناء ذكاء اصطناعي حقيقي.',
    specs: [
      { k: 'Matrix', v: '512×512', cls: 'good' },
      { k: 'Scan Time', v: '0.15 sec', cls: 'good' },
      { k: 'Dose', v: '1.5 mSv', cls: 'good' },
      { k: 'Slices/Rot', v: '640', cls: 'good' },
      { k: 'Recon', v: 'AI/DLR', cls: 'good' },
      { k: 'SNR', v: '48 dB', cls: 'good' },
    ],
    dicomTags: [
      ['(0008,0060)', 'Modality', 'CS', 'CT'],
      ['(0008,0021)', 'Series Date', 'DA', '20240901'],
      ['(0008,0031)', 'Series Time', 'TM', '090000'],
      ['(0008,1030)', 'Study Description', 'LO', 'CT BRAIN WITHOUT CONTRAST - AI RECON'],
      ['(0008,0070)', 'Manufacturer', 'LO', 'Siemens Healthineers'],
      ['(0008,1090)', 'Manufacturer Model Name', 'LO', 'SOMATOM X.cite'],
      ['(0018,0050)', 'Slice Thickness', 'DS', '0.6'],
      ['(0018,0060)', 'KVP', 'DS', '120'],
      ['(0018,1151)', 'X-Ray Tube Current', 'IS', '200'],
      ['(0018,5100)', 'Patient Position', 'CS', 'HFS'],
      ['(0018,9089)', 'Reconstruction Method', 'LO', 'Deep Learning Recon (DLR)'],
      ['(0020,0037)', 'Image Orientation (Patient)', 'DS', '1\\0\\0\\0\\1\\0'],
      ['(0028,0010)', 'Rows', 'US', '512'],
      ['(0028,0011)', 'Columns', 'US', '512'],
      ['(0028,0030)', 'Pixel Spacing', 'DS', '0.234\\0.234'],
      ['(0028,1050)', 'Window Center', 'DS', '40'],
      ['(0028,1051)', 'Window Width', 'DS', '400'],
      ['(0028,0100)', 'Bits Allocated', 'US', '16'],
      ['(0028,0101)', 'Bits Stored', 'US', '16'],
      ['(0028,1052)', 'Rescale Intercept', 'DS', '-1024'],
      ['(0028,1053)', 'Rescale Slope', 'DS', '1'],
      ['(0028,0106)', 'Smallest Image Pixel Value', 'US', '0'],
      ['(0028,0107)', 'Largest Image Pixel Value', 'US', '4095'],
    ],
    report: {
      technique:
        'CT brain without intravenous contrast using Siemens SOMATOM X.cite 640-slice scanner. 120kVp, CARE Dose 4D, 0.6mm collimation, Deep Learning Reconstruction (DLR). Axial, coronal, and sagittal reformats reviewed. Effective dose: 1.5 mSv.',
      findings:
        'Excellent image quality with AI-assisted reconstruction. Normal grey-white matter differentiation. Ventricular system symmetric, normal in caliber. Cortical sulci appropriate for age. No intra-axial or extra-axial collections. No midline shift. Basal ganglia, thalami, and brainstem unremarkable. Posterior fossa structures normal. Bony calvaria intact. No acute hemorrhage. No definite acute ischemic change. Orbits and paranasal sinuses grossly clear.',
      impression:
        '1. Normal CT brain without contrast — AI-enhanced DLR acquisition. 2. No acute intracranial pathology. 3. Excellent diagnostic quality — 0.6mm isotropic resolution.',
    },
  },

  future: {
    id: 'future',
    year: '2035+',
    name: 'دراسة الطيف والتروية الرباعية — Multi-Parametric 4D',
    techShort: '35-Slice Multi-Parametric Matrix · FLAIR / DWI / ADC / CBF / SWI',
    scanTime: 0.02,
    matrix: 1024,
    dose: 0.1,
    slices: 35,
    noise: 0.0,
    pixelSize: 0,
    blur: 0,
    kVp: 80,
    mAs: 40,
    imageUrl: 'multiparametric_4d_brain.jpg',
    fallbackUrl: null,
    noisePattern: 'none',
    colormapOverride: 'gray',
    physics: `مصفوفة التصوير الطيفي والرباعي (Multi-Parametric 4D Study) عبر 35 مقطعاً متزامناً:
• الصف الأول: T2 FLAIR (عزل السائل الدماغي للكشف الدقيق عن الوذمات والتصلب اللويحي).
• الصف الثاني: DWI b:1000 (التصوير بالانتشار الحركي لكشف الاحتشاء والسكتات الإقفارية الحادة).
• الصف الثالث: خريطة ADC (المعامل الكمي لانتشار جزيئات الماء داخل الخلايا).
• الصف الرابع: خريطة CBF Perfusion (التروية الدموية الدماغية اللحظية من 0 إلى 150 ml/100g/min).
• الصف الخامس: تسلسل SWI (الكشف المجهري عن الشعيرات الوريدية والنزوف البؤرية الصامتة).
• المحور Z الأفقي: مسح تشريحي كامل من قاعدة الجمجمة (-60 mm) حتى القمة (+60 mm).`,
    compare: 'المستقبل: دمج الطيف المقطعي بالرنين المغناطيسي الوظيفي في فحص شامل فوري واحد.',
    specs: [
      { k: 'Sequences', v: '5 Multiparametric', cls: 'future' },
      { k: 'Matrix View', v: '35 Axial Slices', cls: 'future' },
      { k: 'Resolution', v: '0.11 mm Isotropic', cls: 'future' },
      { k: 'CBF Scale', v: '0-150 ml/100g/min', cls: 'future' },
      { k: 'Recon Model', v: 'AI Neural DLR 4D', cls: 'future' },
      { k: 'Dose', v: '0.1 mSv', cls: 'future' },
    ],
    dicomTags: [
      ['(0008,0060)', 'Modality', 'CS', 'MR + PCD-CT SPECTRAL'],
      ['(0008,0021)', 'Series Date', 'DA', '20250521'],
      ['(0008,1030)', 'Study Description', 'LO', 'BRAIN - MULTI-PARAMETRIC 4D STUDY'],
      ['(0008,0070)', 'Manufacturer', 'LO', 'SIGNA_AURORA_3T / NAEOTOM Ultra'],
      ['(0008,1090)', 'Manufacturer Model Name', 'LO', 'PCD-MR Dual-Energy Hybrid'],
      ['(0018,0050)', 'Slice Thickness', 'DS', '5.0'],
      ['(0018,0088)', 'Spacing Between Slices', 'DS', '6.0'],
      ['(0028,0010)', 'Rows', 'US', '1024'],
      ['(0028,0011)', 'Columns', 'US', '1024'],
      ['(0028,1050)', 'Window Center', 'DS', '128'],
      ['(0028,1051)', 'Window Width', 'DS', '256'],
      ['(0018,9090)', 'Sequences', 'LO', 'T2 FLAIR\\DWI_b1000\\ADC\\CBF_Perfusion\\SWI'],
    ],
    report: {
      technique:
        'Comprehensive Brain Multi-Parametric 4D protocol (Machine: SIGNA_AURORA_3T / PCD Hybrid). Co-registered acquisition of 35 multi-spectral slices spanning T2 FLAIR, DWI (b:1000), ADC map, quantitative CBF Perfusion (0-150 ml/100g/min), and High-Resolution SWI.',
      findings:
        '1. T2 FLAIR: Normal cerebral parenchyma without periventricular hyperintensities or demyelinating lesions. 2. DWI (b:1000) & ADC: No acute restricted diffusion or cytotoxic edema (no acute territorial infarct). 3. CBF Perfusion: Symmetrical, robust cerebral blood flow (55-75 ml/100g/min) across all vascular territories without penumbra or hypo-perfusion. 4. SWI: Intact microvascular architecture; zero microbleeds or intravascular thrombi.',
      impression:
        '1. Normal 4D multi-parametric neurovascular study. 2. No evidence of acute ischemia, restricted diffusion, or microvascular hemorrhage. 3. Symmetrical, optimal cerebral hemodynamics across all 35 volume slices.',
    },
  },
};

/* ─── Proxy helper: route external images through local server to bypass CORS ─── */
function proxyUrl(externalUrl) {
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    return `/proxy?url=${encodeURIComponent(externalUrl)}`;
  }
  return externalUrl;
}

/* scan type → real confirmed Wikimedia CT image URLs */
const SCAN_IMAGE_MAP = {
  multiparametric_4d: 'multiparametric_4d_brain.jpg',
  brain: proxyUrl(
    'https://upload.wikimedia.org/wikipedia/commons/5/50/Computed_tomography_of_human_brain_-_large.png',
  ),
  chest: proxyUrl(
    'https://upload.wikimedia.org/wikipedia/commons/5/57/HR_tomography_of_the_chest_of_an_IPF_patient_1.jpg',
  ),
  spine: proxyUrl(
    'https://upload.wikimedia.org/wikipedia/commons/8/8c/3D_CT_reconstruction_of_human_lumbar_spine_and_sacrum_%28anterior_view%29_-_Navi_Mumbai.jpg',
  ),
  abdomen: proxyUrl('https://upload.wikimedia.org/wikipedia/commons/0/08/CT_Abdomen_Scan.jpg'),
  cardiac: proxyUrl('https://upload.wikimedia.org/wikipedia/commons/d/d0/Ct-angiography.png'),
  historical_1971: proxyUrl(
    'https://upload.wikimedia.org/wikipedia/commons/5/50/Computed_tomography_of_human_brain_-_large.png',
  ),
  polytrauma: proxyUrl(
    'https://upload.wikimedia.org/wikipedia/commons/8/8c/3D_CT_reconstruction_of_human_lumbar_spine_and_sacrum_%28anterior_view%29_-_Navi_Mumbai.jpg',
  ),
  pet: proxyUrl(
    'https://upload.wikimedia.org/wikipedia/commons/9/9d/PET_scan-normal_brain-alzheimers_disease_brain.PNG',
  ),
  sinus: proxyUrl(
    'https://upload.wikimedia.org/wikipedia/commons/5/57/HR_tomography_of_the_chest_of_an_IPF_patient_1.jpg',
  ),
  angiography: proxyUrl('https://upload.wikimedia.org/wikipedia/commons/d/d0/Ct-angiography.png'),
  chest_standard: proxyUrl(
    'https://upload.wikimedia.org/wikipedia/commons/9/9a/COR-2-STND-CHEST-LUNGS.jpg',
  ),
};

/* Detailed clinical metadata, windowing presets, and radiology report content per anatomical scan */
const SCAN_METADATA = {
  multiparametric_4d: {
    title: 'Brain Multi-Parametric 4D Study (35-Slice Matrix)',
    defaultWL: 128,
    defaultWW: 256,
    colormap: 'gray',
    technique:
      'Multi-Parametric 4D study (Machine: SIGNA_AURORA_3T / PCD Hybrid) with 35 co-registered slices across T2 FLAIR, DWI (b:1000), ADC, dynamic CBF Perfusion, and high-resolution SWI.',
    findings:
      'Multi-parametric analysis reveals completely symmetric parenchymal signal, free Brownian water diffusion without cytotoxic restriction, normal hemodynamic perfusion (CBF 55-75 ml/100g/min), and patent microvascular structures without micro-hemorrhages.',
    impression:
      '1. Normal 4D multi-parametric examination. 2. No acute ischemia, restricted diffusion, or microvascular pathology across all 35 matrix slices.',
  },
  brain: {
    title: 'CT Brain (Axial Non-Contrast)',
    defaultWL: 35,
    defaultWW: 80,
    colormap: 'gray',
    technique:
      'Axial contiguous volumetric non-contrast CT acquisition of the head from skull base to vertex with iterative AI denoising.',
    findings:
      'Normal cerebral cortex and deep white matter attenuation. Ventricles and basal cisterns are unremarkable and symmetric. No intra- or extra-axial hemorrhage, mass effect, or midline shift. Calvarium is intact.',
    impression:
      '1. Normal non-contrast CT brain. 2. No acute intracranial hemorrhage, major territorial infarction, or mass effect.',
  },
  chest: {
    title: 'High-Resolution Chest CT (HRCT Lung Window)',
    defaultWL: -600,
    defaultWW: 1500,
    colormap: 'gray',
    technique:
      'Thin-section volumetric high-resolution CT of the thorax acquired at full inspiration. Reconstructed using sharp lung parenchyma kernel.',
    findings:
      'Lung parenchyma demonstrates patent airways down to subsegmental bronchi. Pulmonary vasculature tapers normally without focal oligaemia or congestion. Mediastinal contours, hila, and pleural spaces are clear without effusion or pneumothorax.',
    impression:
      '1. Clear lung parenchyma without focal consolidation or interstitial reticulation. 2. Normal thoracic CT examination.',
  },
  chest_standard: {
    title: 'Standard Chest CT (Mediastinal & Soft Tissue Window)',
    defaultWL: 40,
    defaultWW: 400,
    colormap: 'gray',
    technique: 'Contrast-enhanced multi-slice CT of the chest from lung apices to adrenal glands.',
    findings:
      'Normal cardiac silhouette and pericardium. Major mediastinal vessels (ascending aorta, aortic arch, pulmonary trunk) show normal caliber. No pathological mediastinal or hilar lymphadenopathy.',
    impression:
      '1. Unremarkable contrast-enhanced thoracic CT. 2. No mediastinal mass or adenopathy.',
  },
  spine: {
    title: 'Lumbar Spine 3D CT Reconstruction',
    defaultWL: 500,
    defaultWW: 1800,
    colormap: 'bone',
    technique:
      'Volumetric CT acquisition of the lumbar spine and sacrum with high-resolution bone kernel and 3D surface-rendered multiplanar reformations.',
    findings:
      'Preserved lumbar lordosis. Vertebral body heights and alignment are intact. Intervertebral disc spaces demonstrate normal height without vacuum phenomenon. Facet joints and sacroiliac joints appear smooth and symmetrical. Neural foramina and central spinal canal are patent.',
    impression:
      '1. Structurally intact lumbar spine and sacrum on 3D reconstruction. 2. No acute fracture, subluxation, or high-grade degenerative canal stenosis.',
  },
  abdomen: {
    title: 'CT Abdomen & Pelvis (Portal Venous Phase)',
    defaultWL: 40,
    defaultWW: 400,
    colormap: 'gray',
    technique:
      'Intravenous contrast-enhanced CT of the abdomen and pelvis scanned in the portal venous phase (70s delay).',
    findings:
      'Liver demonstrates homogenous attenuation without focal lesion. Gallbladder, biliary tree, spleen, pancreas, and adrenal glands are normal. Both kidneys excrete contrast symmetrically. Gastrointestinal tract shows normal wall thickness without obstruction or mesenteric lymphadenopathy.',
    impression:
      '1. Normal contrast-enhanced CT examination of the abdomen and pelvis. 2. No solid organ abnormality or acute intra-abdominal process.',
  },
  cardiac: {
    title: 'Coronary CT Angiography (CCTA)',
    defaultWL: 300,
    defaultWW: 600,
    colormap: 'spectral',
    technique:
      'ECG-gated volumetric coronary CT angiography using dual-source 640-slice platform with prospective triggering at 75% R-R interval.',
    findings:
      'Left main coronary artery (LMCA), Left Anterior Descending (LAD), Left Circumflex (LCx), and Right Coronary Artery (RCA) demonstrate wide lumen patency. Zero Agatston coronary artery calcium score (CACS = 0). No non-calcified or mixed soft plaques.',
    impression:
      '1. Coronary Artery Disease - Reporting and Data System: CAD-RADS 0 (No coronary atherosclerosis). 2. Excellent prognostic profile.',
  },
  angiography: {
    title: 'CT Angiography (Coronary & Thoracic Vessels)',
    defaultWL: 300,
    defaultWW: 700,
    colormap: 'hot',
    technique:
      'Bolus-tracked arterial phase CT angiogram with high-flow iodinated contrast injection (5 mL/s).',
    findings:
      'Uniform contrast opacification of the thoracic aorta and principal branching vessels without dissection flap, aneurysm, or intraluminal thrombus. Coronary ostia originate normally.',
    impression:
      '1. Normal vascular CTA reconstruction without evidence of aneurysm, dissection, or critical stenosis.',
  },
  sinus: {
    title: 'Paranasal Sinuses CT (Coronal Bone Window)',
    defaultWL: 400,
    defaultWW: 2000,
    colormap: 'bone',
    technique:
      'Dedicated non-contrast paranasal sinus CT with ultra-thin 0.5mm coronal reformations.',
    findings:
      'Bilateral maxillary, anterior/posterior ethmoid, frontal, and sphenoid sinuses are clear and fully aerated. Osteomeatal complexes (OMC) and sphenoethmoidal recesses are widely patent. Nasal septum is midline. Turbinates are symmetric.',
    impression:
      '1. Fully aerated paranasal sinuses without mucosal thickening or fluid levels. 2. Patent bilateral drainage pathways.',
  },
  historical_1971: {
    title: '1971 Historical Clinical CT (Godfrey Hounsfield EMI Mark I)',
    defaultWL: 40,
    defaultWW: 400,
    colormap: 'gray',
    technique:
      'First clinical CT scan in human history (1971) performed at Atkinson Morley Hospital using the EMI Mark I pencil-beam prototype (80×80 matrix, 300s per slice).',
    findings:
      'Low spatial resolution (80×80 pixels) and prominent ring/streak artifacts characteristic of first-generation translation-rotation scanning. Crudely visualized cerebral hemispheres and calvarial vault.',
    impression:
      '1. Landmark historical first-generation EMI CT scan representing the genesis of medical computed tomography (Nobel Prize in Medicine 1979).',
  },
  polytrauma: {
    title: 'Polytrauma Whole-Body 3D CT Survey',
    defaultWL: 300,
    defaultWW: 800,
    colormap: 'hot',
    technique:
      'Rapid whole-body "pan-scan" trauma protocol with dual-energy split-bolus IV contrast and kinematic 3D volume rendering.',
    findings:
      'Complete skeletal survey demonstrates intact axial and appendicular skeleton. Major thoracic, abdominal, and pelvic vessels intact without active extravasation or pseudoaneurysm.',
    impression:
      '1. Negative whole-body polytrauma CT survey. 2. No surgical osseous injury or internal vascular disruption.',
  },
  pet: {
    title: 'Molecular PET/CT Brain Metabolism',
    defaultWL: 50,
    defaultWW: 120,
    colormap: 'pet',
    technique:
      'F-18 Fluorodeoxyglucose (FDG) molecular PET with photon-counting CT anatomical co-registration.',
    findings:
      'Symmetric, physiological radiotracer uptake throughout cerebral cortical gray matter, basal ganglia, and cerebellar hemispheres. Preserved temporoparietal metabolic activity without hypometabolic deficits.',
    impression:
      '1. Normal cerebral glucose metabolism on molecular PET/CT. 2. No focal metabolic defect suggestive of neurodegenerative disease.',
  },
};

/* ============================================================
   1. COLORMAP LUTs
   ============================================================ */
function buildColormap(name, size = 256) {
  const r = new Uint8Array(size),
    g = new Uint8Array(size),
    b = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    const t = i / (size - 1);
    if (name === 'gray') {
      const v = Math.round(t * 255);
      r[i] = g[i] = b[i] = v;
    } else if (name === 'inverted') {
      const v = Math.round((1 - t) * 255);
      r[i] = g[i] = b[i] = v;
    } else if (name === 'bone') {
      r[i] = Math.round(Math.min(255, t * 255 * 1.05));
      g[i] = Math.round(Math.min(255, t * 245));
      b[i] = Math.round(Math.min(255, 20 + t * 230));
    } else if (name === 'hot') {
      r[i] = Math.round(Math.min(255, t * 3 * 255));
      g[i] = Math.round(Math.min(255, Math.max(0, t * 3 - 1) * 255));
      b[i] = Math.round(Math.min(255, Math.max(0, t * 3 - 2) * 255));
    } else if (name === 'pet') {
      // Blue → Cyan → Green → Yellow → Red
      if (t < 0.25) {
        r[i] = 0;
        g[i] = Math.round((t / 0.25) * 255);
        b[i] = 255;
      } else if (t < 0.5) {
        const s = (t - 0.25) / 0.25;
        r[i] = 0;
        g[i] = 255;
        b[i] = Math.round((1 - s) * 255);
      } else if (t < 0.75) {
        const s = (t - 0.5) / 0.25;
        r[i] = Math.round(s * 255);
        g[i] = 255;
        b[i] = 0;
      } else {
        const s = (t - 0.75) / 0.25;
        r[i] = 255;
        g[i] = Math.round((1 - s) * 255);
        b[i] = 0;
      }
    } else if (name === 'spectral') {
      const hue = (1 - t) * 270;
      const { r: hr, g: hg, b: hb } = hsvToRgb(hue, 1, 1);
      r[i] = hr;
      g[i] = hg;
      b[i] = hb;
    } else {
      const v = Math.round(t * 255);
      r[i] = g[i] = b[i] = v;
    }
  }
  return { r, g, b };
}
function hsvToRgb(h, s, v) {
  const hi = Math.floor(h / 60) % 6,
    f = h / 60 - Math.floor(h / 60);
  const p = v * (1 - s),
    q = v * (1 - f * s),
    t = v * (1 - (1 - f) * s);
  const arr = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ][hi];
  return { r: Math.round(arr[0] * 255), g: Math.round(arr[1] * 255), b: Math.round(arr[2] * 255) };
}

/* ============================================================
   2. IMAGE LOADING & PROCESSING ENGINE
   ============================================================ */
class CtImageEngine {
  constructor(canvas, hudState) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    this.hudState = hudState; // shared object for HUD updates

    // Transform state
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1.0;
    this.rotation = 0; // degrees
    this.flipH = false;

    // WL/WW
    this.wl = 40;
    this.ww = 400;

    // Colormap
    this.colormapName = 'gray';
    this.lut = buildColormap('gray');

    // Source image
    this.sourceImg = null; // HTMLImageElement, loaded once
    this.srcCanvas = null; // offscreen, raw pixels
    this.srcCtx = null;
    this.era = null;

    // Ruler tool state
    this.rulerPoints = [];

    // Drag
    this._drag = false;
    this._dragStart = null;
    this._panStart = null;

    // Animation
    this._rafId = null;
    this._dirty = true;

    // Bind
    this._onWheel = this._onWheel.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onMouseLeave = this._onMouseLeave.bind(this);

    canvas.addEventListener('wheel', this._onWheel, { passive: false });
    canvas.addEventListener('mousedown', this._onMouseDown);
    canvas.addEventListener('mousemove', this._onMouseMove);
    canvas.addEventListener('mouseup', this._onMouseUp);
    canvas.addEventListener('mouseleave', this._onMouseLeave);
    window.addEventListener('mouseup', this._onMouseUp);

    this._startRaf();
  }

  /* ── Load a real image URL (with memory cache for medium internet speed) ── */
  loadImage(url, era) {
    this.era = era;
    let effectiveUrl = url;
    if (
      typeof MULTIPARAMETRIC_4D_B64 !== 'undefined' &&
      (url.includes('multiparametric') || (era && era.id === 'future'))
    ) {
      effectiveUrl = MULTIPARAMETRIC_4D_B64;
    }

    if (!window._IMAGE_CACHE) window._IMAGE_CACHE = {};
    if (window._IMAGE_CACHE[effectiveUrl]) {
      const cached = window._IMAGE_CACHE[effectiveUrl];
      this.sourceImg = cached;
      this.srcCanvas = document.createElement('canvas');
      this.srcCanvas.width = cached.naturalWidth || 800;
      this.srcCanvas.height = cached.naturalHeight || 800;
      this.srcCtx = this.srcCanvas.getContext('2d', { willReadFrequently: true });
      this.srcCtx.drawImage(cached, 0, 0);
      this.resetView();
      this._dirty = true;
      return;
    }

    const img = new Image();
    // Only set crossOrigin for remote HTTP URLs when not on file:// protocol and not data URI
    if (
      location.protocol !== 'file:' &&
      !effectiveUrl.startsWith('data:') &&
      (effectiveUrl.startsWith('http://') ||
        effectiveUrl.startsWith('https://') ||
        effectiveUrl.startsWith('//'))
    ) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      window._IMAGE_CACHE[effectiveUrl] = img;
      this.sourceImg = img;
      // Build offscreen canvas from raw image
      this.srcCanvas = document.createElement('canvas');
      this.srcCanvas.width = img.naturalWidth || 800;
      this.srcCanvas.height = img.naturalHeight || 800;
      this.srcCtx = this.srcCanvas.getContext('2d', { willReadFrequently: true });
      this.srcCtx.drawImage(img, 0, 0);
      this.resetView();
      this._dirty = true;
    };
    img.onerror = () => {
      console.warn('Image load failed, trying embedded data fallback:', url);
      if (
        typeof MULTIPARAMETRIC_4D_B64 !== 'undefined' &&
        effectiveUrl !== MULTIPARAMETRIC_4D_B64
      ) {
        img.src = MULTIPARAMETRIC_4D_B64;
      } else {
        this._drawError(url);
      }
    };
    img.src = effectiveUrl;
  }

  /* ── Load local file blob ── */
  loadBlob(blob) {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      this.sourceImg = img;
      this.srcCanvas = document.createElement('canvas');
      this.srcCanvas.width = img.naturalWidth;
      this.srcCanvas.height = img.naturalHeight;
      this.srcCtx = this.srcCanvas.getContext('2d', { willReadFrequently: true });
      this.srcCtx.drawImage(img, 0, 0);
      this.resetView();
      this._dirty = true;
    };
    img.src = url;
  }

  setColormap(name) {
    this.colormapName = name;
    this.lut = buildColormap(name);
    this._dirty = true;
  }
  setWL(wl, ww) {
    this.wl = wl;
    this.ww = ww;
    this._dirty = true;
  }
  setActiveTool(tool) {
    this.activeTool = tool;
  }

  resetView() {
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1.0;
    this.rotation = 0;
    this.flipH = false;
    this.rulerPoints = [];
    this._dirty = true;
  }
  rotateBy(deg) {
    this.rotation = (this.rotation + deg) % 360;
    this._dirty = true;
  }
  flip() {
    this.flipH = !this.flipH;
    this._dirty = true;
  }

  /* ── RAF render loop ── */
  _startRaf() {
    const tick = () => {
      if (this._dirty) {
        this._render();
        this._dirty = false;
      }
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }
  destroy() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
  }

  /* ── Core render ── */
  _render() {
    const canvas = this.canvas;
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    if (!this.srcCanvas || !this.era) return;

    const scale = Math.min(w / this.srcCanvas.width, h / this.srcCanvas.height) * 0.92;

    if (State.curtainActive) {
      // ─── CURTAIN SPLIT RENDER ───
      const splitX = Math.round(w * State.curtainPos);

      // Left Frame: Old Era (1972 EMI)
      const leftEra = ERA_DB.era1;
      const leftFrame = this._buildFrame(leftEra, 70, 'std');

      // Right Frame: Advanced Era (Present/Future with active Spectral & Material filters)
      const rightEra = this.era.id === 'era1' || this.era.id === 'era2' ? ERA_DB.present : this.era;
      const rightFrame = this._buildFrame(rightEra, State.selectedKeV, State.selectedMaterial);

      // Draw Left Side (0 .. splitX)
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, splitX, h);
      ctx.clip();
      ctx.translate(w / 2 + this.panX, h / 2 + this.panY);
      ctx.rotate((this.rotation * Math.PI) / 180);
      if (this.flipH) ctx.scale(-1, 1);
      ctx.scale(this.zoom * scale, this.zoom * scale);
      ctx.drawImage(leftFrame, -leftFrame.width / 2, -leftFrame.height / 2);
      ctx.restore();

      // Draw Right Side (splitX .. w)
      ctx.save();
      ctx.beginPath();
      ctx.rect(splitX, 0, w - splitX, h);
      ctx.clip();
      ctx.translate(w / 2 + this.panX, h / 2 + this.panY);
      ctx.rotate((this.rotation * Math.PI) / 180);
      if (this.flipH) ctx.scale(-1, 1);
      ctx.scale(this.zoom * scale, this.zoom * scale);
      ctx.drawImage(rightFrame, -rightFrame.width / 2, -rightFrame.height / 2);
      ctx.restore();

      // Update DOM Curtain Line
      const curtainLine = $('curtainLine');
      if (curtainLine) {
        curtainLine.style.left = `${State.curtainPos * 100}%`;
      }
    } else {
      // ─── STANDARD SINGLE/MPR RENDER ───
      const frame = this._buildFrame(this.era, State.selectedKeV, State.selectedMaterial);

      ctx.save();
      ctx.translate(w / 2 + this.panX, h / 2 + this.panY);
      ctx.rotate((this.rotation * Math.PI) / 180);
      if (this.flipH) ctx.scale(-1, 1);
      ctx.scale(this.zoom * scale, this.zoom * scale);
      ctx.drawImage(frame, -frame.width / 2, -frame.height / 2);
      ctx.restore();
    }

    // Update HUD zoom
    if (this.hudState) {
      this.hudState.zoom = this.zoom.toFixed(1);
      this.hudState.dirty = true;
    }
  }

  /* ── Build processed frame: authentic physical artifacts & era display simulation ── */
  _buildFrame(targetEra, targetKeV = 70, targetMat = 'std') {
    const era = targetEra || this.era;
    const isEra1 = era.id === 'era1';
    const isEra2 = era.id === 'era2';
    const isEra3 = era.id === 'era3';
    const isPresent = era.id === 'present';
    const isFuture = era.id === 'future';

    const src = this.srcCanvas;
    const srcW = src.width,
      srcH = src.height;

    // Fast-path for 4D Multi-Parametric study (preserves raw RGB sequences & rainbow CBF map)
    if (
      isFuture &&
      State.currentScanType === 'multiparametric_4d' &&
      targetMat === 'std' &&
      this.colormapName === 'gray' &&
      targetKeV === 70
    ) {
      return src;
    }

    // ── 1. MATRIX RESAMPLING ──
    let targetMatrix = era.matrix || 512;
    if (isFuture) targetMatrix = 1024;

    let processW = srcW,
      processH = srcH;
    let processCanvas = document.createElement('canvas');

    if (targetMatrix < 512) {
      // Coarse low-res matrix: downsample without smoothing, then upscale blockily
      const tmpW = targetMatrix;
      const tmpH = Math.round((targetMatrix / srcW) * srcH);
      const tmp = document.createElement('canvas');
      tmp.width = tmpW;
      tmp.height = tmpH;
      const tc = tmp.getContext('2d');
      tc.imageSmoothingEnabled = false;
      tc.drawImage(src, 0, 0, tmpW, tmpH);

      processCanvas.width = srcW;
      processCanvas.height = srcH;
      const pc = processCanvas.getContext('2d');
      pc.imageSmoothingEnabled = false; // keep crisp square pixels
      pc.drawImage(tmp, 0, 0, srcW, srcH);
      processW = srcW;
      processH = srcH;
    } else {
      processCanvas.width = srcW;
      processCanvas.height = srcH;
      processCanvas.getContext('2d').drawImage(src, 0, 0);
    }

    // ── 2. GAUSSIAN OPTICAL BLUR (Low-res collimator spread) ──
    if (era.blur > 0) {
      const pCtx = processCanvas.getContext('2d');
      pCtx.filter = `blur(${era.blur}px)`;
      const tmp2 = document.createElement('canvas');
      tmp2.width = processW;
      tmp2.height = processH;
      tmp2.getContext('2d').drawImage(processCanvas, 0, 0);
      pCtx.filter = 'none';
      pCtx.clearRect(0, 0, processW, processH);
      pCtx.drawImage(tmp2, 0, 0);
    }

    // Read pixel buffer with fallback for file:// protocol security restrictions
    const pCtx = processCanvas.getContext('2d', { willReadFrequently: true });
    let imgData;
    try {
      imgData = pCtx.getImageData(0, 0, processW, processH);
    } catch (e) {
      console.warn('Canvas pixel read restricted on file://, rendering direct canvas:', e);
      return processCanvas;
    }
    const data = imgData.data;

    const cx = processW / 2;
    const cy = processH / 2;
    const maxR = Math.min(cx, cy) * 0.94;

    // ── 3. WINDOWING & PHYSICAL ARTIFACTS ──
    const wl = this.wl,
      ww = this.ww;
    const wMin = wl - ww / 2,
      wMax = wl + ww / 2;
    const lut = this.lut;

    for (let py = 0; py < processH; py++) {
      const dy = py - cy;
      for (let px = 0; px < processW; px++) {
        const i = (py * processW + px) * 4;
        const dx = px - cx;
        const dist = Math.hypot(dx, dy);
        const normDist = dist / maxR;

        // Circular Scanning Aperture (Authentic 1972 CRT Oscilloscope FOV Mask)
        if (isEra1 && normDist > 1.0) {
          // Outside FOV: pitch black CRT raster with faint CRT noise
          const crtNoise = Math.random() < 0.04 ? Math.floor(Math.random() * 15) : 0;
          data[i] = 0;
          data[i + 1] = crtNoise; // subtle green raster
          data[i + 2] = 0;
          continue;
        }

        let lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

        // ─── ERA 1 (1972 EMI): BEAM HARDENING CUPPING & FBP RADIAL STREAKS ───
        if (isEra1) {
          // Cupping artifact (center is darker due to low-kVp polychromatic beam attenuation)
          if (normDist <= 1.0) {
            lum *= 0.78 + 0.22 * normDist * normDist;
          }
          // FBP Radial Star/Streak artifacts (18 rays emanating from bone)
          const angle = Math.atan2(dy, dx);
          const streak = Math.sin(angle * 18) * 12 * Math.min(1.0, normDist * 1.5);
          lum += streak;
        }

        // ─── ERA 2 (1982 FAN BEAM): CONCENTRIC RING ARTIFACTS ───
        if (isEra2) {
          // Characteristic concentric detector ring artifact
          if (Math.abs(dist - maxR * 0.42) < 2.2) lum += 24;
          if (Math.abs(dist - maxR * 0.68) < 1.8) lum -= 18;
          if (Math.abs(dist - maxR * 0.85) < 1.5) lum += 15;
        }

        // ─── ERA 3 (1998 HELICAL): FBP GRAIN & HELICAL WINDMILL RIPPLES ───
        if (isEra3) {
          const angle = Math.atan2(dy, dx);
          // Characteristic helical cone-beam windmill artifact radiating around skull/bone
          const windmill = Math.sin(angle * 14 + dist * 0.05) * 10 * Math.min(1.0, normDist * 1.3);
          lum += windmill;
        }

        // ─── PRESENT (2024 AI DLR): NEURAL EDGE ENHANCEMENT & PRISTINE BACKGROUND ───
        if (isPresent) {
          // AI Neural DLR: razor-sharp cortical/trabecular edges + enhanced grey/white matter gradient
          if (lum > 130) {
            lum = Math.min(255, lum * 1.16);
          } else if (lum > 35) {
            lum = lum * 1.04;
          }
        }

        // ─── SPECTRAL ENERGY (keV) FOR 2024 / 2035 ───
        if (isPresent || isFuture) {
          if (targetKeV === 40) {
            // 40 keV: Boost contrast & iodine attenuation
            if (lum > 70) lum = Math.min(255, lum * 1.34);
          } else if (targetKeV === 100) {
            // 100 keV: Sharpen bone trabeculae and reduce streaks
            if (lum > 130) lum = Math.min(255, lum * 1.14);
            else lum = Math.max(0, lum * 0.9);
          } else if (targetKeV === 140) {
            // 140 keV: Ultra-deep penetration
            lum = Math.min(240, lum * 0.92);
          }

          // ─── MATERIAL DECOMPOSITION ───
          if (targetMat === 'vnc') {
            // Virtual Non-Contrast: suppress calcification / dense bone
            if (lum > 165) lum = 80 + (lum - 165) * 0.15;
          }
        }

        // Standard HU windowing
        lum = Math.max(0, Math.min(255, ((lum - wMin) / (wMax - wMin)) * 255));

        // Quantum Poisson Noise per Era
        const noiseAmp = era.noise * 85;
        if (noiseAmp > 0) {
          const noise = (Math.random() - 0.5) * 2 * noiseAmp;
          lum = Math.max(0, Math.min(255, lum + noise));
        }

        const idx = Math.round(lum);

        // ─── PHOSPHOR / COLORMAP PALETTES ───
        if (isEra1 && this.colormapName === 'gray') {
          // Authentic 1972 P31 Green Oscilloscope Phosphor Display
          data[i] = Math.round(idx * 0.25);
          data[i + 1] = Math.round(idx * 0.95);
          data[i + 2] = Math.round(idx * 0.35);
        } else if (isEra2 && this.colormapName === 'gray') {
          // Authentic 1982 P4 Blue-White Monochrome CRT Display
          data[i] = Math.round(idx * 0.88);
          data[i + 1] = Math.round(idx * 0.94);
          data[i + 2] = Math.round(idx * 1.0);
        } else if (targetMat === 'iodine') {
          // Iodine Perfusion Map: gold/amber vascular glow
          if (idx > 100) {
            data[i] = Math.min(255, Math.round(idx * 1.35));
            data[i + 1] = Math.round(idx * 0.72);
            data[i + 2] = Math.round(idx * 0.08);
          } else {
            data[i] = data[i + 1] = data[i + 2] = Math.round(idx * 0.45);
          }
        } else if (targetMat === 'kedge') {
          // K-Edge Nanoparticle Spectral Tagging: neon cyan luminescence
          if (idx > 120) {
            data[i] = 0;
            data[i + 1] = Math.min(255, Math.round(idx * 1.25));
            data[i + 2] = 255;
          } else {
            data[i] = data[i + 1] = data[i + 2] = Math.round(idx * 0.55);
          }
        } else {
          data[i] = lut.r[idx];
          data[i + 1] = lut.g[idx];
          data[i + 2] = lut.b[idx];
        }
      }
    }
    pCtx.putImageData(imgData, 0, 0);

    return processCanvas;
  }

  /* ── HU probe ── */
  probeHU(x, y) {
    if (!this.srcCanvas) return null;
    const canvas = this.canvas;
    const w = canvas.width,
      h = canvas.height;
    const scale = Math.min(w / this.srcCanvas.width, h / this.srcCanvas.height) * 0.92 * this.zoom;
    const cx = w / 2 + this.panX,
      cy = h / 2 + this.panY;
    const imgX = Math.round((x - cx) / scale + this.srcCanvas.width / 2);
    const imgY = Math.round((y - cy) / scale + this.srcCanvas.height / 2);
    if (imgX < 0 || imgX >= this.srcCanvas.width || imgY < 0 || imgY >= this.srcCanvas.height)
      return null;
    const px = this.srcCtx.getImageData(imgX, imgY, 1, 1).data;
    const lum = Math.round(0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2]);
    // Simulate HU from luminance (0=air -1000HU, 255=dense bone ~1500HU)
    const hu = Math.round(lum * (2500 / 255) - 1024);
    const tissue = huToTissue(hu);
    return { hu, tissue, x: imgX, y: imgY, px: [px[0], px[1], px[2]] };
  }

  /* ── Ruler: return mm measurement ── */
  addRulerPoint(x, y) {
    this.rulerPoints.push({ x, y });
    if (this.rulerPoints.length >= 2) {
      const a = this.rulerPoints[0],
        b = this.rulerPoints[1];
      const pxDist = Math.hypot(b.x - a.x, b.y - a.y);
      const mmPerPx = this.era?.pixelSize || 0.234;
      const mm = ((pxDist * mmPerPx) / this.zoom).toFixed(1);
      this.rulerPoints = [];
      return mm;
    }
    return null;
  }

  /* ── Mouse / wheel events ── */
  _onWheel(e) {
    e.preventDefault();
    this.zoom = Math.max(0.2, Math.min(8, this.zoom * (e.deltaY > 0 ? 0.92 : 1.09)));
    this._dirty = true;
  }
  _onMouseDown(e) {
    this._drag = true;
    this._dragStart = { x: e.clientX, y: e.clientY };
    this._panStart = { x: this.panX, y: this.panY };
  }
  _onMouseMove(e) {
    if (!this._drag) return;
    const dx = e.clientX - this._dragStart.x;
    const dy = e.clientY - this._dragStart.y;
    this.panX = this._panStart.x + dx;
    this.panY = this._panStart.y + dy;
    this._dirty = true;
  }
  _onMouseUp() {
    this._drag = false;
  }
  _onMouseLeave() {
    this._drag = false;
  }

  _drawError(url) {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth || 400,
      h = this.canvas.clientHeight || 400;
    this.canvas.width = w;
    this.canvas.height = h;
    ctx.fillStyle = '#030712';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#374151';
    ctx.font = '14px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('⚠ Image load failed — check CORS', w / 2, h / 2 - 20);
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillStyle = '#1e2d44';
    ctx.fillText(url.slice(0, 60), w / 2, h / 2 + 10);
  }

  /* ── Export snapshot ── */
  exportPng(filename) {
    this.canvas.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename || 'ct-scan.png';
      a.click();
    });
  }
}

/* ============================================================
   3. HU → TISSUE LABEL
   ============================================================ */
function huToTissue(hu) {
  if (hu < -900) return 'Air';
  if (hu < -600) return 'Lung';
  if (hu < -100) return 'Fat';
  if (hu < 20) return 'Water/CSF';
  if (hu < 50) return 'Brain';
  if (hu < 80) return 'Blood';
  if (hu < 200) return 'Soft Tissue';
  if (hu < 400) return 'Cartilage';
  if (hu < 700) return 'Spongy Bone';
  return 'Cortical Bone';
}

/* ============================================================
   4. APP STATE
   ============================================================ */
const State = {
  currentEraId: 'present',
  currentScanType: 'brain',
  currentTool: 'pan',
  colormapName: 'gray',
  compareMode: false,
  curtainActive: false,
  curtainPos: 0.5,
  selectedKeV: 70,
  selectedMaterial: 'std',
  aiCadActive: false,
  sciPanelOpen: false,
  sciTab: 'future_tech',
  cinePlay: false,
  cineFps: 5,
  sliceCurrent: 8,
  sliceTotal: 16,
  wl: 40,
  ww: 400,
  hudZoom: '1.0',

  engine: null, // CtImageEngine (primary)
  engineSec: null, // CtImageEngine (secondary)
  cineTimer: null,
};

/* ============================================================
   5. DOM REFS
   ============================================================ */
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

/* ============================================================
   6. SPLASH ANIMATION
   ============================================================ */
function runSplash() {
  const fill = $('splashFill');
  const step = $('splashStep');
  const steps = [
    [10, 'تهيئة محرك الأشعة المقطعية...'],
    [25, 'تحميل قاعدة بيانات العصور والأشعة الحقيقية...'],
    [45, 'تهيئة خوارزميات العد الفوتوني (PCD-CT)...'],
    [65, 'بناء LUT وتحليل الطيف متعدد الطاقة...'],
    [80, 'تجهيز شبكات الذكاء الاصطناعي (DLR CAD)...'],
    [95, 'جاهز!'],
  ];
  let i = 0;
  const go = () => {
    if (i >= steps.length) {
      setTimeout(() => {
        document.getElementById('splash').style.opacity = '0';
        setTimeout(() => {
          document.getElementById('splash').remove();
          document.getElementById('app').classList.remove('hidden');
          initApp();
        }, 500);
      }, 300);
      return;
    }
    fill.style.width = steps[i][0] + '%';
    step.textContent = steps[i][1];
    i++;
    setTimeout(go, 240 + Math.random() * 180);
  };
  go();
}

/* ============================================================
   7. APP INIT
   ============================================================ */
function initApp() {
  // Create primary engine
  const hudState = { zoom: '1.0', dirty: false };
  State.engine = new CtImageEngine($('primaryCanvas'), hudState);
  State.engineSec = new CtImageEngine($('secondaryCanvas'), null);

  // Load initial present scan (2024 AI Recon)
  State.currentEraId = 'present';
  State.currentScanType = 'brain';
  if ($('scanSelect')) $('scanSelect').value = 'brain';
  $$('.era-btn').forEach((b) => b.classList.toggle('active', b.dataset.era === 'present'));

  loadScanForEra('present');
  updateScientificPanel('present');
  updateReportPanel();
  updateTelemetryBox('present');
  setDate();

  // Wire up all controls
  wireToolbar();
  wireEraTimeline();
  wireScanSelect();
  wireCompareMode();
  wireCurtainMode();
  wireSpectralControls();
  wireAiCad();
  wireSciPanel();
  wireCineBar();
  wireDicomModal();
  wireFileInput();
  wireExport();
  wireMouseHU();

  // Initial HUD
  updateHUD('present');
}

/* ============================================================
   8. ERA SWITCHING
   ============================================================ */
function switchEra(eraId) {
  if (!ERA_DB[eraId]) return;
  State.currentEraId = eraId;
  const era = ERA_DB[eraId];

  // Auto-switch scan type to match future multi-parametric 4D
  if (eraId === 'future') {
    State.currentScanType = 'multiparametric_4d';
    if ($('scanSelect')) $('scanSelect').value = 'multiparametric_4d';
  } else if (State.currentScanType === 'multiparametric_4d') {
    State.currentScanType = 'brain';
    if ($('scanSelect')) $('scanSelect').value = 'brain';
  }

  // Active button
  $$('.era-btn').forEach((b) => b.classList.toggle('active', b.dataset.era === eraId));

  // Sweep animation
  animateSweep();

  // Load image
  loadScanForEra(eraId);

  // Apply colormap override (e.g. future PET)
  const cm = era.colormapOverride || 'gray';
  $('colormapSelect').value = cm;
  State.engine.setColormap(cm);
  State.colormapName = cm;

  // Noise class on viewport
  const vp = document.getElementById('viewportPrimary');
  vp.classList.toggle('noise-heavy', era.noisePattern === 'heavy');

  // Update panels & telemetry
  updateScientificPanel(eraId);
  updateHUD(eraId);
  updatePhysicsHUD(era);
  updateTelemetryBox(eraId);
  updateReportPanel();
  if (State.aiCadActive) renderAiCad();
}

function loadScanForEra(eraId) {
  const era = ERA_DB[eraId];
  const meta = SCAN_METADATA[State.currentScanType] || SCAN_METADATA.brain;
  const url = SCAN_IMAGE_MAP[State.currentScanType] || era.imageUrl;

  State.engine.era = era;
  State.engine.loadImage(url, era);

  // Set default WL/WW from scan metadata
  State.wl = meta.defaultWL;
  State.ww = meta.defaultWW;
  State.engine.setWL(State.wl, State.ww);

  // Set default colormap if not customized
  const targetColormap = era.colormapOverride || meta.colormap || 'gray';
  $('colormapSelect').value = targetColormap;
  State.colormapName = targetColormap;
  State.engine.setColormap(targetColormap);

  // Update secondary engine if in compare mode
  if (State.compareMode && State.engineSec) {
    const secEraId = $('secondaryEraSelect').value;
    const secEra = ERA_DB[secEraId] || ERA_DB.era1;
    State.engineSec.era = secEra;
    State.engineSec.loadImage(url, secEra);
    State.engineSec.setWL(State.wl, State.ww);
    State.engineSec.setColormap(targetColormap);
  }

  updateHUD(eraId);
  updateReportPanel();
}

/* ============================================================
   9. HUD UPDATE
   ============================================================ */
function updateHUD(eraId) {
  const era = ERA_DB[eraId];
  const meta = SCAN_METADATA[State.currentScanType] || SCAN_METADATA.brain;
  $('hudModality').textContent =
    `CT · ${meta.title.split(' ')[1] || 'Axial'} · ${era.kVp} kVp · ${era.mAs} mAs`;
  $('hudWWWL').textContent = `WL: ${State.wl}  WW: ${State.ww}`;
  $('hudMatrix').textContent = `${era.matrix}×${era.matrix} · Int16`;
  $('hudReconHud').textContent =
    `Recon: ${era.techShort.split(' · ').slice(-1)[0] || era.techShort}`;
  $('hudSliceNum').textContent = `Slice: ${State.sliceCurrent} / ${State.sliceTotal}`;
  $('hudZoom').textContent = `Zoom: ${State.hudZoom}×`;
  $('hudPatientId').textContent =
    `ID: CT-${era.year}-${State.currentScanType.toUpperCase().slice(0, 4)} · 054Y M`;
}
function updatePhysicsHUD(era) {
  $('phyDose').textContent = era.dose + ' mSv';
  $('phySpeed').textContent = era.scanTime + (era.scanTime >= 1 ? 's' : 's');
  $('phyMatrix').textContent = era.matrix + '²';
  $('phyRecon').textContent = era.techShort.split('·').slice(-1)[0].trim();
}

/* ============================================================
   10. SWEEP ANIMATION (scanner line visual)
   ============================================================ */
function animateSweep() {
  const sweepEl = $('sweepLine');
  const viewport = $('viewportPrimary');
  sweepEl.classList.add('scanning');
  sweepEl.style.transition = 'none';
  sweepEl.style.top = '0%';
  setTimeout(() => {
    sweepEl.style.transition = `top 1.6s linear`;
    sweepEl.style.top = '100%';
  }, 30);
  setTimeout(() => {
    sweepEl.classList.remove('scanning');
    sweepEl.style.transition = 'none';
  }, 1700);
}

/* ============================================================
   11. SCIENTIFIC PANEL
   ============================================================ */
function updateScientificPanel(eraId) {
  const era = ERA_DB[eraId];
  $('eraCardYear').textContent = era.year;
  $('eraCardTitle').textContent = era.name;
  $('eraCardTech').textContent = era.techShort;

  $('sciPhysicsText').textContent = era.physics;
  $('sciCompareText').textContent = era.compare;

  // Specs
  const grid = $('sciSpecsGrid');
  grid.innerHTML = era.specs
    .map(
      (s) =>
        `<div class="spec-item">
       <div class="spec-k">${s.k}</div>
       <div class="spec-v ${s.cls || ''}">${s.v}</div>
     </div>`,
    )
    .join('');
}

function updateReportPanel() {
  const era = ERA_DB[State.currentEraId];
  const meta = SCAN_METADATA[State.currentScanType] || SCAN_METADATA.brain;
  $('repDate').textContent = new Date().toISOString().slice(0, 10);
  $('repScan').textContent = meta.title;
  $('repEra').textContent = era.year + ' — ' + era.name;
  $('repTechnique').textContent =
    `${meta.technique} (Reconstruction: ${era.techShort}, kVp: ${era.kVp}, Matrix: ${era.matrix}×${era.matrix}, Dose: ${era.dose} mSv).`;
  $('repFindings').textContent =
    `${meta.findings} ${era.noise > 0.2 ? 'Note: Image detail is limited by era acquisition noise and matrix resolution.' : 'Image quality optimal with high diagnostic SNR.'}`;
  $('repImpression').textContent =
    `${meta.impression} [Study acquired under ${era.year} ${era.name} parameters].`;
}

function setDate() {
  $('hudStudyDate').textContent = 'Study: ' + new Date().toISOString().slice(0, 10);
}

/* ============================================================
   12. DICOM MODAL
   ============================================================ */
function openDicomModal() {
  const era = ERA_DB[State.currentEraId];
  const tbody = $('dicomTableBody');
  tbody.innerHTML = era.dicomTags
    .map(
      ([tag, name, vr, val]) =>
        `<tr><td>${tag}</td><td>${name}</td><td>${vr}</td><td>${val}</td></tr>`,
    )
    .join('');
  $('overlay').classList.remove('hidden');
  $('dicomModal').classList.remove('hidden');
}
function closeDicomModal() {
  $('overlay').classList.add('hidden');
  $('dicomModal').classList.add('hidden');
}
function wireDicomModal() {
  $('btnDicomTags').onclick = openDicomModal;
  $('dicomModalClose').onclick = closeDicomModal;
  $('overlay').onclick = closeDicomModal;
}

/* ============================================================
   13. WIRE TOOLBAR
   ============================================================ */
function wireToolbar() {
  // Tool buttons
  $$('[data-tool]').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('[data-tool]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      State.currentTool = btn.dataset.tool;
      State.engine.setActiveTool(State.currentTool);
      // Cursor
      const cursorMap = { pan: 'grab', ruler: 'crosshair', hu: 'cell', hotspot: 'default' };
      $('primaryCanvas').style.cursor = cursorMap[State.currentTool] || 'crosshair';
    });
  });

  // Window presets
  $$('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const wl = parseInt(btn.dataset.wl),
        ww = parseInt(btn.dataset.ww);
      State.wl = wl;
      State.ww = ww;
      State.engine.setWL(wl, ww);
      $('hudWWWL').textContent = `WL: ${wl}  WW: ${ww}`;
    });
  });

  // Colormap
  $('colormapSelect').onchange = (e) => {
    const name = e.target.value;
    State.colormapName = name;
    State.engine.setColormap(name);
    if (State.compareMode) State.engineSec.setColormap(name);
  };

  // View modes
  $('viewSingle').onclick = () => {
    $$('[data-view]').forEach((b) => b.classList.remove('active'));
    $('viewSingle').classList.add('active');
    $('viewportSecondary').classList.add('hidden');
    State.compareMode = false;
  };
  $('viewMpr').onclick = () => {
    $$('[data-view]').forEach((b) => b.classList.remove('active'));
    $('viewMpr').classList.add('active');
    // MPR simulated via compare for now
    openCompareMode();
  };

  // Rotate/Flip/Reset
  $('btnRotCcw').onclick = () => {
    State.engine.rotateBy(-90);
  };
  $('btnRotCw').onclick = () => {
    State.engine.rotateBy(90);
  };
  $('btnFlip').onclick = () => {
    State.engine.flip();
  };
  $('btnReset').onclick = () => {
    State.engine.resetView();
    $('rulerSvg').innerHTML = '';
  };

  // Export
  $('btnExport').onclick = () => wireExport();
}

/* ============================================================
   14. ERA TIMELINE
   ============================================================ */
function wireEraTimeline() {
  $$('.era-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchEra(btn.dataset.era));
  });
}

/* ============================================================
   15. SCAN SELECT
   ============================================================ */
function wireScanSelect() {
  $('scanSelect').onchange = (e) => {
    State.currentScanType = e.target.value;
    // Force era1 image when user picks historical_1971
    if (State.currentScanType === 'historical_1971') {
      switchEra('era1');
    } else if (State.currentScanType === 'multiparametric_4d' || State.currentScanType === 'pet') {
      switchEra('future');
    } else {
      loadScanForEra(State.currentEraId);
    }
    updateReportPanel();
  };
}

/* ============================================================
   16. COMPARE MODE
   ============================================================ */
function wireCompareMode() {
  $('btnCompare').onclick = () => {
    if (State.compareMode) {
      closeCompareMode();
    } else {
      openCompareMode();
    }
  };
  $('secondaryEraSelect').onchange = (e) => {
    const secEra = ERA_DB[e.target.value];
    if (secEra) {
      const url = SCAN_IMAGE_MAP[State.currentScanType] || secEra.imageUrl;
      State.engineSec.era = secEra;
      State.engineSec.loadImage(url, secEra);
      State.engineSec.setWL(State.wl, State.ww);
      State.engineSec.setColormap(State.colormapName);
      $('hudEraSecondary').textContent = secEra.year + ' — ' + secEra.name;
      $('hudMatrixSec').textContent = secEra.matrix + '×' + secEra.matrix;
    }
  };
}
function openCompareMode() {
  State.compareMode = true;
  $('viewportSecondary').classList.remove('hidden');
  $('btnCompare').classList.add('active');
  const secEraId = $('secondaryEraSelect').value;
  const secEra = ERA_DB[secEraId] || ERA_DB.era1;
  const url = SCAN_IMAGE_MAP[State.currentScanType] || secEra.imageUrl;
  State.engineSec.era = secEra;
  State.engineSec.loadImage(url, secEra);
  State.engineSec.setWL(State.wl, State.ww);
  State.engineSec.setColormap(State.colormapName);
  $('hudEraSecondary').textContent = secEra.year + ' — ' + secEra.name;
  $('hudMatrixSec').textContent = secEra.matrix + '×' + secEra.matrix;
}
function closeCompareMode() {
  State.compareMode = false;
  $('viewportSecondary').classList.add('hidden');
  $('btnCompare').classList.remove('active');
}

/* ============================================================
   17. CURTAIN SPLIT SWIPE MODE
   ============================================================ */
function wireCurtainMode() {
  const btn = $('btnCurtain');
  const overlay = $('curtainOverlay');
  const canvas = $('primaryCanvas');

  btn.onclick = () => {
    State.curtainActive = !State.curtainActive;
    btn.classList.toggle('active', State.curtainActive);
    overlay.classList.toggle('hidden', !State.curtainActive);

    // Update labels
    $('curtainBadgeLeft').textContent = '1972 EMI Mark I (80×80 FBP)';
    $('curtainBadgeRight').textContent =
      `${ERA_DB[State.currentEraId].year} ${ERA_DB[State.currentEraId].name}`;

    State.engine._dirty = true;
  };

  // Dragging curtain divider
  let dragging = false;
  const updatePos = (clientX) => {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    State.curtainPos = Math.max(0.05, Math.min(0.95, x / rect.width));
    State.engine._dirty = true;
  };

  overlay.addEventListener('mousedown', (e) => {
    dragging = true;
    updatePos(e.clientX);
  });
  window.addEventListener('mousemove', (e) => {
    if (dragging) updatePos(e.clientX);
  });
  window.addEventListener('mouseup', () => {
    dragging = false;
  });

  // Touch support for mobile/tablets
  overlay.addEventListener(
    'touchstart',
    (e) => {
      dragging = true;
      if (e.touches[0]) updatePos(e.touches[0].clientX);
    },
    { passive: true },
  );
  window.addEventListener(
    'touchmove',
    (e) => {
      if (dragging && e.touches[0]) updatePos(e.touches[0].clientX);
    },
    { passive: true },
  );
  window.addEventListener('touchend', () => {
    dragging = false;
  });
}

/* ============================================================
   18. ADVANCED SPECTRAL & MATERIAL CONTROLS
   ============================================================ */
function wireSpectralControls() {
  // Sequence buttons (4D Multi-parametric)
  $$('[data-seq]').forEach((btn) => {
    btn.onclick = () => {
      $$('[data-seq]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const seq = btn.dataset.seq;
      State.selectedSeq = seq;

      if (State.engine) {
        if (seq === 'all') {
          State.engine.zoom = 1.0;
          State.engine.panY = 0;
          State.engine.panX = 0;
        } else if (seq === 'flair') {
          State.engine.zoom = 2.6;
          State.engine.panY = 280;
          State.engine.panX = 0;
        } else if (seq === 'dwi') {
          State.engine.zoom = 2.6;
          State.engine.panY = 140;
          State.engine.panX = 0;
        } else if (seq === 'adc') {
          State.engine.zoom = 2.6;
          State.engine.panY = 0;
          State.engine.panX = 0;
        } else if (seq === 'cbf') {
          State.engine.zoom = 2.6;
          State.engine.panY = -140;
          State.engine.panX = 0;
        } else if (seq === 'swi') {
          State.engine.zoom = 2.6;
          State.engine.panY = -280;
          State.engine.panX = 0;
        }
        State.engine._dirty = true;
      }
      updateReportPanel();
    };
  });

  // Energy keV buttons
  $$('[data-kev]').forEach((btn) => {
    btn.onclick = () => {
      $$('[data-kev]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      State.selectedKeV = parseInt(btn.dataset.kev);
      State.engine._dirty = true;
      updateReportPanel();
    };
  });

  // Material Decomposition buttons
  $$('[data-mat]').forEach((btn) => {
    btn.onclick = () => {
      $$('[data-mat]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      State.selectedMaterial = btn.dataset.mat;
      State.engine._dirty = true;
      updateReportPanel();
    };
  });
}

/* ============================================================
   19. AI CAD FINDINGS OVERLAY
   ============================================================ */
function wireAiCad() {
  const btn = $('toolAiCad');
  const svg = $('aiOverlay');

  btn.onclick = () => {
    State.aiCadActive = !State.aiCadActive;
    btn.classList.toggle('active', State.aiCadActive);
    svg.classList.toggle('hidden', !State.aiCadActive);
    if (State.aiCadActive) {
      renderAiCad();
    } else {
      svg.innerHTML = '';
    }
  };
}

function renderAiCad() {
  const svg = $('aiOverlay');
  if (!svg || !State.aiCadActive) return;

  const type = State.currentScanType;
  let items = [];

  if (type === 'multiparametric_4d') {
    items = [
      {
        x: 14,
        y: 15,
        w: 72,
        h: 14,
        label: 'T2 FLAIR: Normal Periventricular Signal (99.6%)',
        conf: '99.6%',
      },
      {
        x: 14,
        y: 31,
        w: 72,
        h: 14,
        label: 'DWI b:1000: Zero Cytotoxic Edema / Acute Ischemia',
        conf: '99.9%',
      },
      {
        x: 14,
        y: 47,
        w: 72,
        h: 14,
        label: 'ADC Map: Free Brownian Diffusion (99.7%)',
        conf: '99.7%',
      },
      {
        x: 14,
        y: 63,
        w: 72,
        h: 14,
        label: 'CBF Perfusion: Symmetrical Hemodynamics (65 ml/100g/min)',
        conf: '100%',
      },
      {
        x: 14,
        y: 79,
        w: 72,
        h: 14,
        label: 'SWI: Microvascular Integrity Preserved (Zero Microbleeds)',
        conf: '99.8%',
      },
    ];
  } else if (type === 'brain') {
    items = [
      { x: 38, y: 28, w: 24, h: 42, label: 'Cerebral Cortex (99.4% Normal)', conf: '99.4%' },
      { x: 44, y: 45, w: 12, h: 18, label: 'Ventricles: Symmetrical (99.8%)', conf: '99.8%' },
      { x: 49, y: 15, w: 2, h: 70, label: 'Midline: Zero Shift (100%)', conf: '100%' },
    ];
  } else if (type === 'chest' || type === 'chest_standard') {
    items = [
      { x: 22, y: 30, w: 26, h: 45, label: 'Right Lung: Clear (99.1%)', conf: '99.1%' },
      { x: 52, y: 30, w: 26, h: 45, label: 'Left Lung: Clear (98.9%)', conf: '98.9%' },
      { x: 42, y: 40, w: 16, h: 22, label: 'Cardiac Silhouette: Normal', conf: '99.5%' },
    ];
  } else if (type === 'spine') {
    items = [
      { x: 40, y: 25, w: 20, h: 18, label: 'L3-L4 Disc: Normal Height (99%)', conf: '99.0%' },
      { x: 40, y: 46, w: 20, h: 18, label: 'L4-L5 Disc Space: Intact (99%)', conf: '99.2%' },
      { x: 42, y: 66, w: 16, h: 22, label: 'Sacrum / SI Joints: Symmetrical', conf: '98.8%' },
    ];
  } else if (type === 'cardiac' || type === 'angiography') {
    items = [
      {
        x: 36,
        y: 35,
        w: 28,
        h: 30,
        label: 'Coronary LAD: 100% Patent (Stenosis 0%)',
        conf: '99.7%',
      },
      { x: 48, y: 22, w: 18, h: 16, label: 'Aortic Root: Normal Caliber', conf: '99.9%' },
    ];
  } else if (type === 'abdomen') {
    items = [
      {
        x: 24,
        y: 32,
        w: 28,
        h: 36,
        label: 'Hepatic Parenchyma: Homogeneous (99.5%)',
        conf: '99.5%',
      },
      { x: 54, y: 42, w: 20, h: 24, label: 'Renal Excretion: Normal Bilateral', conf: '99.2%' },
    ];
  } else {
    items = [
      {
        x: 35,
        y: 35,
        w: 30,
        h: 30,
        label: 'AI Segmentation: Anatomically Normal (99.2%)',
        conf: '99.2%',
      },
    ];
  }

  svg.innerHTML = items
    .map(
      (item) => `
    <rect x="${item.x}%" y="${item.y}%" width="${item.w}%" height="${item.h}%" class="ai-tag" rx="4"/>
    <rect x="${item.x}%" y="${Math.max(2, item.y - 3.5)}%" width="${item.label.length * 5.8 + 12}" height="16" rx="3" fill="rgba(3,7,18,0.88)" stroke="#06b6d4" stroke-width="0.8"/>
    <text x="${item.x + 0.8}%" y="${Math.max(2, item.y - 3.5) + 2.4}%" class="ai-tag-label">🤖 ${item.label}</text>
  `,
    )
    .join('');
}

/* ============================================================
   20. TELEMETRY & METRICS COMPARATOR
   ============================================================ */
function updateTelemetryBox(eraId) {
  const era = ERA_DB[eraId] || ERA_DB.present;
  $('telEraName').textContent = `1972 ➔ ${era.year} (${era.name.split('—')[1] || era.name})`;

  // Dose reduction from 20 mSv
  const doseRatio = Math.max(1, Math.min(100, Math.round((era.dose / 20) * 100)));
  const doseCut = (100 - (era.dose / 20) * 100).toFixed(1);
  $('telDoseBar').style.width = `${Math.max(5, 100 - doseRatio)}%`;
  $('telDoseVal').textContent =
    `${era.dose} mSv (${doseCut > 0 ? `-${doseCut}% خفض` : 'المعيار البدائي'})`;

  // Resolution
  const resMap = { era1: 3.0, era2: 0.9, era3: 0.5, present: 0.24, future: 0.11 };
  const res = resMap[eraId] || 0.24;
  const resRatio = ((3.0 - res) / (3.0 - 0.11)) * 100;
  $('telResBar').style.width = `${Math.max(10, resRatio)}%`;
  $('telResVal').textContent = `${res} mm (${(3.0 / res).toFixed(1)}× دقة تفاصيل)`;

  // Speed
  const speedRatio = Math.min(100, Math.max(5, (1 - era.scanTime / 300) * 100));
  $('telSpeedBar').style.width = `${speedRatio}%`;
  $('telSpeedVal').textContent =
    `${era.scanTime}s (${Math.round(300 / Math.max(0.01, era.scanTime))}× أسرع)`;

  // SNR
  const snrMap = { era1: 12, era2: 28, era3: 35, present: 48, future: 65 };
  const snr = snrMap[eraId] || 48;
  $('telSnrBar').style.width = `${(snr / 65) * 100}%`;
  $('telSnrVal').textContent = `${snr} dB (${snr > 30 ? 'نقاء تشخيصي فائق' : 'ضوضاء عالية'})`;
}

/* ============================================================
   21. SCIENTIFIC PANEL OPEN/CLOSE
   ============================================================ */
function wireSciPanel() {
  $('btnSciPanel').onclick = () => {
    const panel = $('sciPanel');
    State.sciPanelOpen = !State.sciPanelOpen;
    panel.classList.toggle('open', State.sciPanelOpen);
    $('btnSciPanel').classList.toggle('active', State.sciPanelOpen);
  };
  $('sciClose').onclick = () => {
    $('sciPanel').classList.remove('open');
    State.sciPanelOpen = false;
    $('btnSciPanel').classList.remove('active');
  };
  $$('.sci-tab').forEach((tab) => {
    tab.onclick = () => {
      $$('.sci-tab').forEach((t) => t.classList.remove('active'));
      $$('.sci-pane').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      const targetPane = document.getElementById(
        'pane' + tab.dataset.tab.split('_').map(capitalize).join(''),
      );
      if (targetPane) targetPane.classList.add('active');
    };
  });
}
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ============================================================
   18. CINE BAR
   ============================================================ */
function wireCineBar() {
  const slider = $('sliceSlider');
  const posLabel = $('cinePosLabel');

  slider.oninput = () => {
    State.sliceCurrent = parseInt(slider.value);
    const slPos = (State.sliceCurrent * 5 - 80).toFixed(1);
    posLabel.textContent = `Slice ${State.sliceCurrent} · SL ${slPos} mm`;
    $('hudSliceNum').textContent = `Slice: ${State.sliceCurrent} / ${State.sliceTotal}`;
    // Offset the image slightly per slice for visual variety
    const offset = (State.sliceCurrent - State.sliceTotal / 2) * 1.5;
    State.engine.panY = offset;
    State.engine._dirty = true;
  };

  $('cinePrev').onclick = () => {
    if (State.sliceCurrent > 1) {
      slider.value = --State.sliceCurrent;
      slider.dispatchEvent(new Event('input'));
    }
  };
  $('cineNext').onclick = () => {
    if (State.sliceCurrent < State.sliceTotal) {
      slider.value = ++State.sliceCurrent;
      slider.dispatchEvent(new Event('input'));
    }
  };

  // Play button
  $('cinePlay').onclick = () => {
    State.cinePlay = !State.cinePlay;
    $('cinePlay').textContent = State.cinePlay ? '⏸' : '▶';
    $('cinePlay').classList.toggle('playing', State.cinePlay);
    if (State.cinePlay) startCine();
    else stopCine();
  };

  // FPS buttons
  $$('.fps-btn').forEach((btn) => {
    btn.onclick = () => {
      $$('.fps-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      State.cineFps = parseInt(btn.dataset.fps);
      if (State.cinePlay) {
        stopCine();
        startCine();
      }
    };
  });
}
function startCine() {
  stopCine();
  State.cineTimer = setInterval(() => {
    const slider = $('sliceSlider');
    State.sliceCurrent = State.sliceCurrent >= State.sliceTotal ? 1 : State.sliceCurrent + 1;
    slider.value = State.sliceCurrent;
    slider.dispatchEvent(new Event('input'));
  }, 1000 / State.cineFps);
}
function stopCine() {
  if (State.cineTimer) {
    clearInterval(State.cineTimer);
    State.cineTimer = null;
  }
}

/* ============================================================
   19. MOUSE HU PROBE & RULER
   ============================================================ */
function wireMouseHU() {
  const canvas = $('primaryCanvas');
  const probeEl = $('huProbeDisplay');
  const rulerSvg = $('rulerSvg');
  let rulerStart = null;

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left,
      y = e.clientY - rect.top;

    if (State.currentTool === 'hu') {
      const result = State.engine.probeHU(x, y);
      if (result) {
        probeEl.textContent = `HU: ${result.hu} · ${result.tissue}`;
        probeEl.classList.add('visible');
      }
    }

    // Show hotspot tooltip
    if (State.currentTool === 'hotspot') {
      probeEl.textContent = `Coordonnées: (${Math.round(x)}, ${Math.round(y)})`;
      probeEl.classList.add('visible');
    }
  });
  canvas.addEventListener('mouseleave', () => {
    probeEl.classList.remove('visible');
  });

  // Ruler click
  canvas.addEventListener('click', (e) => {
    if (State.currentTool !== 'ruler') return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left,
      y = e.clientY - rect.top;

    if (!rulerStart) {
      rulerStart = { x, y };
      // Draw start dot
      rulerSvg.innerHTML = `<circle cx="${x}" cy="${y}" r="4" fill="#06b6d4" stroke="#030712" stroke-width="1.5"/>`;
    } else {
      const dist = Math.hypot(x - rulerStart.x, y - rulerStart.y);
      const pxPerMm = 2.0 * State.engine.zoom;
      const mm = (dist / pxPerMm).toFixed(1);
      const mx = (rulerStart.x + x) / 2,
        my = (rulerStart.y + y) / 2;
      rulerSvg.innerHTML = `
        <line x1="${rulerStart.x}" y1="${rulerStart.y}" x2="${x}" y2="${y}" stroke="#06b6d4" stroke-width="1.5" stroke-dasharray="4 3"/>
        <circle cx="${rulerStart.x}" cy="${rulerStart.y}" r="4" fill="#06b6d4"/>
        <circle cx="${x}" cy="${y}" r="4" fill="#06b6d4"/>
        <rect x="${mx - 28}" y="${my - 12}" width="56" height="18" rx="4" fill="rgba(3,7,18,.85)" stroke="#06b6d4" stroke-width="0.8"/>
        <text x="${mx}" y="${my + 3}" font-size="11" font-family="JetBrains Mono,monospace" fill="#67e8f9" text-anchor="middle">${mm} mm</text>
      `;
      rulerStart = null;
    }
  });
}

/* ============================================================
   20. FILE INPUT
   ============================================================ */
function wireFileInput() {
  $('fileInput').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'dcm') {
      // DICOM — can't parse without library; show advisory
      alert(
        'ملف DICOM (.dcm) يحتاج إلى مكتبة Cornerstone.js لفك تشفيره.\nهذا التطبيق يدعم رفع ملفات الصور: PNG, JPEG, WebP.',
      );
      return;
    }
    State.engine.loadBlob(file);
  };
}

/* ============================================================
   21. EXPORT
   ============================================================ */
function wireExport() {
  $('btnExport').onclick = () => {
    const era = ERA_DB[State.currentEraId];
    const filename = `CT-${era.year}-${State.currentScanType}-${Date.now()}.png`;
    State.engine.exportPng(filename);
  };
}

/* ============================================================
   22. KEYBOARD SHORTCUTS
   ============================================================ */
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  switch (e.key) {
    case '1':
      switchEra('era1');
      break;
    case '2':
      switchEra('era2');
      break;
    case '3':
      switchEra('era3');
      break;
    case '4':
      switchEra('present');
      break;
    case '5':
      switchEra('future');
      break;
    case 'r':
    case 'R':
      State.engine.resetView();
      break;
    case 'ArrowRight':
    case 'ArrowDown': {
      const s = $('sliceSlider');
      if (State.sliceCurrent < State.sliceTotal) {
        s.value = ++State.sliceCurrent;
        s.dispatchEvent(new Event('input'));
      }
      break;
    }
    case 'ArrowLeft':
    case 'ArrowUp': {
      const s = $('sliceSlider');
      if (State.sliceCurrent > 1) {
        s.value = --State.sliceCurrent;
        s.dispatchEvent(new Event('input'));
      }
      break;
    }
    case ' ':
      e.preventDefault();
      $('cinePlay').click();
      break;
  }
});

/* ============================================================
   23. BOOT
   ============================================================ */
document.addEventListener('DOMContentLoaded', runSplash);
