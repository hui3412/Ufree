# Share-code compatibility

Ordinary app exports use WF6; group shares use WF7. Import supports WF1 through WF7. Do not remove an older
decoder when introducing a later version. New versions require an updated app
on the receiving device. All versions remain self-contained and work offline.

## WF7 group shares

WF7 is used only when sharing a group. It retains every selected-field and payload
layout rule of WF6. Before compression, the WF6 selected envelope is prefixed with
a two-byte little-endian metadata length, then UTF-8 JSON metadata:
`{"v":1,"id":"source-group-id","name":"Group name"}`. Every person in the payload
is a member of that group; no external membership lookup or multipart reassembly
is needed. Metadata is limited to 1,024 bytes, IDs to 1–120 ASCII letters/digits,
underscores or hyphens, and names to 1–60 characters with no control characters.
The total uncompressed payload retains the existing 1 MiB limit. Existing modes,
CRC32, 15-bit text encoding and decompression limits remain unchanged. WFL7 is
the same ASCII URL transport as WFL5/WFL6, on the current deployment's origin/path.

All WF6 candidate layouts are evaluated with this metadata included, so QR
capacity and batch packing measure the actual complete group link. Every QR
subset carries the same source identity and only its listed members. Receivers
can save those subsets into the same locally named group across scans/reloads.
The source ID identifies shared membership only; it never overwrites a local ID,
group name, hidden state, order or unrelated group. Local `sharedId` records this
association. Duplicate and kept/replaced schedules map to their canonical local
names; Keep both maps to the new numbered name.

Group payloads always pause for the group/individual/cancel choice before any
write. Opened links retain local conflicts; pasted codes keep manual conflict
choices. Ordinary WF1–WF6 import behavior and WF5/WF6 output are unchanged.
Group metadata is transport-only and is not stored in the schedules database.
Older app versions require an update to read WF7; their existing codes remain
readable by the updated app.

## WF6 selected export details

Collection and single-person exports default to person names, exact weekdays and
times, busy-block kinds, course titles and rooms. The three-dot menu optionally
includes full stored instructor names, course codes, sections, semester labels
and other saved person/class details. Include all selects every extra field.
Changing selections clears stale codes, links and QRs. Exports never edit local
data. App-level preferences such as groups, nicknames and Undo are not schedules
and remain outside these exports.

WF6 retains the WF5 15-bit envelope, checksum and mode characters. Before optional
compression, its payload starts with a field-selection byte and a canonical
unsigned base-128 varint giving the core payload length. Bits 0–4 select instructor,
course code, section, semester and extra metadata, respectively. Other bits are
rejected. The core uses the existing JSON, binary or structural serializers.
Selected instructor strings retain their full original text. Full JSON rows are
used when course codes or sections are selected; structural candidates are used
when neither is selected. Original JSON and binary candidates remain fallbacks.

Optional extra metadata follows the core as UTF-8 JSON. It is an array of
`[personIndex, personExtras, [[classIndex, classExtras], ...]]` records. Empty
metadata needs no tail. Reserved core fields cannot appear in metadata, and
indices, duplicate references, byte lengths and decompression are validated.
Prototype-like JSON keys remain ordinary own properties. No metadata tail is
accepted unless its selection bit is set.

Imports expose the in-memory `share_profile: "selected"` and `share_fields`
markers. Duplicate detection compares only the selected shared fields, preserving
richer local schedules on identical reimports. Selected timetable or detail
changes still require the existing conflict choice. These markers are not saved
in the merged database. WF1–WF5 keep their existing comparison rules.

Links use `#import=WFL6<mode><base64url>`, transporting the same checked bytes.
All previous WFL5 links and WF1–WF5 codes still decode. Calling the encoder
without field options retains its legacy WF5 behavior for compatibility; the
app supplies explicit field options for every new export.

## WF5 schedule structure and dense text

### Direct links and QR sharing

The same WF5 payload can travel in a URL fragment:
`https://hui3412.github.io/Ufree/#import=WFL5<mode><base64url>`.
The bytes are the existing four-byte little-endian CRC32 followed by the payload.
Base64url has no padding. `WFL5` distinguishes URL transport from the dense
Unicode `WF5` message format; mode and all existing decoding rules are unchanged.
Canonical base64url, checksum, payload and decompression limits are validated.
The importer accepts complete share links, bare WFL5 values and old WF1–WF5
message codes. Old codes may also appear in an `import` fragment.

The fragment is processed on-device after the saved database loads, then removed
from the current address. Opened links/QRs add schedules automatically and show
added/skipped counts. Identical schedules and differing schedules with an existing
name are skipped without prompting, preserving local details. Actual additions
support Undo. Unreadable saved data blocks automatic import. Pasting a link in the
manual importer still opens a selection preview and offers conflict choices.
Anyone holding a link or QR can read its schedules; the format is not encrypted.

QR generation uses a locally bundled MIT-licensed Project Nayuki encoder with
medium error correction and a four-module quiet zone. A complete ASCII URL over
2,331 bytes is rejected for QR display; the original code and full link remain
available. Dense QR codes suggest selecting fewer schedules. Both collection and
single-person exports offer Copy link and Show QR. QR support is cached offline.

