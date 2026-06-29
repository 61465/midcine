"""WebSocket bridge: يقرأ Redis Streams ويبثها للمتصفحات المتصلة."""
from __future__ import annotations

import asyncio
import contextlib
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .streams import get_redis

router = APIRouter()


class WSHub:
    def __init__(self) -> None:
        self.connections: set[WebSocket] = set()
        self._task: asyncio.Task | None = None

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.connections.add(ws)
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._pump())

    async def disconnect(self, ws: WebSocket) -> None:
        self.connections.discard(ws)

    async def broadcast(self, event: dict) -> None:
        dead: list[WebSocket] = []
        for ws in list(self.connections):
            try:
                await ws.send_json(event)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.connections.discard(ws)

    async def _pump(self) -> None:
        r = get_redis()
        last_ids = {b"ai:inference": "$", b"llm:report": "$", b"doctor:signed": "$"}
        while True:
            try:
                resp = await r.xread(
                    {k.decode(): v for k, v in last_ids.items()},
                    block=5000,
                    count=10,
                )
                if not resp:
                    continue
                for stream, msgs in resp:
                    for msg_id, fields in msgs:
                        last_ids[stream.encode() if isinstance(stream, str) else stream] = msg_id
                        ev = {"type": _stream_to_type(stream), "payload": _parse_fields(fields)}
                        await self.broadcast(ev)
            except Exception as e:
                await asyncio.sleep(1)
                continue


def _stream_to_type(stream: str) -> str:
    mapping = {
        "ai:inference": "STUDY_AI_READY",
        "llm:report": "LLM_DRAFT_READY",
        "doctor:signed": "WORKLIST_UPDATED",
    }
    return mapping.get(stream, "WORKLIST_UPDATED")


def _parse_fields(fields: dict) -> dict:
    out = {}
    for k, v in fields.items():
        try:
            out[k] = json.loads(v)
        except Exception:
            out[k] = v
    return out


hub = WSHub()


@router.websocket("/v1/realtime")
async def realtime(ws: WebSocket):
    await hub.connect(ws)
    try:
        while True:
            await ws.receive_text()  # ping / keepalive
    except WebSocketDisconnect:
        pass
    finally:
        with contextlib.suppress(Exception):
            await hub.disconnect(ws)
