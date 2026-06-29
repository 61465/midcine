AGENTS = [
    # ═══════════════════════════════════════════════════
    # TIER 1 — القيادة والتوجيه (Command & Control)
    # ═══════════════════════════════════════════════════
    {
        "id": "maestro",
        "name": "Maestro",
        "arabic": "المايسترو",
        "role": "Chief Orchestrator — يوزع المهام ويدير الشركة كاملة",
        "tier": 1,
        "category": "command",
        "provider": "groq",
        "model": "openai/gpt-oss-120b",
        "icon": "👑",
        "color": "#FFD700",
        "capabilities": ["task_distribution", "project_planning", "agent_coordination"]
    },
    {
        "id": "architect",
        "name": "Architect",
        "arabic": "المعماري",
        "role": "System Design — يصمم البنية المعمارية للأنظمة الكبيرة",
        "tier": 1,
        "category": "command",
        "provider": "groq",
        "model": "meta-llama/llama-4-scout-17b-16e-instruct",
        "icon": "🏛️",
        "color": "#C0C0C0",
        "capabilities": ["system_design", "architecture_planning", "tech_stack_selection"]
    },
    {
        "id": "project_manager",
        "name": "Project Manager",
        "arabic": "مدير المشروع",
        "role": "Task Breakdown — يكسر المشاريع الضخمة لمهام قابلة للتنفيذ",
        "tier": 1,
        "category": "command",
        "provider": "groq",
        "model": "llama-3.3-70b-versatile",
        "icon": "📋",
        "color": "#C0C0C0",
        "capabilities": ["task_planning", "milestone_tracking", "resource_allocation"]
    },

    # ═══════════════════════════════════════════════════
    # TIER 2 — فريق التطوير (Development Team)
    # ═══════════════════════════════════════════════════
    {
        "id": "frontend_dev",
        "name": "Frontend Dev",
        "arabic": "مطور الواجهات",
        "role": "UI/UX Code — React, Flutter, HTML/CSS/JS بالكامل",
        "tier": 2,
        "category": "development",
        "provider": "groq",
        "model": "qwen/qwen3-32b",
        "icon": "🎨",
        "color": "#4FC3F7",
        "capabilities": ["react", "flutter", "css", "responsive_design", "animations"]
    },
    {
        "id": "backend_dev",
        "name": "Backend Dev",
        "arabic": "مطور الخلفية",
        "role": "APIs & Servers — Python/FastAPI/Node.js/Django",
        "tier": 2,
        "category": "development",
        "provider": "groq",
        "model": "qwen/qwen3-32b",
        "icon": "⚙️",
        "color": "#4FC3F7",
        "capabilities": ["python", "fastapi", "nodejs", "rest_apis", "websockets"]
    },
    {
        "id": "database_wizard",
        "name": "Database Wizard",
        "arabic": "ساحر البيانات",
        "role": "DB Architecture — SQL/NoSQL, schema design, query optimization",
        "tier": 2,
        "category": "development",
        "provider": "groq",
        "model": "qwen/qwen3-32b",
        "icon": "🗄️",
        "color": "#4FC3F7",
        "capabilities": ["sql", "mongodb", "redis", "schema_design", "query_optimization"]
    },
    {
        "id": "mobile_dev",
        "name": "Mobile Dev",
        "arabic": "مطور الجوال",
        "role": "Flutter & React Native — تطبيقات iOS وAndroid",
        "tier": 2,
        "category": "development",
        "provider": "groq",
        "model": "qwen/qwen3-32b",
        "icon": "📱",
        "color": "#4FC3F7",
        "capabilities": ["flutter", "react_native", "ios", "android", "cross_platform"]
    },
    {
        "id": "algorithm_expert",
        "name": "Algorithm Expert",
        "arabic": "خبير الخوارزميات",
        "role": "Complex Algorithms — Data structures, optimization, mathematics",
        "tier": 2,
        "category": "development",
        "provider": "groq",
        "model": "meta-llama/llama-4-scout-17b-16e-instruct",
        "icon": "🧮",
        "color": "#4FC3F7",
        "capabilities": ["algorithms", "data_structures", "math", "optimization", "complexity_analysis"]
    },
    {
        "id": "api_connector",
        "name": "API Connector",
        "arabic": "رابط الواجهات",
        "role": "Integration Hell Solver — يربط أطر العمل المختلفة بسلاسة",
        "tier": 2,
        "category": "development",
        "provider": "groq",
        "model": "llama-3.3-70b-versatile",
        "icon": "🔗",
        "color": "#4FC3F7",
        "capabilities": ["api_integration", "framework_bridging", "middleware", "webhooks"]
    },
    {
        "id": "devops_master",
        "name": "DevOps Master",
        "arabic": "سيد النشر",
        "role": "Deployment & Infrastructure — Docker, CI/CD, Cloud",
        "tier": 2,
        "category": "development",
        "provider": "groq",
        "model": "llama-3.3-70b-versatile",
        "icon": "🚀",
        "color": "#4FC3F7",
        "capabilities": ["docker", "kubernetes", "ci_cd", "cloud_deployment", "infrastructure"]
    },

    # ═══════════════════════════════════════════════════
    # TIER 3 — فريق ضمان الجودة (Quality Assurance Team)
    # ═══════════════════════════════════════════════════
    {
        "id": "guardian",
        "name": "The Guardian",
        "arabic": "الحارس",
        "role": "Code Integrity — يمنع حذف أي سطر من الكود الأصلي مهما كان حجمه",
        "tier": 3,
        "category": "quality",
        "provider": "groq",
        "model": "llama-3.3-70b-versatile",
        "icon": "🛡️",
        "color": "#81C784",
        "capabilities": ["code_diff_matching", "integrity_check", "no_truncation", "feature_preservation"]
    },
    {
        "id": "code_reviewer",
        "name": "Code Reviewer",
        "arabic": "المراجع",
        "role": "Code Quality — يراجع الكود ويضمن التزامه بأفضل الممارسات",
        "tier": 3,
        "category": "quality",
        "provider": "groq",
        "model": "openai/gpt-oss-120b",
        "icon": "🔍",
        "color": "#81C784",
        "capabilities": ["code_review", "best_practices", "clean_code", "design_patterns"]
    },
    {
        "id": "refactor_king",
        "name": "Refactor King",
        "arabic": "ملك الإعادة",
        "role": "Code Refactoring — يُحسّن الكود دون كسر أي وظيفة",
        "tier": 3,
        "category": "quality",
        "provider": "groq",
        "model": "qwen/qwen3-32b",
        "icon": "♻️",
        "color": "#81C784",
        "capabilities": ["refactoring", "tech_debt_reduction", "code_cleanup", "performance_improvement"]
    },
    {
        "id": "test_engineer",
        "name": "Test Engineer",
        "arabic": "مهندس الاختبار",
        "role": "Testing — Unit tests, integration tests, E2E tests",
        "tier": 3,
        "category": "quality",
        "provider": "groq",
        "model": "openai/gpt-oss-120b",
        "icon": "🧪",
        "color": "#81C784",
        "capabilities": ["unit_testing", "integration_testing", "e2e_testing", "test_coverage"]
    },
    {
        "id": "debugger",
        "name": "The Debugger",
        "arabic": "المُصلح",
        "role": "Error Hunting — يتعقب الأخطاء ويصلحها بسرعة خارقة",
        "tier": 3,
        "category": "quality",
        "provider": "groq",
        "model": "meta-llama/llama-4-scout-17b-16e-instruct",
        "icon": "🐛",
        "color": "#81C784",
        "capabilities": ["debugging", "error_tracing", "stack_analysis", "root_cause_analysis"]
    },
    {
        "id": "performance_optimizer",
        "name": "Performance Optimizer",
        "arabic": "محسّن الأداء",
        "role": "Speed & Memory — يُقلص وقت التحميل ويُحسّن استهلاك الموارد",
        "tier": 3,
        "category": "quality",
        "provider": "groq",
        "model": "qwen/qwen3-32b",
        "icon": "⚡",
        "color": "#81C784",
        "capabilities": ["performance_profiling", "memory_optimization", "caching", "load_optimization"]
    },
    {
        "id": "documentation_writer",
        "name": "Documentation Writer",
        "arabic": "كاتب التوثيق",
        "role": "Docs & Comments — يكتب توثيقاً احترافياً لكل وظيفة ومشروع",
        "tier": 3,
        "category": "quality",
        "provider": "groq",
        "model": "openai/gpt-oss-120b",
        "icon": "📝",
        "color": "#81C784",
        "capabilities": ["technical_writing", "api_docs", "readme", "code_comments"]
    },

    # ═══════════════════════════════════════════════════
    # TIER 4 — فريق الأمن السيبراني (CyberSec Team)
    # ═══════════════════════════════════════════════════
    {
        "id": "vulnerability_hunter",
        "name": "Vulnerability Hunter",
        "arabic": "صائد الثغرات",
        "role": "Static Analysis — يكتشف ثغرات OWASP Top 10 في الكود",
        "tier": 4,
        "category": "security",
        "provider": "groq",
        "model": "openai/gpt-oss-120b",
        "icon": "🎯",
        "color": "#EF5350",
        "capabilities": ["owasp_scanning", "static_analysis", "vulnerability_detection", "sql_injection", "xss"]
    },
    {
        "id": "pen_tester",
        "name": "Penetration Tester",
        "arabic": "مختبر الاختراق",
        "role": "Ethical Hacking — يختبر النظام كمخترق حقيقي لاكتشاف الثغرات",
        "tier": 4,
        "category": "security",
        "provider": "groq",
        "model": "llama-3.3-70b-versatile",
        "icon": "💀",
        "color": "#EF5350",
        "capabilities": ["penetration_testing", "attack_simulation", "exploit_analysis", "red_team"]
    },
    {
        "id": "devsecops_agent",
        "name": "DevSecOps Agent",
        "arabic": "أمن التطوير",
        "role": "Secure CI/CD — يدمج الأمن في خط النشر دون إبطائه",
        "tier": 4,
        "category": "security",
        "provider": "groq",
        "model": "llama-3.3-70b-versatile",
        "icon": "🔒",
        "color": "#EF5350",
        "capabilities": ["devsecops", "secure_pipeline", "secrets_scanning", "compliance_check"]
    },
    {
        "id": "alert_filter",
        "name": "Alert Filter",
        "arabic": "فلتر التنبيهات",
        "role": "Alert Fatigue Solver — يصفي آلاف التنبيهات ويبرز التهديد الحقيقي فقط",
        "tier": 4,
        "category": "security",
        "provider": "groq",
        "model": "llama-3.3-70b-versatile",
        "icon": "🚨",
        "color": "#EF5350",
        "capabilities": ["alert_filtering", "false_positive_reduction", "threat_prioritization", "log_analysis"]
    },
    {
        "id": "crypto_specialist",
        "name": "Crypto Specialist",
        "arabic": "متخصص التشفير",
        "role": "Encryption & Hashing — يؤمّن البيانات والاتصالات بأحدث معايير التشفير",
        "tier": 4,
        "category": "security",
        "provider": "groq",
        "model": "qwen/qwen3-32b",
        "icon": "🔐",
        "color": "#EF5350",
        "capabilities": ["encryption", "hashing", "jwt", "oauth", "secure_storage"]
    },
    {
        "id": "prompt_guardian",
        "name": "Prompt Guardian",
        "arabic": "حارس الأوامر",
        "role": "AI Security — يمنع Prompt Injection وتسمم السياق في الأنظمة الذكية",
        "tier": 4,
        "category": "security",
        "provider": "groq",
        "model": "llama-3.3-70b-versatile",
        "icon": "🧠",
        "color": "#EF5350",
        "capabilities": ["prompt_injection_prevention", "context_sanitization", "ai_security", "llm_hardening"]
    },

    # ═══════════════════════════════════════════════════
    # TIER 5 — فريق الذكاء الاصطناعي (AI Engineering Team)
    # ═══════════════════════════════════════════════════
    {
        "id": "model_optimizer",
        "name": "Model Optimizer",
        "arabic": "محسّن النماذج",
        "role": "Hardware Optimization — يُشغّل النماذج المحلية بأقصى كفاءة على العتاد المتاح",
        "tier": 5,
        "category": "ai_engineering",
        "provider": "groq",
        "model": "llama-3.3-70b-versatile",
        "icon": "🖥️",
        "color": "#CE93D8",
        "capabilities": ["model_quantization", "ollama_optimization", "hardware_tuning", "batch_processing"]
    },
    {
        "id": "prompt_engineer",
        "name": "Prompt Engineer",
        "arabic": "مهندس الأوامر",
        "role": "Prompt Crafting — يصنع أفضل prompt لكل وكيل لضمان أفضل مخرجات",
        "tier": 5,
        "category": "ai_engineering",
        "provider": "groq",
        "model": "qwen/qwen3-32b",
        "icon": "✍️",
        "color": "#CE93D8",
        "capabilities": ["prompt_engineering", "chain_of_thought", "few_shot", "prompt_optimization"]
    },
    {
        "id": "rag_specialist",
        "name": "RAG Specialist",
        "arabic": "متخصص RAG",
        "role": "Retrieval Augmented Generation — يربط النماذج بقواعد المعرفة الضخمة",
        "tier": 5,
        "category": "ai_engineering",
        "provider": "groq",
        "model": "llama-3.3-70b-versatile",
        "icon": "📚",
        "color": "#CE93D8",
        "capabilities": ["rag_pipeline", "vector_db", "embeddings", "knowledge_retrieval", "context_injection"]
    },
    {
        "id": "data_pipeline",
        "name": "Data Pipeline",
        "arabic": "خط البيانات",
        "role": "Data Quality — يُنظّف البيانات ويكتشف التحيز قبل التدريب",
        "tier": 5,
        "category": "ai_engineering",
        "provider": "groq",
        "model": "llama-3.3-70b-versatile",
        "icon": "🔄",
        "color": "#CE93D8",
        "capabilities": ["data_cleaning", "bias_detection", "etl_pipeline", "data_validation"]
    },
    {
        "id": "explainability_agent",
        "name": "Explainability Agent",
        "arabic": "عقل التفسير",
        "role": "AI Explainability — يشرح لماذا اتخذ النموذج قراراً معيناً",
        "tier": 5,
        "category": "ai_engineering",
        "provider": "groq",
        "model": "meta-llama/llama-4-scout-17b-16e-instruct",
        "icon": "💡",
        "color": "#CE93D8",
        "capabilities": ["xai", "decision_tracing", "model_debugging", "attention_analysis"]
    },

    # ═══════════════════════════════════════════════════
    # TIER 7 — المحتوى والكتابة (Content & Writing)
    # ═══════════════════════════════════════════════════
    {
        "id": "content_writer",
        "name": "Content Writer",
        "arabic": "كاتب المحتوى",
        "role": "Content Creation — يكتب مقالات، مدونات، وصفحات ويب احترافية بالعربية والإنجليزية",
        "tier": 7,
        "category": "content",
        "provider": "groq",
        "model": "qwen/qwen3-32b",
        "icon": "✍️",
        "color": "#80CBC4",
        "capabilities": ["articles", "blog_posts", "web_copy", "arabic_content", "seo_writing"]
    },
    {
        "id": "pdf_writer",
        "name": "PDF Writer",
        "arabic": "كاتب التقارير",
        "role": "Structured Reports — يكتب تقارير وكتيبات PDF منسقة بعناوين وجداول وأقسام احترافية",
        "tier": 7,
        "category": "content",
        "provider": "groq",
        "model": "llama-3.3-70b-versatile",
        "icon": "📄",
        "color": "#80CBC4",
        "capabilities": ["pdf_reports", "structured_docs", "technical_writing", "formatting", "tables"]
    },
    {
        "id": "book_author",
        "name": "Book Author",
        "arabic": "مؤلف الكتب",
        "role": "Long-form Writing — يؤلف كتباً وفصولاً كاملة بأسلوب سردي احترافي",
        "tier": 7,
        "category": "content",
        "provider": "groq",
        "model": "qwen/qwen3-32b",
        "icon": "📖",
        "color": "#80CBC4",
        "capabilities": ["book_chapters", "narrative_writing", "story_structure", "character_dev", "plot"]
    },
    {
        "id": "copywriter",
        "name": "Copywriter",
        "arabic": "الكاتب الإعلاني",
        "role": "Persuasive Copy — يكتب نصوص إعلانية مقنعة، سلوغانات، وعروض مبيعات",
        "tier": 7,
        "category": "content",
        "provider": "groq",
        "model": "llama-3.3-70b-versatile",
        "icon": "💬",
        "color": "#80CBC4",
        "capabilities": ["ad_copy", "slogans", "sales_pages", "email_marketing", "headlines"]
    },

    # ═══════════════════════════════════════════════════
    # TIER 8 — التصميم الإبداعي (Creative Design)
    # ═══════════════════════════════════════════════════
    {
        "id": "designer_3d",
        "name": "3D Designer",
        "arabic": "مصمم ثلاثي الأبعاد",
        "role": "3D Concepts — يصف ويكتب توصيفات دقيقة للنماذج ثلاثية الأبعاد (Blender/C4D/Unreal) وينفّذ prompts للأدوات الجيل الجديد",
        "tier": 8,
        "category": "creative",
        "provider": "groq",
        "model": "meta-llama/llama-4-scout-17b-16e-instruct",
        "icon": "🎲",
        "color": "#F48FB1",
        "capabilities": ["3d_prompts", "blender_descriptions", "scene_composition", "lighting", "materials"]
    },
    {
        "id": "graphic_designer",
        "name": "Graphic Designer",
        "arabic": "مصمم الجرافيك",
        "role": "Visual Design — يصمم بالنص ويكتب توجيهات تصميم دقيقة للألوان والتخطيط والطباعة",
        "tier": 8,
        "category": "creative",
        "provider": "groq",
        "model": "qwen/qwen3-32b",
        "icon": "🖼️",
        "color": "#F48FB1",
        "capabilities": ["layout_design", "color_theory", "typography", "brand_guidelines", "visual_hierarchy"]
    },
    {
        "id": "illustrator",
        "name": "Illustrator",
        "arabic": "الرسام",
        "role": "Illustration & Art — يكتب توصيفات فنية دقيقة للرسوم والصور وينفّذ prompts للـ AI image generators",
        "tier": 8,
        "category": "creative",
        "provider": "groq",
        "model": "qwen/qwen3-32b",
        "icon": "🎨",
        "color": "#F48FB1",
        "capabilities": ["art_direction", "image_prompts", "illustration_styles", "character_design", "concept_art"]
    },
    {
        "id": "brand_designer",
        "name": "Brand Designer",
        "arabic": "مصمم الهوية",
        "role": "Brand Identity — يبني هوية بصرية كاملة: شعار، ألوان، خطوط، دليل العلامة التجارية",
        "tier": 8,
        "category": "creative",
        "provider": "groq",
        "model": "llama-3.3-70b-versatile",
        "icon": "💎",
        "color": "#F48FB1",
        "capabilities": ["logo_concepts", "brand_guidelines", "color_palette", "visual_identity", "style_guide"]
    },

    # ═══════════════════════════════════════════════════
    # TIER 9 — الإنتاج الإعلامي (Media Production)
    # ═══════════════════════════════════════════════════
    {
        "id": "video_producer",
        "name": "Video Producer",
        "arabic": "منتج الفيديو",
        "role": "Video Production — يخطط ويُنتج محتوى فيديو: سيناريو، لقطات، مونتاج، وتسليم نهائي",
        "tier": 9,
        "category": "media",
        "provider": "groq",
        "model": "llama-3.3-70b-versatile",
        "icon": "🎬",
        "color": "#FFCC02",
        "capabilities": ["video_scripts", "shot_lists", "editing_instructions", "youtube", "reels"]
    },
    {
        "id": "motion_designer",
        "name": "Motion Designer",
        "arabic": "مصمم الموشن",
        "role": "Motion Graphics — يصمم رسوم متحركة وموشن جرافيك ويكتب توجيهات After Effects/Rive",
        "tier": 9,
        "category": "media",
        "provider": "groq",
        "model": "qwen/qwen3-32b",
        "icon": "🎞️",
        "color": "#FFCC02",
        "capabilities": ["motion_graphics", "animation_scripts", "after_effects", "transitions", "visual_effects"]
    },
    {
        "id": "scriptwriter",
        "name": "Scriptwriter",
        "arabic": "كاتب السيناريو",
        "role": "Scripts & Storyboards — يكتب سيناريوهات فيديو احترافية ولوحات قصة مرئية",
        "tier": 9,
        "category": "media",
        "provider": "groq",
        "model": "qwen/qwen3-32b",
        "icon": "🎭",
        "color": "#FFCC02",
        "capabilities": ["video_scripts", "storyboards", "dialogue", "youtube_scripts", "podcast_scripts"]
    },

    # ═══════════════════════════════════════════════════
    # TIER 10 — التسويق الرقمي (Digital Marketing)
    # ═══════════════════════════════════════════════════
    {
        "id": "marketing_strategist",
        "name": "Marketing Strategist",
        "arabic": "مخطط التسويق",
        "role": "Marketing Strategy — يبني خطط تسويقية شاملة: جمهور، قنوات، محتوى، ميزانية، KPIs",
        "tier": 10,
        "category": "marketing",
        "provider": "groq",
        "model": "qwen/qwen3-32b",
        "icon": "📊",
        "color": "#A5D6A7",
        "capabilities": ["marketing_plans", "audience_analysis", "campaign_strategy", "kpis", "competitor_analysis"]
    },
    {
        "id": "social_media_manager",
        "name": "Social Media Manager",
        "arabic": "مدير التواصل الاجتماعي",
        "role": "Social Media — يدير ويطور صفحات فيسبوك وإنستغرام وتويتر: منشورات، تعليقات، نمو",
        "tier": 10,
        "category": "marketing",
        "provider": "groq",
        "model": "llama-3.3-70b-versatile",
        "icon": "📱",
        "color": "#A5D6A7",
        "capabilities": ["facebook", "instagram", "twitter", "post_creation", "engagement", "page_growth"]
    },
    {
        "id": "seo_specialist",
        "name": "SEO Specialist",
        "arabic": "متخصص SEO",
        "role": "Search Optimization — يحسّن الظهور في محركات البحث: كلمات مفتاحية، بنية، محتوى",
        "tier": 10,
        "category": "marketing",
        "provider": "groq",
        "model": "qwen/qwen3-32b",
        "icon": "🔍",
        "color": "#A5D6A7",
        "capabilities": ["keyword_research", "on_page_seo", "technical_seo", "backlinks", "serp_analysis"]
    },
    {
        "id": "growth_hacker",
        "name": "Growth Hacker",
        "arabic": "متخصص النمو",
        "role": "Growth & Acquisition — يجد قنوات نمو غير تقليدية ويصمم تجارب اكتساب مستخدمين سريعة",
        "tier": 10,
        "category": "marketing",
        "provider": "groq",
        "model": "meta-llama/llama-4-scout-17b-16e-instruct",
        "icon": "🚀",
        "color": "#A5D6A7",
        "capabilities": ["growth_experiments", "viral_loops", "user_acquisition", "retention", "funnel_optimization"]
    },
    {
        "id": "community_manager",
        "name": "Community Manager",
        "arabic": "مدير المجتمع",
        "role": "Community Building — يبني ويدير مجتمعات المستخدمين: دعم، تفاعل، محتوى، نمو",
        "tier": 10,
        "category": "marketing",
        "provider": "groq",
        "model": "llama-3.3-70b-versatile",
        "icon": "🤝",
        "color": "#A5D6A7",
        "capabilities": ["community_management", "user_support", "feedback_collection", "discord", "forum"]
    },

    # ═══════════════════════════════════════════════════
    # TIER 6 — وكلاء الدعم (Support Agents)
    # ═══════════════════════════════════════════════════
    {
        "id": "research_agent",
        "name": "Research Agent",
        "arabic": "الباحث",
        "role": "Web Research — يبحث عن أحدث المعلومات والمكتبات ويحلل التوثيق",
        "tier": 6,
        "category": "support",
        "provider": "groq",
        "model": "llama-3.3-70b-versatile",
        "icon": "🔎",
        "color": "#FFB74D",
        "capabilities": ["web_research", "library_discovery", "documentation_search", "latest_updates"]
    },
    {
        "id": "memory_manager",
        "name": "Memory Manager",
        "arabic": "مدير الذاكرة",
        "role": "Context Management — يحفظ السياق عبر الجلسات ويمنع فقدان المعلومات",
        "tier": 6,
        "category": "support",
        "provider": "groq",
        "model": "llama-3.3-70b-versatile",
        "icon": "🧩",
        "color": "#FFB74D",
        "capabilities": ["context_compression", "session_memory", "knowledge_persistence", "state_management"]
    },
]