WF5 retains exactly the compact fields of WF4. New exports still omit course
codes/sections and infer instructor surnames without changing the local database.
All released WF4 JSON and binary layouts remain export candidates. The encoder
also measures the expanded vocabulary, exact five-minute escapes, per-person time
units, and structural layouts below. It chooses the smallest payload, raw or
compressed. Unknown text and unusual UTF-16 retain literal and JSON fallbacks.

The envelope is `WF5` + mode + padding + 15-bit text, containing a little-endian
four-byte CRC32 followed by the payload. Padding is one character from
`0123456789abcde`, equal to the trailing zero-bit count. The stable BMP alphabet,
in order, is U+4E00–U+9FFF, U+3400–U+4DBF and U+AC00–U+C03F. Each character is
one UTF-16 code unit. Padding, alphabet, checksum and decoded sizes are validated.
CRC32 detects accidental damage; it does not authenticate or encrypt schedules.

| Mode | Payload | Compression |
|---|---|---|
| J / D / Z | WF4 slim JSON | None / raw DEFLATE / wrapped DEFLATE |
| B / R / S | Binary deltas, shared labels or recurring patterns | None / raw DEFLATE / wrapped DEFLATE |
| T / U / V | Structural tables and bit-packed columns | None / raw DEFLATE / wrapped DEFLATE |

For B/R/S, WF4 binary layout bits retain their meaning. Dictionary-enabled
strings now use `WORDS5`, a permanent 152-entry table whose first 31 IDs match
WF4. IDs 1–31 are single-byte tokens; larger IDs are escaped with byte 0 then
an unsigned base-128 varint. Literal bytes below 32 use byte 0 then the literal
byte. Exact Unicode word boundaries and longest phrase matching preserve case
and spelling. Encoders may use the first 63, 127 or all 152 entries; IDs stay
unchanged, so the complete table decodes all subsets. Do not reorder this table.

Binary header bit 6 selects a five-minute time table: byte values 0–254 mean
minute values 0–1270; 255 escapes to an exact-minute varint. This applies to
absolute starts/durations and requires a one-minute global unit. Header bit 7
instead selects per-person time units, stored as an index after each person's
class count for layouts 0/1. Bits 6 and 7 cannot both be set. Layout 2 retains its
global unit. Irregular times and late-night values are never rounded.

Structural T/U/V headers encode `layoutIndex * 4 + dictionaryIndex` in one byte.
Dictionary indices 0/1/2/3 select literal UTF-8 / 63 / 127 / 152 entries. Layout
indices are permanent:

| Index | Layout |
|---:|---|
| 0 | Shared start/duration pair table |
| 1 | Independent start and duration tables |
| 2 | Independent times with optional per-person weekday tables |
| 3 | Independent times with sorted label/time tables |
| 4 | Independent times, byte-aligned person data |
| 5 | Independent times, byte-aligned columns |

The bit stream uses most-significant bits first, minimum-width table references
(`ceil(log2(count))`, zero bits for a single item), and unsigned base-128 varints
written at the current bit position. The three field tables are course title,
instructor surname and room, in that order. Each entry has a one-bit presence
flag then a byte-length-prefixed string. A shared class-identity table stores
course and instructor references plus a one-bit busy flag. Rooms vary separately.
Time tables store nine-bit five-minute indices 0–287; index 288 escapes to an
eleven-bit exact minute. Other indices and minutes above 1439 are rejected.

People store their names, the existing semester token, and class count. Columns
store original weekday order, time references, class-identity references and
room references. Layout 2 uses a one-bit flag to optionally select a weekday
table, with a three-bit table count and three-bit weekday entries. Layouts 4/5
require zero alignment padding. Strings, table sizes, indices, person counts,
class counts, semesters, minutes, trailing bits and decompressed bytes are bounded
and validated before schedules are returned. Person and class order stay exact.

WF5 imports retain WF4's in-memory `share_profile: "compact"` marker. Reimports
skip equivalent schedules without overwriting richer saved metadata. WF1–WF3
still compare their full fields. Import/export need no network lookup or dictionary
download. An older app must refresh before it can import a new WF5 code.

## WF4 compact sharing

WF4 intentionally omits course codes and sections, and replaces instructor full
names with inferred surnames. It retains person names, semester state, exact
days/times, course titles, rooms and busy-block kinds. Export does not modify the
local database. JSON backups still contain the full details. Surname inference
uses the part before a comma, or the final name segment with common surname
particles. Hyphenated surnames and separately listed instructors are preserved.
This is a heuristic, not a reliable parser of every naming convention.

WF4 has the same envelope and six mode characters as WF3. Its JSON class rows
are `[dayAndKind, startMinute, duration, course, room, surname]`, with trailing
nulls removed. Binary layouts retain the WF3 field mask, with omitted course
code and section fields absent. Binary header bit 5 enables the WF4 dictionary;
bits 6 and 7 are rejected. The time-unit index uses bits 2–4.

