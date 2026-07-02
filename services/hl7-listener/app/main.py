"""Entry point for midcine HL7 v2 MLLP listener."""

from __future__ import annotations

import asyncio
import logging
import signal
import sys

from .mllp_server import serve

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)


async def _run() -> None:
    stop = asyncio.Event()

    def _handle_sig(*_: object) -> None:
        stop.set()

    if sys.platform != "win32":
        loop = asyncio.get_event_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, _handle_sig)

    server_task = asyncio.create_task(serve())
    stop_task = asyncio.create_task(stop.wait())
    _, pending = await asyncio.wait({server_task, stop_task}, return_when=asyncio.FIRST_COMPLETED)
    for t in pending:
        t.cancel()


if __name__ == "__main__":
    asyncio.run(_run())
