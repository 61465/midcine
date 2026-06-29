"""Ollama backend — اختياري (profile=llm-real). يستدعي qwen2.5:3b-instruct."""
from __future__ import annotations

import httpx

from ..config import get_settings

_settings = get_settings()


SYSTEM_PROMPT = """أنت طبيب أشعة عربي خبير. اكتب مسودة تقرير عربي مهيكل من:
- بيانات المريض
- تشخيص AI الأولي + ثقته
- القياسات التلقائية

استخدم بنية بأربعة أقسام بالضبط:
## التقنية المستخدمة
## النتائج
## الانطباع
## التوصيات

أضف رمز ICD-11 في الانطباع.
"""


async def generate(prompt: str, max_tokens: int = 800) -> str:
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(
            f"{_settings.ollama_url}/api/generate",
            json={
                "model": _settings.ollama_model,
                "system": SYSTEM_PROMPT,
                "prompt": prompt,
                "stream": False,
                "options": {"num_predict": max_tokens, "temperature": 0.3},
            },
        )
        r.raise_for_status()
        return r.json().get("response", "")
