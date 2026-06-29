"""يحدّث kل ما يحتاج ديناميكية بعد تشغيل migrations:
- يضع password_hash + email_hash + email_encrypted لمستخدم demo
- يضيف ICD-11 sample chunks (بدون embeddings للسهولة في الـ prototype)

استعمال:
    python scripts/seed_db.py
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# نستخدم psycopg الـ sync لتجنّب asyncio هنا (الـ seed يُشغَّل مرة)
try:
    import psycopg
except ImportError:
    print("install: pip install psycopg[binary] argon2-cffi cryptography")
    sys.exit(1)

import argon2
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def env(name: str, default: str) -> str:
    return os.environ.get(name, default)


DSN = (
    f"host={env('POSTGRES_HOST','localhost')} "
    f"port={env('POSTGRES_PORT','5432')} "
    f"dbname={env('POSTGRES_DB','midcine')} "
    f"user={env('POSTGRES_USER','midcine_app')} "
    f"password={env('POSTGRES_PASSWORD','changeme_dev_only')}"
)


def _key(b64: str) -> bytes:
    return base64.b64decode(b64)[:32].ljust(32, b"\0")


def encrypt(plaintext: str, key: bytes) -> bytes:
    nonce = os.urandom(12)
    return nonce + AESGCM(key).encrypt(nonce, plaintext.encode("utf-8"), None)


def search_hash(plaintext: str, hmac_key: bytes) -> bytes:
    return hmac.new(hmac_key, plaintext.strip().lower().encode("utf-8"), hashlib.sha256).digest()


def main() -> None:
    enc_key = _key(env("FIELD_ENCRYPTION_KEY_B64", "ZGV2X29ubHlfMzJfYnl0ZV9rZXlfZm9yX21pZGNpbmU="))
    hmac_key = _key(env("FIELD_HMAC_KEY_B64", "ZGV2X29ubHlfMzJfYnl0ZV9obWFjX2tleV9mb3JfbWlk"))

    email = env("MIDCINE_DEV_USER_EMAIL", "demo@midcine.io")
    password = env("MIDCINE_DEV_USER_PASSWORD", "DemoMidcine!2026")
    tenant_id = env("MIDCINE_DEV_TENANT_ID", "11111111-1111-1111-1111-111111111111")
    user_id = env("MIDCINE_DEV_USER_ID", "22222222-2222-2222-2222-222222222222")

    pw_hash = argon2.PasswordHasher().hash(password)
    email_hash = search_hash(email, hmac_key)
    email_enc = encrypt(email, enc_key)

    icd_samples = [
        ("8B00.0", "نزيف داخل المخ (Intracerebral haemorrhage) — تجمع دموي حاد داخل متن المخ."),
        ("8B00.1", "نزيف تحت العنكبوتية (Subarachnoid haemorrhage)."),
        ("8B00.2", "نزيف فوق الجافية (Extradural haemorrhage)."),
        ("8B00.3", "نزيف تحت الجافية (Subdural haemorrhage)."),
        ("8B11.0", "احتشاء دماغي (Cerebral infarction)."),
        ("CA40.0", "التهاب الجيوب الأنفية الحاد."),
        ("QA00.YY", "نتيجة فحص أشعة طبيعية."),
        ("XA8RY7", "كسر في عظمة بعينها — يحتاج تحديد."),
    ]

    with psycopg.connect(DSN) as conn:
        with conn.cursor() as cur:
            # bypass RLS لـ seeding
            cur.execute("SELECT set_config('midcine.current_role', 'super_admin', false)")
            cur.execute("SELECT set_config('midcine.current_tenant', %s, false)", (tenant_id,))
            # حدّث مستخدم demo
            cur.execute(
                """
                UPDATE midcine.users
                SET email_hash = %s, email_encrypted = %s, password_hash = %s
                WHERE id = %s
                """,
                (email_hash, email_enc, pw_hash, user_id),
            )
            if cur.rowcount == 0:
                cur.execute(
                    """
                    INSERT INTO midcine.users
                        (id, tenant_id, email_hash, email_encrypted, full_name_ar,
                         full_name_en, role, license_number, specialty, password_hash)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO NOTHING
                    """,
                    (
                        user_id, tenant_id, email_hash, email_enc,
                        "د. عبد الرحمن محمد", "Dr. Abdelrahman Mohamed",
                        "doctor", "EG-RAD-12345", "radiology", pw_hash,
                    ),
                )

            # ICD-11 chunks (RAG sample)
            for code, text in icd_samples:
                cur.execute(
                    """
                    INSERT INTO midcine.knowledge_chunks
                        (source_type, source_id, content_ar, metadata)
                    VALUES ('icd11', %s, %s, %s)
                    ON CONFLICT DO NOTHING
                    """,
                    (code, text, '{"code":"' + code + '"}'),
                )

        conn.commit()

    print(f"[OK] user demo seeded: {email} / {password}")
    print(f"[OK] {len(icd_samples)} ICD-11 sample chunks added")


if __name__ == "__main__":
    main()
