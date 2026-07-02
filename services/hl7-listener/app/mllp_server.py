"""HL7 v2 MLLP (Minimum Lower Layer Protocol) TCP server.

MLLP framing:
  Message starts with 0x0B (VT)
  Message ends with 0x1C 0x0D (FS CR)

For each ORM^O01 received:
  1. Parse via hl7_parser
  2. Write StudyRecord JSON to $MIDCINE_STUDIES_DIR/{study_uid}.json
  3. Send MSA|AA ACK back with same control ID

Standards: HL7 v2.5 MLLP + IHE Radiology SWF profile.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
from pathlib import Path

from .hl7_parser import build_ack, parse_orm

log = logging.getLogger("mllp-server")

MLLP_START = b"\x0b"
MLLP_END = b"\x1c\x0d"

STUDIES_DIR = Path(os.getenv("MIDCINE_STUDIES_DIR", "/data/studies"))


async def _handle_message(hl7_text: str) -> str:
    """Parse ORM and write study record. Returns ACK text (with MLLP framing added by caller)."""
    record, msh_info = parse_orm(hl7_text)

    if record is None:
        log.warning("hl7: message rejected — could not parse ORM")
        return build_ack(msh_info or {}, ok=False, error="Cannot parse ORM^O01")

    STUDIES_DIR.mkdir(parents=True, exist_ok=True)
    file_path = STUDIES_DIR / f"{record['study_uid']}.json"
    try:
        with file_path.open("w", encoding="utf-8") as f:
            json.dump(record, f, ensure_ascii=False, indent=2)
        log.info(
            "hl7: wrote study %s (patient=%s modality=%s body=%s priority=%s)",
            record["study_uid"],
            record["patient_id"],
            record["modality"],
            record["body_part"],
            record["priority"],
        )
    except OSError as e:
        log.exception("hl7: write failed: %s", e)
        return build_ack(msh_info or {}, ok=False, error=f"Storage error: {e}")

    return build_ack(msh_info or {}, ok=True)


async def _handle_connection(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    peer = writer.get_extra_info("peername")
    log.info("hl7: connection from %s", peer)
    try:
        buf = b""
        while True:
            chunk = await reader.read(4096)
            if not chunk:
                break
            buf += chunk

            # Look for complete MLLP-framed messages
            while True:
                start_idx = buf.find(MLLP_START)
                end_idx = buf.find(MLLP_END, start_idx + 1) if start_idx >= 0 else -1
                if start_idx < 0 or end_idx < 0:
                    break
                # Extract message between framing bytes
                raw = buf[start_idx + 1 : end_idx]
                buf = buf[end_idx + len(MLLP_END) :]
                try:
                    hl7_text = raw.decode("utf-8", errors="replace")
                except UnicodeDecodeError:
                    hl7_text = raw.decode("latin-1", errors="replace")
                ack_text = await _handle_message(hl7_text)
                # Send framed ACK back
                ack_frame = MLLP_START + ack_text.encode("utf-8") + MLLP_END
                writer.write(ack_frame)
                await writer.drain()
    except (ConnectionError, asyncio.IncompleteReadError) as e:
        log.info("hl7: peer %s disconnected: %s", peer, e)
    except Exception as e:
        log.exception("hl7: unexpected error handling %s: %s", peer, e)
    finally:
        writer.close()
        with contextlib.suppress(ConnectionError, OSError):
            await writer.wait_closed()


async def serve(host: str = "0.0.0.0", port: int | None = None) -> None:
    port = port or int(os.getenv("HL7_PORT", "2575"))
    server = await asyncio.start_server(_handle_connection, host, port)
    addrs = ", ".join(str(sock.getsockname()) for sock in server.sockets)
    log.info(
        "midcine hl7-listener: listening on %s (studies_dir=%s)",
        addrs,
        STUDIES_DIR,
    )
    async with server:
        await server.serve_forever()
