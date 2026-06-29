"""يمسح كل الفحوصات + الـ AI + التقارير + ملفات MinIO + Orthanc.

استعمال: python scripts/cleanup_all.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import httpx
import psycopg
from minio import Minio

DSN = (
    f"host={os.environ.get('POSTGRES_HOST', 'localhost')} "
    f"port={os.environ.get('POSTGRES_PORT', '5433')} "
    f"dbname={os.environ.get('POSTGRES_DB', 'midcine')} "
    f"user={os.environ.get('POSTGRES_USER', 'midcine_app')} "
    f"password={os.environ.get('POSTGRES_PASSWORD', 'changeme_dev_only')}"
)

MINIO_HOST = os.environ.get("MINIO_ENDPOINT", "localhost:13900")
MINIO_AK = os.environ.get("MINIO_ACCESS_KEY", "midcine-dev")
MINIO_SK = os.environ.get("MINIO_SECRET_KEY", "midcine-dev-secret-change-me")

ORTHANC_URL = os.environ.get("ORTHANC_PUBLIC_URL", "http://localhost:13042")
ORTHANC_USER = os.environ.get("ORTHANC_USERNAME", "midcine")
ORTHANC_PASS = os.environ.get("ORTHANC_PASSWORD", "changeme_dev_only")


def cleanup_db():
    print("[1/3] Cleaning database...")
    with psycopg.connect(DSN) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT set_config('midcine.current_role', 'super_admin', false)")
            cur.execute("SELECT set_config('midcine.current_tenant', '11111111-1111-1111-1111-111111111111', false)")
            for table in [
                "midcine.segmentations",
                "midcine.reports",
                "midcine.ai_inferences",
                "midcine.attachments",
                "midcine.notifications",
                "midcine.patient_history",
                "midcine.patient_consents",
                "midcine.patient_qr_tokens",
                "midcine.patient_doctors",
                "midcine.instances",
                "midcine.series",
                "midcine.studies",
                "midcine.patients",
            ]:
                cur.execute(f"DELETE FROM {table}")
                print(f"  - {table}: {cur.rowcount} rows")
            conn.commit()


def cleanup_minio():
    print("[2/3] Cleaning MinIO...")
    client = Minio(MINIO_HOST, access_key=MINIO_AK, secret_key=MINIO_SK, secure=False)
    for bucket in ["midcine-studies", "midcine-heatmaps", "midcine-reports", "midcine-attachments"]:
        try:
            count = 0
            for obj in client.list_objects(bucket, recursive=True):
                client.remove_object(bucket, obj.object_name)
                count += 1
            print(f"  - {bucket}: removed {count} objects")
        except Exception as e:
            print(f"  - {bucket}: {e}")


def cleanup_orthanc():
    print("[3/3] Cleaning Orthanc...")
    auth = (ORTHANC_USER, ORTHANC_PASS)
    try:
        with httpx.Client(timeout=30) as c:
            studies = c.get(f"{ORTHANC_URL}/studies", auth=auth).json()
            for sid in studies:
                c.delete(f"{ORTHANC_URL}/studies/{sid}", auth=auth)
            print(f"  - deleted {len(studies)} studies")
    except Exception as e:
        print(f"  - {e}")


def main():
    if "--yes" not in sys.argv:
        print("WARNING: سيمسح كل البيانات (Postgres + MinIO + Orthanc).")
        confirm = input("اكتب YES للمتابعة: ")
        if confirm.strip() != "YES":
            print("ملغى.")
            return
    cleanup_db()
    cleanup_minio()
    cleanup_orthanc()
    print("\n[OK] تم التنظيف. النظام جاهز لبيانات جديدة.")


if __name__ == "__main__":
    main()
