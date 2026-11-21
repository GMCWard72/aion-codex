# Aion Codex release history

These entries describe changes at the time of each release. See [README.md](README.md) for current behaviour and settings.

## v0.1.31 linked scrolling

Each linked block renders only its own Age instead of placing the whole Chronicle in the first block and hiding later blocks. No Reading section or Live Preview widget wrapper is hidden by Aion. Loading an unchanged later block does not rebuild earlier views. Shared search state is held per pane/Chronicle, and drag operations can cross its loaded Age blocks. Formatting caches are handed over only to replacements of the same Age part. Existing linked Markdown requires no migration for this update.

## v0.1.33 complete linked search

Search results no longer depend on the set of Reading sections already loaded by Obsidian. The active search view at the first block gathers matches from all linked Ages; Age, Year, Date and Event matching retain their context. Result editing keeps the original Chronicle indices. The regression fixture finds and edits a result in the 13th Age while only the first block is loaded, then verifies normal per-Age rendering after clearing the query. Normal scrolling remains distributed across the separate Age blocks.

## v0.1.34 Add Age formatting

Add Age always saves one linked block per Age. When used in an older standalone timeline, that timeline's existing Ages and the added Age are written as linked Age blocks together. Other independent timelines and surrounding note text are preserved. Existing Chronicle identifiers are avoided. Later Add Age operations use the linked save path, including an initially empty standalone timeline. Ordinary edits to a standalone timeline retain its format until Add Age is used or Link and Split is explicitly run. The example content is unchanged, and Link and Split remains available; template replacement and Xmind conversion are deferred.

## v0.1.35 drag/drop boundaries

Events and Age headings use a fixed overlay insertion line; it occupies no document space. No drag handles, spacer boxes, custom undo, keyboard movement or sorting are introduced. Source order and free-text Year/Date labels remain authoritative. Ctrl is checked again when dropping, so you can change between heading-only and whole-Age movement during the drag. Search must be cleared before any reordering. Linked blocks are still saved in one checked note update, with one Age per block; independent Chronicles remain separate.

## v0.1.36 Date insertion lines

Date dragging now uses the same insertion overlay as Events, with before/after boundaries, panel-edge placement and empty-Year destinations across linked Ages. Date moves retain their Events and remove a source Year only when the move empties it.

## v0.1.37 Year insertion lines

Year dragging now previews before/after positions with the shared insertion overlay, including empty linked Ages. All four draggable types use insertion lines. No Year or Date parsing or automatic sorting is applied.

## v0.1.38 drop merging and unique Ages

Dropping a Year consolidates matching Year labels in the destination Age and combines their Dates. Matching Date headings combine their Events, including when a Date is dragged directly. Before/after insertion determines the incoming content's position; no chronological sorting is performed. Matching Year/Date labels are compared as text with outer whitespace trimmed. Repeated Event text is kept as separate Events.

Age title matching ignores case and incidental whitespace. Titles must be unique across every block in a linked Chronicle, or within an independent timeline. Add/Edit Age and save validation refuse duplicates, and manually duplicated titles display an error instead of silently renaming or deleting an Age. Separate Chronicles can use the same Age titles. The Link and Split operation also validates titles before writing its result.

## v0.1.39 bundled Template.md

Insert example Chronicle reads Template.md from the installed Aion Codex plugin folder each time you invoke it. The bundled template contains the user's 11 Ages, descriptions, labels, Events and colours. Its regular document Heading and content are preserved, with fresh Chronicle identifiers for each insertion so it cannot accidentally link to another Chronicle in the target note. Editing the installed Template.md changes the next insertion without rebuilding or restarting the plugin. It does not change Chronicles already inserted.

Template.md is included in release packages and both installed vault copies. The workspace copy is used for packaging; build.js mirrors it to Example.md as the demonstration copy. No sample text is embedded in the plugin anymore. Missing or invalid templates show an error and insert nothing. If the note or selection changes while the file loads, insertion is refused. Template insertion does not implement Xmind conversion or the deferred heading-format changes.

## v0.1.41 theme-aware accents

Default Timeline Colour and Age Timeline Colour are now stored as base colours. The Year dots, Event panel borders and drag insertion lines derive their displayed shade from the base colour and the active theme's normal text colour. Light mode uses a darker blend; Dark mode uses a lighter blend. Switching modes updates the CSS automatically, including individual Age overrides and overlays outside the note. No note metadata or chosen base colours are rewritten. Engines without color-mix support retain the stored base colour. Theme-provided text, links, controls and neutral greys continue to follow the theme.

The Date heading remains 1.25em, bold, with a 1.4 line height. That is a 20px font and a 28px line box at a 16px document text size; the visible letter height depends on the theme's heading font.

## v0.1.42 text-size controls

The first four Settings are Age Text Size, Year Text Size, Date Text Size and Event Text Size, in that order. Sizes are percentages of document body text, adjustable in 5% steps. Age ranges from 100–200% (default 145%), Year from 75–125% (default 95%), Date from 75–150% (default 125%) and Event from 75–95% (default 80%). Missing settings use these previous display sizes, while existing saved Event preferences are retained. Fonts and line heights continue to follow the current rules; Age descriptions remain at 100% body text size.

Moving a text-size slider updates visible Chronicle CSS variables immediately without parsing or rebuilding Events. Hidden/new blocks receive the current values when rendered. Source text and note metadata are untouched.

## v0.1.43 refined text sizes

