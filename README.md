# UFree

link: [www.youfree.ca](https://www.youfree.ca)

### Version 82 — Compact group controls

October 14, 2026

- Make the main group management button icon-only at every width, retaining its accessible name and tooltip.
- Remove Edit Group from each group's … menu. Editing stays in the group management panel; the dropdown keeps Send group to top and Weekly availability with a smaller footprint.

### Version 81 — Keyboard search exit

October 14, 2026

- Also collapse search when keyboard focus returns to its icon. Press the icon again to reopen the field.

### Version 80 — Search closes when you leave

October 14, 2026

- Keep the search icon and close the search field automatically when focus leaves it or the user clicks outside. Reopen it with the icon. Closing clears the filter; using the field's clear button keeps it open.
- Let outside clicks finish before collapsing so selecting people and using group controls still work. Preserve keyboard focus when filtered cards are rebuilt.

### Version 79 — Stored people Show/Hide button

October 14, 2026

- Replace the boxed plus beside Stored on this device with a compact Show/Hide button. The list stays collapsed by default and resets when the Schedules panel reopens.

### Version 78 — Search and group editing

October 14, 2026

- Open the compact magnifying glass beside GROUP to search names and nicknames in the current All/Free or Groups view. The input opens below the row; clearing or closing it restores that view.
- Choose Edit Group from a group's … menu to rename it or remove members with red icon buttons. Save applies changes and Cancel discards them; schedules and other memberships are preserved. Add people remains available in a disclosure.
- Fit the expanded controls at narrow widths with adaptive labels and retain normal page scrolling.

### Version 77 — Help, privacy and page scrolling

October 14, 2026

- Expand Help & Tips with collapsible feature guides, feedback at ufree_info@proton.me and a collapsed Apple Shortcuts Home Screen guide at the very bottom.
- Remove Google Analytics and its CSP permissions. Explain local browser storage, no accounts or app tracking, and normal hosting/asset requests without claiming app-level encryption.
- Explain compact CJK/Hangul text-code encoding inside every schedule export workflow.
- Use natural page scrolling for People and person details at all widths, avoiding nested desktop scroll traps.

### Version 76 — Expanded person action row and credit hierarchy

October 13, 2026

- Select a person to reveal Share beside Full schedule, + and Delete; the card itself now shows only the person's name and schedule status.
- Keep all four actions on one row, using the calendar icon alone for Full schedule when space is limited.
- Show the larger team credit on its own line with the smaller inspiration credit centered immediately below, and outline the stored-people expand/collapse symbol with a square border.

### Version 74 — Individual sharing and cleaner UFree controls

October 13, 2026

- Share one person's schedule directly from their card as a URL, QR code or text code, with optional export details.
- Select a person to open Full schedule, add them to an existing group with +, or delete their local schedule with confirmation and session Undo.
- Label the between-class busy status Class Soon and collapse the stored-people list by default.
- Remove the home live-status summary and group shared-break forecast while retaining the weekly group availability tool.
- Use UFree throughout the app, install metadata, notifications and sharing; keep existing device storage compatible.
- Place team credits at the bottom of Help and Settings.

## Fork updates — last updated October 5, 2026



### Summary

- **Cleaner design:** Subtle filled backgrounds, compact mobile controls and automatic scrolling to newly opened panels.
- **Image recognition:** On-device English/French OCR for timetable screenshots, including repeated half-hour boundary labels, hourly start/end rows, abbreviated dated weekday headings and coloured class blocks, with independent retries and warnings for uncertain detections.
- **Timetable editor:** Create schedules manually or correct imported and saved schedules in a seven-day grid.
- **Availability:** Check now or preview another time, including weekends, with real breaks and next-class details.
- **Groups:** Overlapping memberships, live free counts, shared-break suggestions and weekly availability.
- **Saved ordering:** Independent person orders for each list, pinned people first, and **Send group to top**.
- **Undo:** Reverse schedule and order changes during the current page session.
- **Sharing:** PDF/JSON imports, JSON backups and self-contained codes with exact duplicate checks and a choice for conflicting schedules.
- **Semester labels:** Identify older timetables and update their term without changing classes.

These three milestones group the completed work chronologically; their labels are separate from the app's package and cache versions.

### Version 64 — Clickable empty-state plus

October 8, 2026

- The plus above Add your first schedule is now an accessible button that opens the same picture picker as Add schedule picture.

### Version 63 — Full schedule scrolling

October 8, 2026

- Full schedules now use the same touch scrolling and momentum handler as the import/edit timetable.
- Vertical swipes and momentum transfer to the surrounding dialog at the timetable edges. Horizontal scrolling and pinch zoom remain native.
- Run the scrolling regression cases against both timetable views.

### Version 62 — Full schedules and quick individual exports

October 8, 2026

- Added Full schedule beside the selected person's name, opening a read-only seven-day timetable with exact class times.
- Export and copy just that person's schedule directly from the bottom of the weekly view using the existing compact code system.
- Preserve local details and canonical names when exporting a nicknamed person; retain the existing multi-person export and older-code imports.

### Version 61 — Restore header and relocate credits

October 8, 2026

- Restored the previous homepage header while retaining the compact settings, theme controls and shorter descriptions.
- Moved both app credits from the homepage to the bottom of Settings.
- Testing was omitted at the user's request.

### Version 60 — Compact homepage and settings

October 8, 2026

- Added a responsive masthead with a calendar mark and compact navigation.
- Settings use collapsible sections; the friends list and individual nickname editors stay tucked away until opened.
- Replaced large theme cards with compact color swatches and a light/dark segmented control.
- Shortened descriptions throughout schedule import, sharing and groups while retaining privacy and export limitations.
- Verification was omitted for this UI update at the user's request.

### Version 59 — Smaller schedule sharing codes

October 8, 2026

- Added WF5 exports with a larger fixed vocabulary, independent time and field tables, compact numeric references, and layouts that improve DEFLATE compression.
- Keep the original JSON and binary export methods as fallbacks. WF1–WF4 codes remain importable with their original details and duplicate behavior.
- Exact minutes, weekends and retained schedule fields survive every layout. Codes remain self-contained and work on device, including offline use.
- Frozen WF4 compatibility fixtures, every valid minute boundary, all layouts and compression modes, damaged inputs, Unicode, and the app's export/import flow are tested.

### Version 49 — Coloured intensive-class border detection

- Checked ten additional supplied timetable pictures, including Saturday classes, tall screenshots, cropped empty final rows, and explicit intensive-class time ranges.
- Fixed an overlapping duplicate caused by JPEG ringing around a wide title inside a purple class. A candidate grid line must now also have contrast in the padding at at least one column edge. Slightly off-center weekday headings and genuine tinted borders remain supported.
- Added raster regressions for dense titles, tinted compression stripes, real coloured borders, off-center columns, and explicit end times beyond a printed row end. Course wording still requires review.

### Version 48 — Public Omnivox timetable regression coverage

- Tested five distinct public Omnivox timetables from LaSalle/LCI guides, Sainte-Foy and Trois-Rivières, across nine image variants. Eight variants reproduced all visible busy intervals. The remaining tiny, annotated guide-page screenshot still fails with a clear error; its original embedded timetable image works.
- Added abbreviated English/French weekday and date-heading recognition, a focused heading retry, and conservative recovery of one unreadable internal weekday when four aligned headings including Monday and Friday remain visible.
- Recognize hourly start/end rows such as 08:00–08:50 without doubling the time scale. Preserve irregular final rows such as 16:55–17:45 and their local physical boundaries.
- Avoid false busy blocks caused by dark column edges while accepting faint gray course text. Numbered schedule-configuration grids are not treated as ordinary timetable screenshots.
- Regression fixtures contain only weekday/time labels and OCR coordinates, not public schedule pictures, student identities, or course text. The four supplied cropped and uncropped half-hour examples remain covered.
- These checks cover busy times, not perfect transcription. Small, blurry or annotated pictures can still fail or produce uncertain wording; always compare the review grid with the picture before saving. OCR remains on-device.

Public sources: [LaSalle English guide](https://dam.lcieducation.com/1fizm6CngLhkF2on733ugFS68_sODU5MDI0NDlhMGRjNDFm/Guide_utilisation_Omnivox_EN.pdf), [LaSalle French guide](https://cdn.lcieducation.com/-/media/files/montreal/students-resources/guide_utilisation_omnivox_fr.pdf), [LCI Melbourne guide](https://cdn.lcieducation.com/-/media/files/melbourne/omnivox-guide/omnivox-lci-melbourne-guide.pdf%3Fla=en&rev=fa082abc9ea74c6b8ef929d7e8a486b9), [Sainte-Foy printable example](https://www.fichier-pdf.fr/2012/01/16/omnivox-cegep-de-sainte-foy/), and [Trois-Rivières timetable examples](https://www.cegeptr.qc.ca/horaire/).

### Reader 52 — Small cropped pictures and coloured separators

October 8, 2026

- Reproduced missing afternoon classes and merged adjacent classes in a newly supplied small, cropped timetable, including in the deployed browser.
- Accept time-gutter OCR that loses a colon (`1130`, `1600`) or reads it as a dash (`09-00`), while retaining clock validation and independent geometric checks.
- Fit repeated half-hour axes to shared boundary labels, not padded single-label centers, so small errors do not accumulate down a tall timetable.
- Detect lighter, white and chromatic separators between coloured classes using consistent contrast in one RGB channel across the column. Require matching contrast directions, edge evidence and uniform colour channels to avoid splitting classes at text or JPEG halos.
- Added a coordinate-only fixture from the failing time gutter and raster regressions; no supplied pictures or course/person text are published. OCR remains entirely on-device, and imports still require review before saving.

### Reader 51 — Validated on-device fallbacks and complete-axis checks

October 8, 2026

- Reproduced a supplied phone screenshot failing in the deployed browser even though the matching native OCR test passed. Browser imports are now included in verification; matching OCR engine/model versions alone do not guarantee identical rasterization or results.
- Added a second layout-reading mode, focused/enlarged heading retries, and independent sparse/contrast-enhanced time-gutter retries. Temporary retry canvases are bounded and released immediately.
- Added a second half-hour axis method: at least eight distinct readable clock labels must agree with a consistent lattice of visible time-gutter borders. This handles omitted duplicate boundary labels without manufacturing OCR observations. Middle-of-row configuration labels and inconsistent clocks remain rejected.
- Browser verification exposed a second issue: a consistent subset of clock labels could end at 14:30 while the visible grid continued to 18:00. Check for continuing physical gutter rows and missing leading rows before accepting any axis; incomplete readings trigger dedicated full-column retries instead of cropping away later classes.
- Retry empty/low-quality class text, keeping one complete OCR pass rather than mixing conflicting course codes. Unreadable individual busy spans remain editable; pictures where most detected blocks remain unreadable are rejected instead of presenting a mostly unverified schedule.
- Label border-recovered times for review, add reader/stage information to errors, and time out stalled OCR jobs. Picture imports release the large source canvas after cropping the timetable to reduce peak retained memory.
- No remote OCR, new external service, or schedule-file upload was added. The existing review/confirmation, name-entry, editing and scrolling flows are preserved.

### Version 12.1 — Image recognition and timetable editing

October 2, 2026

- Added on-device English/French OCR for JPG/JPEG, PNG and WebP timetable pictures, without sending pictures to an OCR server or AI API.
- Added a seven-day review grid, manual schedule creation and editing of saved timetables.
- Allowed class blocks to be added, corrected or removed, with course details optional and canceled edits leaving saved data unchanged.
- Improved faint-border and time-column detection, wrapped room/instructor text and common room-label OCR errors.
- Preserved unfamiliar, unreadable and merged entries as editable busy spans, including athlete/conflict blocks and weekend classes.
- Showed breaks in the review grid, merged overlapping busy periods and excluded passing gaps of **10 minutes or less** from free time.
- Added next-real-break times to person cards.
- Bundled and cached OCR files for later offline use on supported browsers.

Use a clear, upright picture with the full timetable, borders, times and weekday headings visible. Uncropped screenshots are supported: after locating the time axis and weekday columns, the detector automatically isolates the timetable before reading classes, excluding surrounding page content. Manual cropping can still help when the timetable is too small or blurry. Review recognized times and text before saving; image-only PDFs should use the picture importer. Deploy the root app files and complete `assets/ocr/` folder over HTTPS or `http://localhost`. Offline recognition requires cached OCR files and retained browser storage.

### Version 12.2 — Sharing, groups and schedule Undo

October 2–5, 2026, before the visual overhaul

- Added selected-schedule sharing and pasted-code import, then shortened codes with compact times, compression and dense Unicode encoding.
- Initially compared same-name imports by weekly busy-time overlap; Version 12.3 replaces this rule with exact checks and explicit conflict choices.
- Added overlapping groups, live free counts, shared-break suggestions and weekly availability.
- Added an **8:15 AM–8:05 PM** group grid, weekend columns when needed, darker blocks for more free people and exact names/times on selection.
- Smoothed short group-grid transitions without changing the original intervals used for shared-break suggestions.
- Added **Undo** for saves, edits, renames, imports and removals, restoring affected preferences and memberships.
- Retained **20 changes per page session**, excluding canceled, invalid and unchanged operations.
- Optimized availability calculations, duplicate comparisons and group-calendar processing.
- Added fork-improvement credit beside the original creator.

Copy complete share codes, including special characters. New WF5 exports omit course codes and sections and shorten instructor names to inferred surnames, while retaining full local data and JSON backups. They choose the shortest of the original JSON/binary methods and schedule-specific tables, with optional DEFLATE compression and a built-in word dictionary. WF1–WF4 codes remain importable with their original details. Recipients should refresh the app before importing a new WF5 code. Codes stay self-contained and work offline. The export screen shows whether the selection fits a 1,000-character message. See [SHARE_CODE_FORMAT.md](SHARE_CODE_FORMAT.md) for the versioned format. Reloading clears Undo history, not saved schedules; finish or cancel an editor or code panel before undoing.

### Version 12.3 — Cleaner interface and saved personalization

October 5, 2026, from the visual overhaul onward

- Replaced outlined containers with clean filled backgrounds while retaining the layout, Settings, themes, notifications and personalization.
- Automatically revealed newly opened editors, picture reviews, import/export panels and group details, respecting reduced-motion preferences.
- Placed weekday and time fields side by side without visible labels and matched their heights, including on iPhone.
- Allowed edits during live mode to switch to a manual preview; **Use current time** restores live updates.
- Moved **Use current time** beside All/Free and Groups, removed Refresh, combined the class/free counts and saved the All/Free selection across reloads.
- Added automatic and editable Fall/Winter labels to new and previously unlabeled schedules.
- Showed only older semesters on main cards, greyed them out and added **Use current semester** without changing class times.
- Added compact recognition warnings that survive saving, reopening and Undo.
- Added **Replace**, **Keep both** and **Cancel** for same-name picture uploads, ignoring case and repeated spaces.
- Changed code imports to automatically add different names and skip only identical names and timetables; other same-name schedules offer **Keep both**, **Replace** or **Keep old one**.
- Made code-import choices apply separately to each conflict, with one Undo for the completed batch and no save until all choices are finished.
- Added mouse dragging, touch hold-and-drag and **Alt + Up/Down** person reordering, with independent saved orders for the main list, each group and Ungrouped.
- Preserved hidden people and positions across filters, reloads and renames; kept pinned people above unpinned people while allowing moves within either section.
- Removed drag grips and kept ordinary phone swipes from starting accidental reorders.
- Replaced the group checkbox checklist with **Hide/Show**, retaining collapsed headers, counts and menus.
- Added **Send group to top**, saved group order/collapse states and fixed clipped menus when every group is collapsed.
- Extended Undo to person/group order changes without changing schedules, other orders or collapse states.
- Reorganized Schedules, added the Omnivox optimization note, replaced school-specific wording and improved the fork documentation.
- Updated app caches while retaining OCR assets and added warnings when reordered positions cannot be saved.

Semester defaults use fixed approximate windows: Winter **December 23–May 31**, Fall **June 1–December 22**; labels can be changed or cleared. JSON and new share codes preserve semester labels; semester-aware codes require an updated app. JSON also retains OCR warnings, but share codes omit review markers. Groups, person orders and Undo history remain local and are not exported.

Code-import names are matched without case or repeated spaces. Exact timetable checks compare class days, times, course details and semester labels, ignoring class order, source files and local OCR warnings. **Keep both** adds the next unused numbered name, such as David 2; **Replace** retains the original name and local preferences; **Keep old one** leaves that schedule unchanged. Escape selects **Keep old one** for the current conflict.

### Improvement checklist

- Replaced outlined containers with cleaner filled backgrounds throughout the app.
- Kept the existing layout, Settings, themes, notifications and personalization features.
- Made the main weekday and time controls compact and placed them on the same row.
- Removed the visible weekday and time field labels.
- Made the time box the same height as the weekday box, including on iPhone.
- Allowed weekday and time edits while live mode is active, automatically switching to a manual preview.
- Made Use current time restore the actual weekday and time and continue updating.
- Moved Use current time beside the All/Free and Groups controls.
- Removed the separate Refresh button.
- Combined the in-class and free/total counts below the view controls.
- Kept the selected All/Free view after page reloads.
- Added local timetable-picture import for JPG/JPEG, PNG and WebP.
- Added on-device English/French OCR without uploading pictures to an OCR server or AI API.
- Bundled OCR files and cached them for later offline use on supported browsers.
- Added an editable seven-day timetable review grid.
- Added manual schedule creation without running OCR.
- Allowed saved timetables to be reopened and edited.
- Allowed class blocks to be added, corrected or removed before saving.
- Made course labels, codes, rooms and instructors optional for manual entries.
- Kept the saved timetable unchanged when an edit is canceled.
- Preserved occupied times even when course text is unfamiliar or unreadable.
- Improved recognition of faint JPEG grid borders and narrow time labels.
- Preserved numeric and wrapped room labels and wrapped instructor names.
- Corrected common OCR confusion between I, 1 and | after explicit room labels.
- Retained athlete and conflict blocks as occupied time.
- Kept merged course detections as editable busy spans rather than discarding them.
- Added Saturday and Sunday support to recognition, editing and availability.
- Showed breaks between classes in the review grid.
- Merged overlapping busy spans to prevent false breaks.
- Excluded gaps of 10 minutes or less from free-time breaks.
- Showed the next real break time on person cards.
- Added groups with overlapping memberships.
- Added group free counts and next shared-break suggestions.
- Added a weekly group-availability grid with darker blocks for more free people.
- Showed exact free and busy names when selecting a group-availability block.
- Limited the group grid to 8:15 AM–8:05 PM and included weekends when needed.
- Smoothed short group-grid transitions while preserving exact intervals for inspection.
- Removed the group visibility checklist.
- Made Hide collapse group members without removing the group's header.
- Kept each collapsed group's name, free count, Show button and three-dot menu visible.
- Added collapse and expand controls for Ungrouped people.
- Saved group collapse states across reloads.
- Added Send group to top without adding group drag-and-drop.
- Saved group order across reloads.
- Counted overlapping group members only once in the combined availability status.
- Fixed three-dot menus being clipped when all groups are collapsed.
- Added drag-and-drop person reordering on computers.
- Added hold-and-drag person reordering on touch screens.
- Removed the six-dot drag grips.
- Kept ordinary phone swipes and short taps from starting a reorder.
- Added Alt + Up/Down keyboard reordering.
- Saved separate person orders for the main list, each group and Ungrouped.
- Preserved person order across All/Free filters and page reloads.
- Kept filtered-out people in the saved order when moving visible people.
- Preserved saved positions when people are renamed.
- Kept pinned people above unpinned people even in manually reordered lists.
- Allowed pinned people to be reordered among themselves.
- Blocked moves across the pinned/unpinned boundary with an explanatory message.
- Added Undo for schedule saves, edits and renames.
- Added Undo for PDF batches, JSON imports and share-code imports.
- Added Undo for removing one person or all local schedules.
- Added Undo for person reordering and Send group to top.
- Kept up to 20 Undo entries during the current page session.
- Restored affected preferences and group memberships when undoing schedule changes.
- Kept order Undo separate from schedules, other lists and group collapse states.
- Excluded canceled, invalid and unchanged operations from Undo history.
- Added selected-schedule export and pasted-code import.
- Shortened share codes with compact times, compression and dense Unicode encoding.
- Replaced the old share-code overlap rule with exact name-and-timetable duplicate checks.
- Added Keep both, Replace and Keep old one for differing same-name code imports.
- Made Keep both use the next unused numbered name without overwriting other imported names.
- Saved code-import batches only after every conflict choice and made replacements undoable.
- Reported renamed imported schedules so their names can be corrected.
- Added Replace, Keep both and Cancel for same-name picture uploads.
- Made picture-name matching ignore letter case and repeated spaces.
- Added automatic Fall/Winter semester labels to new schedules.
- Assigned semester labels to previously unlabeled saved and imported schedules.
- Allowed semester labels to be changed or cleared in the editor.
- Showed semester labels on main cards only for older timetables.
- Greyed out older-semester schedules while keeping their details accessible.
- Added Use current semester to update an older timetable's label without changing classes.
- Preserved semester labels through saving, Undo, JSON and new share codes.
- Added compact warning markers for uncertain picture recognition.
- Retained recognition warnings after saving, reopening and Undo.
- Included recognition metadata in JSON while keeping local review markers out of share codes.
- Automatically revealed newly opened manual editors and completed picture reviews.
- Automatically revealed saved-schedule editors, block editors, import/export panels and group details.
- Respected reduced-motion preferences when scrolling to newly opened content.
- Reorganized Schedules so picture/manual entry and sharing appear before PDF/JSON imports.
- Optimized availability calculations, duplicate comparisons and group-calendar processing.
- Updated service-worker caches to deliver app changes while retaining cached OCR assets.
- Warned when reordered positions could not be saved on the device.
- Added fork-improvement credit alongside the original creator.
- Added the Omnivox optimization sentence to the header description.
- Replaced school-specific wording with school-neutral Omnivox wording.
- Added a feature summary and shortened the fork's README usage notes.
- Expanded automated regression coverage for recognition, editing, groups, ordering, Undo and offline caching.

The original version and deployment notes follow below.

## What's new in v8

- Fixed the iPhone time-control overflow by stacking Day and Time on narrow screens and removing Safari's stubborn native minimum width.
- Light/dark controls remain in **Settings → Themes**.
- Five saved full-app theme templates: **Ocean, Lavender, Rose, Forest, and Sunset**. Each recolors backgrounds, panels, cards, inputs, buttons, borders, timelines, badges and accents.
- Per-person **nicknames** that replace the full name throughout the main UI and notifications.
- Per-person **pins** so favorites stay at the top of the list.
- Existing break-notification bells remain available beside pin controls.
- More subtle GSAP polish: app entrance, settings-section stagger, theme selection, refresh feedback, pin interactions, plus the existing card/detail/timeline/toast animations.
- Mobile settings cards now stack cleanly with 44px-ish touch targets and no horizontal page overflow.
- Service-worker cache bumped to **v8**.

## Privacy model

Schedule PDFs and `schedules.json` stay on the user's device. The app stores the local schedule database in IndexedDB (with a localStorage fallback).

The hosted GitHub Pages site does **not** need a `schedules.json` file.

PDF parsing happens in the browser. PDF.js is loaded from jsDelivr only when a user adds a PDF; the selected PDF itself is not uploaded by the app.

Nicknames, pins, color theme, notification settings, and muted bells are device-specific local preferences. They are **not** included when sharing `schedules.json`.

## People personalization

Open **Settings → People** to:

- type a nickname (clear it to return to the full name),
- tap **📌** to pin or unpin someone,
- tap **🔔 / 🔕** to control only that person's break notifications.

Pinned people appear first. In **Show everyone**, pinned people are kept at the top even if one is currently in class.

## Themes

Open **Settings → Themes** to choose light/dark mode and a full color theme:

- Light or Dark mode
- Ocean
- Lavender
- Rose
- Forest
- Sunset

Theme settings are remembered locally on that device.

## Notifications

When enabled, UFree looks for breaks between two classes where the gap is **more than 10 minutes**. Time before the first class and after the last class is not treated as a break.

If several unmuted people start a qualifying break in the same minute, Who's Free? sends one grouped notification.

### Current limitation

This is still a static GitHub Pages app. Break alerts are checked while the app is open/running. A static site cannot reliably wake itself later after the browser/PWA has been fully closed.

On iPhone, users should add Who's Free? to the Home Screen for the best notification support.

## Files to deploy

Upload these to the **root** of the GitHub repository:

```text
index.html
app.js
schedule-parser.js
styles.css
service-worker.js
manifest.webmanifest
assets/
```

Do **not** upload `schedules.json`.

GitHub Pages:

```text
Branch: main
Folder: / (root)
```

## Updating an existing install

v8 uses versioned files and `whos-free-shell-v8`, so previous installs should update automatically after GitHub Pages redeploys.

If a device still shows an older version, close the page/Home Screen app completely and reopen it.

## GSAP

GSAP 3.13.0 is loaded from jsDelivr and is used only for small UI transitions. The app still works if GSAP fails to load. Users with **Reduce Motion** enabled do not get the motion effects.

## Sharing

The **Share schedules.json** button shares/downloads only the schedule database. Device-specific preferences such as nicknames, pins, theme, notification settings, muted bells, and notification history are not included.

## v9 changes

- The browser PDF parser now recognizes Omnivox schedules in **English or French**.
  - Weekdays such as `Monday` / `Lundi`, `Tuesday` / `Mardi`, `Wednesday` / `Mercredi`, `Thursday` / `Jeudi`, and `Friday` / `Vendredi` are normalized to the same internal weekday names.
  - Room labels accept English `Classroom` plus French forms such as `Local`, `Classe`, and `Salle de classe`.
  - Section labels accept `sec.`, `sect.`, and `section`.
  - Time text accepts both `08:15` and French-style `08 h 15`, including ranges using `à`.
- Shared `schedules.json` files now carry the Who's Free? website URL (`https://xander444.github.io/Whos-Free/`).
- On devices with the Web Share API, the share sheet includes the website link alongside the JSON file.

## Credits

App by David Dajbog and Hui En Quan. Inspiration from Xander Vatch.




## v83: Official UFree branding

The supplied SVG replaces the text masthead, including the legacy entry point. The supplied PNG is referenced in Open Graph and Twitter metadata. Browser, iOS, installable-app and notification icons use the official logo; square and maskable variants preserve its proportions. Branding assets are included in the offline shell.
