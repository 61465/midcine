"""Edge Pusher — يحاكي Edge Gateway في الـ prototype.

استعمال:
    python -m app.pusher --inbox ./inbox --api http://localhost:8100

يراقب مجلد inbox؛ كل ملف .dcm جديد → يرفعه + يخطر اكتمال الـ study.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
from collections import defaultdict
from pathlib import Path

import httpx
from midcine_dicom import summarize


log = logging.getLogger("edge-pusher")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


async def push_one(client: httpx.AsyncClient, api: str, path: Path) -> str:
    summary = summarize(path)
    meta = {
        "study_instance_uid": summary.study_uid,
        "series_instance_uid": summary.series_uid,
        "sop_instance_uid": summary.sop_uid,
        "patient_mrn": summary.patient_mrn,
        "patient_name_ar": summary.patient_name_ar,
        "patient_dob": summary.patient_dob.isoformat() if summary.patient_dob else None,
        "patient_sex": summary.patient_sex,
        "modality": summary.modality,
        "body_part": summary.body_part,
        "study_date": summary.study_date.isoformat(),
        "rows": summary.rows,
        "cols": summary.cols,
        "transfer_syntax": summary.transfer_syntax,
        "hash_sha256": summary.hash_sha256,
        "size_bytes": summary.size_bytes,
        "description": summary.description,
    }
    files = {
        "meta": (None, json.dumps(meta, ensure_ascii=False), "application/json"),
        "pixels": (path.name, path.read_bytes(), "application/dicom"),
    }
    r = await client.post(f"{api}/v1/instances", files=files, timeout=120)
    r.raise_for_status()
    log.info("uploaded %s → instance_id=%s", path.name, r.json().get("instance_id"))
    return summary.study_uid


async def complete_study(client: httpx.AsyncClient, api: str, study_uid: str, count: int) -> None:
    r = await client.post(
        f"{api}/v1/studies/{study_uid}/complete",
        json={"expected_instances": count},
        timeout=30,
    )
    r.raise_for_status()
    log.info("study completed: %s (n=%d)", study_uid, count)


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--inbox", default="./inbox")
    parser.add_argument("--api", default="http://localhost:8100")
    parser.add_argument("--once", action="store_true", help="ادفع ما في inbox مرة واحدة واخرج")
    args = parser.parse_args()

    inbox = Path(args.inbox)
    inbox.mkdir(parents=True, exist_ok=True)

    async with httpx.AsyncClient() as client:
        study_counts: dict[str, int] = defaultdict(int)
        seen: set[str] = set()

        async def drain() -> None:
            new_files = [p for p in inbox.glob("*.dcm") if str(p) not in seen]
            new_files.sort()
            for p in new_files:
                try:
                    study_uid = await push_one(client, args.api, p)
                    study_counts[study_uid] += 1
                    seen.add(str(p))
                except Exception as e:
                    log.exception("failed to push %s: %s", p, e)
            # نخطر اكتمال لكل study رأينا ملفاته
            for uid, count in list(study_counts.items()):
                try:
                    await complete_study(client, args.api, uid, count)
                except Exception as e:
                    log.exception("complete failed: %s", e)
            study_counts.clear()

        await drain()

        if args.once:
            return

        from watchfiles import awatch

        log.info("watching %s for new DICOMs", inbox)
        async for _ in awatch(inbox):
            await asyncio.sleep(0.5)
            await drain()


if __name__ == "__main__":
    asyncio.run(main())
