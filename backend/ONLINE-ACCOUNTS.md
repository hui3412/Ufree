Attached accounts v2 (test setup only)

Migration 0007 intentionally deletes every existing test account, session,
connection, schedule record and cloud object. The user authorized discarding this
test data. It drops cloud snapshot sharing tables. Never apply this migration to
production or another repository's database. Existing browser Local schedules
are independent and are not modified. Users of the old test accounts must sign up
again; old session identities are invalidated in the updated frontend.

Each account owns p:Personal plus @profile (nickname) and @preferences. Signup
copies only the selected personal schedule, atomically with account creation.
The API rejects additional schedule names and deletion of the attached schedule.
Course name, day, start and a later end time are required on every class, on the
client and server. Empty schedules mean no classes; optional room/teacher/details
and unknown schedule fields remain lossless. Usernames cannot change. Nicknames
are optional, public display labels up to 60 characters.

Local and Online tabs use the same availability/search/group/display functions.
Local keeps independent fixed browser copies and standalone codes/QR/files.
Online renders only the owner's attached schedule and f:<account-id> records for
mutually accepted followers. Online rows are read-only in the collection. Profile
edits update the single attached schedule and nickname locally before upload;
offline changes are queued. Concurrent schedule edits are preserved as local
conflict drafts that can be reviewed in Profile, never as extra cloud schedules.
Profile contains follower management. Blocks or stopping following revoke both
live grants. Live nicknames propagate through the same revision-based delta feed.
Account school and authentication fields never enter follower search results.

Cloud /shares and /deliveries routes now return 410 without touching D1, including
legacy guest links. Follow notifications use /connections/inbox. There is no
bulk Local upload and no cloud snapshot transport in the frontend. The normal
revision coalescing, quota pause and offline viewing behavior remain in place.

Publish only to hui3412/Ufree and youfreetest/ufree-test-db. The Worker requires
migration 0007 before the new account endpoints run. Builds apply it once using
d1_migrations. The reset is irreversible for the intentionally discarded test
data; ordinary code rollback must not revive the removed snapshot feature.