Text-size defaults and ranges are now: Age 140% (100–150%), Year 100% (90–110%), Date 120% (100–120%), Event 80% (75–95%). All sliders keep 5% steps and their existing order. Saved values within range are preserved; out-of-range values are clamped. Missing settings use the new defaults. Age descriptions remain at 100% body text size.

## v0.1.44 icon-button alignment

Toolbar, Age, Event and dialog icon buttons now have a consistent border-box height, zero outer margins and centred SVG layout. The rules are scoped to Aion controls; the smaller search-clear button keeps its own dimensions. This targets theme-dependent offsets such as the Add Event alignment reported with Baseline, while keeping theme colours, fonts, focus indicators and hover styling.

## v0.1.45 removed Link and Split

The Link and Split command and its dialog have been removed. Internal linked-block, Add Age and Template.md handling remain available. Xmind conversion and the planned General/Sorting tabs are not introduced by this change.

## v0.1.46 Settings tabs

Aion Codex Settings now has General and Sorting tabs. General contains all existing appearance controls, with the four text-size controls in their established order. Sorting currently contains a placeholder for the planned Era and Month configuration; no sorting engine or calendar controls are enabled yet. Tab selection supports mouse and arrow/Home/End keyboard navigation and does not modify saved settings.

## v0.1.47 Era and Month settings

Sorting now has two fixed Era text fields. The first defaults to BCE with the label “Negative Years.” on its right; the second defaults to CE with “Positive Years.” on its right. Either field can be blank, and the fields cannot be reordered. Era names must be distinct when both are present.

The Month-name field has a plus button on its right; plus or Enter adds a Month. The list starts empty for a custom calendar. Existing Month names can be edited directly in their text boxes and saved by leaving the field or pressing Enter. The trash icon removes a Month, and the grip reorders the list with an insertion-line preview. Blank or duplicate Month names are refused. Month order is preserved exactly; no Date parsing or sorting is performed by these controls.

The eras and months arrays are stored in the vault's existing data.json alongside General settings. Opening or switching tabs does not write data. Changes save automatically. Automatic Chronicle sorting and the planned Age checkboxes are not enabled by this release.

## v0.1.48 Starting Age

The Age dialog now includes a Starting Age checkbox. Selecting it moves the entire Age to the beginning of its Chronicle and clears any previous Starting Age. The linked block uses `<!-- aion: chronicle/starting -->`, with the actual Chronicle identifier substituted as usual. Other Age blocks retain unique part identifiers. Only one Starting Age is allowed per Chronicle; duplicate manual markers are refused.

Moving an Age into first position through Aion's drag/drop automatically makes the new first Age the Starting Age, clearing the previous designation. This applies to both whole-Age and heading-only moves when they change the first Age. Unchecking the checkbox clears the designation without moving the Age. Deleting a designated Starting Age transfers it to the new first Age, if one remains. Manually authored Starting blocks should be placed first; subsequent Aion saves ensure a designated Starting Age is first. Existing legacy `position: start` metadata is not treated as the new designation.

No numerical Year requirement or automatic chronological sorting is introduced. Age descriptions, colours, Years, Dates and Events are preserved when selecting a Starting Age. Template.md can also use a starting marker; insertion keeps that designation while assigning a fresh Chronicle identifier.

## v0.1.49 manual Year sorting

Each non-Starting Age has a Sort Years icon beside its heading. Click it to sort just that Age's Years using Settings → Sorting → Eras. Clear search before sorting. The Starting Age has no sorting control and is also protected in the sorting operation itself. Age order never changes as part of Year sorting.

With two nonempty Eras, the first Era sorts Year magnitudes downward, followed by the second Era upward. A bare numeric Year belongs to the upward group. Era matching is case-insensitive; commas and attached Era suffixes are supported. With zero or one Era configured, signed numeric values sort upward from negative through positive, and trailing Era notation does not define the direction. Numeric Years outside JavaScript's safe-integer range and unrecognised formats are left untouched.

Named Years and unknown Era labels remain in their exact slots while recognised Years sort around them. Equal sorting values retain their relative order. Date groups, Event contents and their internal order travel unchanged with each Year. This step does not sort Dates or merge Years. The resulting Markdown order is saved using the existing stale-edit protection. There is no automatic sorting on load, insertion or editing; click Sort Years again when needed.

## v0.1.50 manual Date sorting

Each Year outside the Starting Age now has a compact Sort Dates icon beside its label. Click it to sort that Year's Date groups; clear search first. Sorting is manual only, and edits or insertions never trigger it automatically. The Year label, Age order and Year order remain unchanged, and each Date retains its Event contents and Event order.

Circa Dates move to the top. Remaining recognised Dates sort by the configured Month list, with Month-only Dates before numbered Days in that Month. Both Day-first and Month-first labels are accepted, including English ordinal suffixes and multiword/custom Month names. Examples include 11 Rainwake, Rainwake 11, 11th Rainwake and Rainwake 11th. Day numbers are positive integers; no Gregorian Month-length restriction is imposed. Date text is never rewritten.

Equal Date keys retain relative order, and Date groups are not merged by sorting. Unknown formats keep their slots among non-Circa Dates; Circa takes precedence and moves above them. Without configured Months, only Circa can be moved into order. Configure Months in Sorting settings for the rest. Starting Age sorting is excluded both in the interface and in the sorting operation.

## v0.1.51 Date sorting button placement

Moved Sort Dates to the top-right of each Events box and restored the full Year label width.