The dictionary is built into `schedule-share-code.js`. IDs 1–31 represent its
fixed `WORDS` table, in order. Do not change the table or reassign IDs in WF4.
Strings first escape original control characters U+0000–U+001F as U+0000 plus
the original character, then replace exact dictionary phrases at Unicode word
boundaries with one control-byte token. Longest phrases win; case and spelling
stay exact. UTF-8 encoding follows substitution. Import reverses tokens and
escapes, validates expanded string lengths, and rejects malformed escapes.
The dictionary also applies to names and rooms without changing their text.

The encoder measures slim JSON and all three binary layouts, with and without
the dictionary, raw and compressed. It picks the smallest candidate. A common
word is only tokenized when the dictionary candidate actually saves bytes.
Unknown words and unusual Unicode retain a literal or JSON fallback.

WF4 imports carry an in-memory `share_profile: "compact"` marker. Duplicate
comparison projects the existing schedule onto the retained WF4 fields. A
reimport therefore skips without overwriting richer local details. Different
retained fields still prompt, and WF1/WF2/WF3 keep full-field conflict checks.
The marker is not written into the merged database.

The export screen reports whether a code fits a 1,000-character message. Longer
codes remain complete and copyable; users can select fewer schedules for one
message. The app does not truncate or silently drop people.

## WF3 lossless format (retained for imports)

## Envelope

WF3 uses `WF3` followed by one mode character and the existing base-14-bit text
encoding. Text characters are BMP CJK U+4E00 through U+8DFF. The first digit of
the encoded text stores padding in two-bit units. Its decoded bytes start with
the little-endian CRC32 of the remaining bytes, followed by those payload bytes.
CRC32 is for accidental damage detection, not authentication or encryption.

| Mode | Payload | Compression |
| --- | --- | --- |
| J | WF2 compact JSON | None |
| D | WF2 compact JSON | Raw DEFLATE |
| Z | WF2 compact JSON | Zlib-wrapped DEFLATE |
| B | Binary | None |
| R | Binary | Raw DEFLATE |
| S | Binary | Zlib-wrapped DEFLATE |

The original WF3 encoder tried all three binary layouts and compact JSON. Each candidate was
also compressed when the browser supported it. The smallest byte payload won.
This guaranteed no longer character code than the WF2 encoder for the
same accepted selection and browser compression support. Unicode encoding,
checksum and prefix overhead have the same lengths in WF2 and WF3.

## Binary payload

Integers use unsigned little-endian base-128 varints with continuation bit 7.
Overlong varints are rejected. Strings are a byte-count varint followed by UTF-8.
Strings preserve leading BOM characters; lone UTF-16 surrogates use JSON instead
of replacement characters. Labels, names and metadata are never normalized by
the binary serializer.

The first byte is `layout | (timeUnitIndex << 2)`. Layouts are 0 (literal labels),
1 (shared labels) and 2 (recurring patterns). Units are `[1, 5, 15, 30, 60]`
minutes. The chosen unit divides every class start and duration.

Layouts 1 and 2 first store a label-table count, then that many strings. Layout 2
then stores a pattern-table count, followed by patterns. Each pattern stores its
start and duration in time units, then its labels and busy-block flag. A pattern
is shared only when start, duration, all five labels and kind match exactly.

All layouts then store the person count and, for each person, the name, semester
integer, class count and class records. Semester integers are 0 (missing), 1
(explicitly not set), or `2 + (year - 2000) * 2 + term`, where term is 0 for Winter
and 1 for Fall. Class order and person order are retained.

Layouts 0 and 1 store each record as:

1. A varint `zigzag(startDelta) * 8 + weekday`. Weekdays are Monday=0 through
   Sunday=6. Each day's previous start begins at 08:00 for each person, then is
   updated after each record. Deltas are in the chosen time unit. Zigzag maps
   nonnegative n to 2n and negative n to -2n-1.
2. The duration as a varint in the chosen time unit.
3. A one-byte field mask: bits 0–4 indicate course, course code, section, room
   and instructor, in that order; bit 5 indicates a busy block. Other bits are
   rejected. Present labels follow in field order as strings in layout 0 or
   zero-based table-index varints in layouts 1 and 2.

Layout 2 class records are varints `patternIndex * 8 + weekday`.

## Limits and older versions

Limits remain 250 people, 500 classes per person, 10,000 classes overall,
200 UTF-16 units per name or label, and 1 MiB per raw or decompressed payload.
Binary parsing also bounds tables, indices, string byte counts, varints and
allocations. Invalid times, invalid flags, truncation and trailing bytes are
rejected before schedules are returned. Person-name uniqueness uses the existing
normalized comparison; exported names and labels themselves stay unchanged.

WF2 modes J/D/Z use the same Unicode envelope and a compact JSON payload.
WF1 modes J/G use the original base32 alphabet, an eight-hex-digit CRC32 before
the body, and full JSON with optional gzip. WF1 is case-insensitive. Its frozen
compatibility fixtures were generated using the original WF1 and WF2 encoders.

WF1/WF2/WF3 shared fields remain name, optional semester, weekday, exact start/end times,
course, course code, section, room, instructor and kind. Local nicknames, groups,
Undo history, source paths and OCR review markers are not shared.


