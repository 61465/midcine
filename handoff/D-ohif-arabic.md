<div dir="rtl" lang="ar">

# Handoff D — OHIF Arabic RTL Extensions

> **المهمة:** 3 extensions تحوّل OHIF v3 إلى viewer عربي RTL أصلي مع لوحة Clinical LLM.

---

## 1. Goal
بناء 3 OHIF extensions تجعله Production-ready لأطباء الأشعة العرب: RTL كامل + ترجمة عربية + Chat panel للـ Clinical LLM.

## 2. Scope

### داخل النطاق

#### Extension 1: `@midcine/ohif-rtl-ui`
- قلب التخطيط لـ RTL كاملاً (sidebars، toolbars، context menus)
- تعديل CSS variables لاتجاه CSS Logical Properties
- معايرة slider directions، scroll behavior
- اختصارات لوحة المفاتيح (تبقى Latin لكن mirrored where applicable)
- Settings panel: toggle RTL/LTR

#### Extension 2: `@midcine/ohif-i18n-ar`
- ترجمة عربية كاملة لكل OHIF strings
- نظام i18n مبني على i18next مع loading من JSON files
- دعم Arabic-Indic numerals toggle (٠١٢ vs 012)
- تنسيق التواريخ عربياً (هجري + ميلادي)
- تنسيق وحدات قياس طبية بالعربية (مم، سم، سم³)

#### Extension 3: `@midcine/ohif-llm-panel`
- Chat panel جانبي يتصل بـ LLM Service (Handoff G)
- يعرض draft تقرير من LLM مع confidence + sources
- يسمح للطبيب بـ:
  - قبول الـ draft كاملاً
  - تعديل أجزاء (inline editing)
  - رفض + كتابة من الصفر
  - chat لطلب إعادة صياغة
- زر "اعتمد وأرسل" يستدعي Reports API

### خارج النطاق
- ❌ تعديل OHIF core (نستخدم extension API فقط)
- ❌ AI overlays على الصور (تأتي من backend كـ DICOM GSPS)
- ❌ Mobile app

## 3. Tech Spec

```json
{
  "node": ">=22",
  "ohif/core": "^3.10",
  "ohif/extension-default": "^3.10",
  "react": "^18.3",
  "i18next": "^24",
  "react-i18next": "^15",
  "typescript": "^5.6",
  "vite": "^5"
}
```

### Build
- `pnpm build` ينتج 3 packages قابلة للنشر لـ npm scope `@midcine/`
- ESM-first، CJS fallback

## 4. APIs / Interfaces

### Consumed APIs (من Cloud Ingestion - Handoff C)
```http
GET  /api/v1/studies/{uid}/ai-overlay
GET  /api/v1/studies/{uid}/llm-draft
POST /api/v1/studies/{uid}/llm-feedback
POST /api/v1/reports/{id}/sign
```

### Extension API (للـ OHIF host app)
```typescript
// app config registers extensions
import rtlUI from '@midcine/ohif-rtl-ui';
import i18nAr from '@midcine/ohif-i18n-ar';
import llmPanel from '@midcine/ohif-llm-panel';

const config = {
  extensions: [rtlUI, i18nAr, llmPanel],
  defaultModes: [
    {
      id: 'midcine-arabic-mode',
      displayName: { ar: 'الوضع العربي', en: 'Arabic Mode' },
      extensions: [rtlUI.id, i18nAr.id, llmPanel.id]
    }
  ]
};
```

## 5. Inputs Provided

- OHIF v3.10 base app config
- API tokens (DICOMweb + LLM endpoint)
- Brand assets (logo SVG، colors CSS variables — من 06-BRAND.md)
- Sample DICOMs (5 studies مع AI overlays preview)
- Translation glossary: 200 مصطلح طبي معتمد (CSV)

## 6. Acceptance Criteria

- [ ] OHIF يفتح بالعربية RTL كامل بدون أي element flipping مكسور
- [ ] جميع نصوص OHIF مترجمة (لا "Untranslated keys" في console)
- [ ] التبديل بين Arabic-Indic و Western numerals يعمل lehne (toggle في settings)
- [ ] Chat panel للـ LLM يفتح يعرض draft في <2s
- [ ] قبول draft → يحفظ في reports API بنجاح
- [ ] keyboard shortcuts تعمل في RTL mode (مثلاً next slice = arrow key)
- [ ] WCAG AA على كل الـ UI الجديد (color contrast، focus indicators)
- [ ] tests: ≥30 unit tests لكل extension، 5 E2E (Playwright)

## 7. Definition of Done

- ✅ 3 packages في `packages/ohif-extensions/`
- ✅ README لكل package
- ✅ Demo app في `apps/viewer/` يستخدم الثلاثة
- ✅ Storybook لـ components الجديدة
- ✅ CI: lint + type-check + tests + Chromatic visual regression
- ✅ Docs: how to integrate في OHIF host (للـ partners لاحقاً)
- ✅ Published لـ npm scope @midcine

## 8. Timeline
**3 أسابيع.**

| Sprint | Output |
|--------|--------|
| W1 | rtl-ui extension يعمل، التخطيط مقلوب |
| W2 | i18n-ar كاملاً (ترجمة + numerals + dates) |
| W3 | llm-panel: chat + accept/reject + sign flow |

## 9. Risks

| الخطر | تخفيف |
|------|--------|
| OHIF core يفترض LTR في components | نقدم PRs upstream للـ accessibility fixes |
| ترجمة طبية دقيقة تستهلك وقتاً | المسرد المعتمد + مراجعة طبيب (3 دقائق/قائمة) |
| Chat panel performance على streams طويلة | virtualization (react-window) + lazy load |

</div>
