"""DICOM Modality Worklist SCP entry point.

Listens on port 11115 AET=MIDCINE-MWL. Any CT/MR/CR modality can C-FIND
the scheduled worklist entries via ModalityWorklistInformationFind SOP class.

Standards: DICOM PS3.7 + IHE SWF profile.
"""

from __future__ import annotations

import logging
import os
import time
from collections.abc import Iterator

from pynetdicom import AE, evt
from pynetdicom.sop_class import ModalityWorklistInformationFind

from .mwl_provider import filter_by_query, load_worklist

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
log = logging.getLogger("mwl-scp")

PORT = int(os.getenv("MWL_PORT", "11115"))
AE_TITLE = os.getenv("MWL_AET", "MIDCINE-MWL")


def _handle_find(event: evt.Event) -> Iterator[tuple[int, object | None]]:
    """C-FIND handler — yields (status, dataset) for each match, then (0x0000, None)."""
    identifier = event.identifier
    peer = event.assoc.requestor.ae_title.strip()

    started = time.perf_counter()
    items = load_worklist()
    matches = filter_by_query(items, identifier)
    latency_ms = (time.perf_counter() - started) * 1000

    log.info(
        "mwl: C-FIND from AE=%s → %d items scanned, %d matches (%.0fms)",
        peer,
        len(items),
        len(matches),
        latency_ms,
    )

    if event.is_cancelled:
        log.info("mwl: query cancelled by peer")
        yield 0xFE00, None
        return

    for ds in matches:
        yield 0xFF00, ds  # PENDING

    yield 0x0000, None  # SUCCESS


def main() -> None:
    ae = AE(ae_title=AE_TITLE)
    ae.add_supported_context(ModalityWorklistInformationFind)
    ae.maximum_pdu_size = 0  # unlimited
    ae.acse_timeout = 60
    ae.dimse_timeout = 60
    ae.network_timeout = 60

    handlers = [(evt.EVT_C_FIND, _handle_find)]

    log.info(
        "midcine dicom-mwl: starting SCP on 0.0.0.0:%d AET=%s",
        PORT,
        AE_TITLE,
    )
    ae.start_server(("0.0.0.0", PORT), block=True, evt_handlers=handlers)


if __name__ == "__main__":
    main()
