Schedule content storage v2

The test Worker shares immutable timetable content across account records, fixed
snapshots and inbox deliveries. Account ownership and authorization do not change.
Names, source filenames, OCR/import metadata, semester and optional class details
remain in per-copy compressed envelopes. Missing fields, nulls, original class
order and unknown fields are reconstructed losslessly. Shared cores contain day,
start, end, course, room and normalized class/busy-block kind. Differences in any
of those values create a different core. This is physical storage sharing only;
it does not identify people, connect accounts or merge visible list entries.

Apply migrations 0004 and 0005 before deploying the new Worker. Migration 0005
queues all existing payloads, including v1 compressed references. Conversion is
bounded, verifies exact round trips and uses compare-and-swap updates without
changing sync revisions. Old formats remain readable. A failed conversion leaves
its job queued and its original record intact. Original unreferenced objects are
retained by the existing staging lease and subsequently reclaimed by scheduled GC.
Logical account quotas count the original schedule bytes, not envelope size.

An authenticated POST /admin/compact with JSON {"limit":10} converts at most 20
queued rows per request. It requires the separate server-side
ADMIN_DIAGNOSTICS_TOKEN, never a user session. It returns only completed/pending
counts. Without that secret the endpoint is disabled. Normal sync and the daily
scheduled task also process bounded batches; public health checks remain free of
database queries. Do not put this secret in the frontend or commit it.

Rollback: the previous Worker cannot reconstruct v2 schedule envelopes. Revert
only after converting v2 records to plain JSON with the v2 reader. Do not simply
roll the Worker back after migration. The additive schema need not be removed.
