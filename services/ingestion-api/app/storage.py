from __future__ import annotations

import io

from minio import Minio
from minio.error import S3Error

from .config import get_settings

_settings = get_settings()


def get_client() -> Minio:
    return Minio(
        _settings.minio_endpoint,
        access_key=_settings.minio_access_key,
        secret_key=_settings.minio_secret_key,
        secure=_settings.minio_use_ssl,
    )


def ensure_bucket(name: str) -> None:
    client = get_client()
    try:
        if not client.bucket_exists(name):
            client.make_bucket(name)
    except S3Error as e:  # bucket exists race
        if e.code != "BucketAlreadyOwnedByYou":
            raise


def put_object(uri: str, data: bytes, content_type: str = "application/dicom") -> str:
    """uri مثل s3://bucket/path/to/file.dcm — يرجع نفس الـ uri."""
    assert uri.startswith("s3://"), f"invalid uri: {uri}"
    rest = uri[5:]
    bucket, _, key = rest.partition("/")
    ensure_bucket(bucket)
    client = get_client()
    client.put_object(
        bucket_name=bucket,
        object_name=key,
        data=io.BytesIO(data),
        length=len(data),
        content_type=content_type,
    )
    return uri


def get_object(uri: str) -> bytes:
    assert uri.startswith("s3://"), f"invalid uri: {uri}"
    rest = uri[5:]
    bucket, _, key = rest.partition("/")
    client = get_client()
    resp = client.get_object(bucket, key)
    try:
        return resp.read()
    finally:
        resp.close()
        resp.release_conn()
