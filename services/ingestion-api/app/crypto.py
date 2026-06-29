"""تشفير حقول الـ PHI — AES-256-GCM + HMAC-SHA256 deterministic للبحث.

تنبيه: هذا للـ prototype فقط — الإنتاج يجب أن يستخدم Vault Transit.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .config import get_settings

_settings = get_settings()


def _key() -> bytes:
    return base64.b64decode(_settings.field_encryption_key_b64)[:32].ljust(32, b"\0")


def _hmac_key() -> bytes:
    return base64.b64decode(_settings.field_hmac_key_b64)[:32].ljust(32, b"\0")


def encrypt(plaintext: str) -> bytes:
    if plaintext is None:
        return b""
    nonce = os.urandom(12)
    aes = AESGCM(_key())
    ct = aes.encrypt(nonce, plaintext.encode("utf-8"), None)
    return nonce + ct


def decrypt(ciphertext: bytes) -> str:
    if not ciphertext:
        return ""
    nonce, ct = ciphertext[:12], ciphertext[12:]
    aes = AESGCM(_key())
    return aes.decrypt(nonce, ct, None).decode("utf-8")


def search_hash(plaintext: str) -> bytes:
    normalized = (plaintext or "").strip().lower().encode("utf-8")
    return hmac.new(_hmac_key(), normalized, hashlib.sha256).digest()