# Providers configuration — 100% FREE
PROVIDERS = {
    "groq": {
        "name": "Groq",
        "description": "سرعة خارقة + مجاني تماماً — يُشغّل Llama 3.3 وQwen QWQ وDeepSeek R1 بسرعة لا تُصدق. 28 وكيل يعتمدون عليه.",
        "required": True,
        "env_key": "GROQ_API_KEY",
        "base_url": "https://api.groq.com/openai/v1",
        "icon": "⚡",
        "agents_count": 28,
        "free": True,
        "signup_url": "https://console.groq.com"
    },
    "google": {
        "name": "Google AI Studio",
        "description": "مجاني تماماً — Gemini 2.0 Flash هو الـ Maestro الرئيسي ورئيس الشركة. يستخدمه 2 وكيل.",
        "required": True,
        "env_key": "GOOGLE_API_KEY",
        "base_url": "https://generativelanguage.googleapis.com",
        "icon": "🌈",
        "agents_count": 2,
        "free": True,
        "signup_url": "https://aistudio.google.com/apikey"
    },
    "openai": {
        "name": "OpenAI (GPT)",
        "description": "اختياري ومدفوع — فقط إذا أردت إضافة GPT-4o كبديل للـ Maestro",
        "required": False,
        "env_key": "OPENAI_API_KEY",
        "base_url": "https://api.openai.com/v1",
        "icon": "💚",
        "agents_count": 0,
        "free": False,
        "signup_url": "https://platform.openai.com"
    },
    "huggingface": {
        "name": "Hugging Face",
        "description": "اختياري ومجاني — للنماذج المتخصصة ومعالجة الصور والنصوص",
        "required": False,
        "env_key": "HUGGINGFACE_API_KEY",
        "base_url": "https://api-inference.huggingface.co",
        "icon": "🤗",
        "agents_count": 0,
        "free": True,
        "signup_url": "https://huggingface.co/settings/tokens"
    }
}

CATEGORIES = {
    "command":        {"label": "القيادة",              "color": "#FFD700"},
    "development":    {"label": "التطوير",              "color": "#4FC3F7"},
    "quality":        {"label": "ضمان الجودة",         "color": "#81C784"},
    "security":       {"label": "الأمن السيبراني",     "color": "#EF5350"},
    "ai_engineering": {"label": "هندسة الذكاء",        "color": "#CE93D8"},
    "support":        {"label": "الدعم",                "color": "#FFB74D"},
}
