# tunnel-broker · Port 8280

The matchmaker. Given an approved consent + a list of study UIDs, mints short-lived
(TTL 5 min) mTLS cert pairs via step-ca and returns NAT-traversal hints (STUN). The
hospitals connect peer-to-peer; **DICOM never touches the cloud**.

## Skeleton state
Endpoint returns 501. Sprint 8 wires consent verification + step-ca client + audit.
