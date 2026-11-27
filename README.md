# Aion Codex

**A customisable, Markdown-based vertical timeline for Obsidian.**

Created by **Guthrie Ward**. Current version: **0.1.51**.

Aion Codex organises a Chronicle into **Ages, Years, Dates and Events**. It was developed for worldbuilding and fictional histories, where a Year might be `804 BCE`, `Year of the Falling Star`, or simply `In the Beginning…`.

Years appear on the left, with Dates and their Events grouped in panels on the right. Age headings and optional descriptions divide the Chronicle into chapters. You can work through dialogs and drag/drop, edit the Markdown directly, or combine both approaches.

![[Aion Codex - Timeline.png]]

## Features at a glance

- **Flexible labels:** use numeric Years, named Years, custom Eras, approximate Dates, prophecies and undated Events.
- **Markdown storage:** Chronicle content stays in the note, inside `aion-timeline` fenced blocks.
- **Linked Age blocks:** each Age has its own block, while search, editing and movement work across the Chronicle within the same note.
- **Age overviews:** optional Markdown descriptions introduce an Age before its Events.
- **Quick editing:** separate Age and Event dialogs, icon controls, and an Add Event shortcut beside each existing Event.
- **Drag/drop:** reposition Events, Dates, Years, Age headings or entire Ages, with insertion lines showing the destination.
- **Manual sorting:** sort Years within an Age or Dates within a Year when you choose. Adding or editing never triggers automatic sorting.
- **Custom calendars:** configure two Era names and an ordered list of Month names.
- **Starting Age:** keep an unnumbered opening Age at the top and exclude it from sorting.
- **Chronicle-wide search:** find content across linked Ages, including blocks not yet loaded on screen, and clear the search with one click.
- **Theme-aware appearance:** configurable colours, text sizes, spacing and panel shading that adapt to Light and Dark modes.
- **Editable template:** Insert example Chronicle reads a bundled `Template.md` that you can customise.
- **Large-Chronicle rendering:** linked blocks and deferred Markdown formatting reduce rendering work as a Chronicle grows.

## Install

Aion Codex is currently installed manually; these instructions do not require an Obsidian Community Plugins listing.

1. Create `.obsidian/plugins/aion-codex/` inside your vault.
2. Copy **manifest.json**, **main.js** and **styles.css** from the plugin folder into it.
3. Restart Obsidian and enable **Aion Codex** under **Settings → Community plugins**.
4. In a note, run **Aion Codex: Insert example Chronicle** from the command palette. Alternatively, copy the `source/Example.md` into your vault.
5. Open Reading View or Live Preview to see the Chronicle. Use Source Mode for direct Markdown editing.

No dependency installation or build step is needed to use the bundled plugin. The minimum declared Obsidian version is **1.5.0**.

## Markdown format

A Chronicle uses ordinary Markdown structure inside a custom fence:

| Markdown | Aion concept | Display |
| --- | --- | --- |
| `#` | Age | Section heading |
| Text beneath the Age heading | Age Description | Overview beneath the heading |
| `##` | Year/Time Label | Left column |
| `###` | Circa/Date Label | Heading in the Events box |
| `-` | Event | Event beneath that Date |

For example, two linked Ages:

````markdown
```aion-timeline
<!-- aion: my-chronicle/age-1 -->
# Age of Stars
<!-- colour: #af0000 -->

An overview of the Age, with **emphasis** and [[World history]].

## 1,000 BCE
### Circa
- The first settlements appear.

### 11 Rainwake
- A traveller records the falling star.
- The council gathers to discuss its meaning.

## Year of the Silver Crown
### Winter's End
- A new ruler is crowned.
```

```aion-timeline
<!-- aion: my-chronicle/age-2 -->
# What Is Yet to Come

## Future
### Prophecy
- The lost city will rise again.
```
````

The shared `my-chronicle` identifier links the blocks; `age-1` and `age-2` identify their individual parts. Keep each part identifier unique. Use another Chronicle identifier for an independent Chronicle. Linking works within one note, not across notes.

New Chronicles and Ages created through Aion use one linked block per Age. Blocks render in place, so surrounding note text stays where you put it. Age order follows the note, with the Starting Age exception described below. Older independent blocks remain supported; adding an Age to one creates linked Age blocks.

Year and Date labels are free text. Numbers and recognised calendar names are only needed if you want to use the relevant sorting button. Age titles must be unique within a Chronicle; separate Chronicles may reuse titles.

Events support Markdown formatting and Obsidian note links, including `[[links|aliases]]`. Indent continuation lines by two spaces. Images and embeds are suppressed in Events, and there is no Year image field.

Age Descriptions support paragraphs, emphasis, lists and links. Structural timeline headings, metadata and fences are reserved. Unsupported content outside the documented structure produces an error rather than being silently discarded by a form edit.

## Adding and editing

The shared toolbar provides search, **Add Age** and **Add Event**. Each Age has its own Add Event, Edit Age and Delete Age controls.

The **Age dialog** contains:

- **Age Title**
- **Starting Age**
- **Age Description**
- **Age Timeline Colour**, with **Use Default** to follow the global colour

The **Event dialog** contains **Age**, **Year/Time Label**, **Circa/Date Label** and the Event description. Matching Year and Date labels reuse their existing groups.

Hover over an Event or focus it to reveal Add, Edit and Delete icons. **Add Event** preselects that Event's Age, Year and Date and inserts the new Event directly beneath it. You can change its destination in the dialog. On touch devices, tap the Event row to reveal its controls.

Deleting an Event requires confirmation. Deleting an Age warns that all its associated Years, Dates and Events will also be deleted and shows the Event count. Empty containers are removed when an Event edit, move or deletion empties them; the Age remains available.

Form edits and drag/drop save back to the Markdown note. Aion checks that the content has not changed since the operation began and refuses stale writes. There is no separate in-plugin undo system.

## Drag/drop

Insertion lines preview where content will land. Clear search before dragging.

| Drag source | What moves |
| --- | --- |
| Event text | That Event |
| Date heading | The Date and all its Events |
| Year label | The Year and all its Dates and Events |
| Age title | The Age heading, description and colour boundary |
| Age title with **Ctrl held when dropping** | The entire Age and its contents |

An ordinary Age drag redefines where that Age starts. It can be placed between Dates; the Events left behind belong to the Age heading now directly above them. Splitting a Year repeats its label under the new Age. A move that would leave content without an Age is refused.

A Ctrl-drag moves a whole Age between Age sections. Event, Date and Year drops support before/after positions and empty destinations. Matching Year labels merge their Dates; matching Date labels merge their Events. Repeated Event text is retained, and dragging does not apply chronological sorting.

Movement works across linked Age blocks in the same Chronicle. Dedicated timeline drag handles are not used. Mouse dragging on desktop is the primary target; direct Markdown editing remains available for other workflows.

## Starting Age

Select **Starting Age** in the Age dialog to move that Age and its contents to the beginning of the Chronicle. Only one Age can have this designation, and its Years and Dates are never sorted.

Moving an Age into first position through drag/drop automatically makes it the Starting Age. Unchecking the option clears the designation without moving it. Deleting a designated Starting Age transfers the designation to the next Age, if one remains.

Its linked marker uses the reserved part name `starting`, for example `<!-- aion: my-chronicle/starting -->`. Free-text Year/Time Labels remain available for beginnings outside a numbered calendar.

## Search

Search covers **Age titles and descriptions, Year labels, Date headings and Event text**, retaining their surrounding context.

For a linked Chronicle, results from all Ages appear beneath the first block's search bar, even if later blocks have not yet loaded on screen. Other blocks do not duplicate the results. The clear button inside the search field restores each Age to its own position.

Clear search before sorting or dragging. Matching Events can still be edited through their controls.

## Sorting and custom calendars

Sorting is deliberately manual, so you can arrange and edit content before putting it in calendar order. **Ages are never chronologically sorted.**

Under **Settings → Aion Codex → Sorting**, configure:

- **First Era:** defaults to `BCE`, labelled **Negative Years.**
- **Second Era:** defaults to `CE`, labelled **Positive Years.**
- **Months:** an initially empty, ordered list of your calendar's Month names. Add with the plus button or Enter, edit names directly, remove with the trash icon and drag the list grips to change Month order.

### Sort Years

Use **Sort Years** beside an Age heading to sort only that Age's Years.

With both Eras defined, the first Era counts down, followed by the second counting up. For example: `1,000 BCE → 500 BCE → 1 CE → 100 CE`. A numeric Year without an Era belongs to the upward group. Era matching ignores case, and comma-separated numbers and attached Era suffixes are supported.

With zero or one Era defined, signed numeric Years sort from negative to positive, regardless of trailing Era notation.

Named Years and unrecognised labels keep their existing slots while recognised Years sort around them. Equal values keep their relative order. Dates and Events travel with their Year; sorting does not merge Years.

### Sort Dates

Use **Sort Dates** at the **top right of an Events box** to sort that Year's Date groups.

- **Circa** comes first.
- Recognised Dates follow the configured Month order.
- A Month without a Day comes before numbered Days in that Month.
- Both Day-first and Month-first formats are accepted, such as `11 Rainwake`, `Rainwake 11`, `11th Rainwake` and `Rainwake 11th`.
- Custom and multiword Month names are supported. Positive integer Days are accepted without imposing Gregorian Month lengths.

Unrecognised Dates keep their slots among the non-Circa Dates. Equal values keep their relative order. Labels are not rewritten, Date groups are not merged, and Events within a Date are not sorted. Without configured Months, only Circa can be moved into order.

The Starting Age has neither sorting control. Adding, editing and reopening a Chronicle never trigger sorting automatically.

## Appearance settings

The **General** tab provides:

| Setting | Default | Range |
| --- | --- | --- |
| Age Text Size | 140% | 100–150% |
| Year Text Size | 100% | 90–110% |
| Date Text Size | 120% | 100–120% |
| Event Text Size | 80% | 75–95% |
| Year Column Width | 150px | 100–250px |
| Space between Years | 10px | 5–25px |
| Default Timeline Colour | RGB 175, 0, 0 (`#af0000`) | Colour picker |
| Shaded Event panels | Enabled | On/off |

Text-size controls use **5% steps** relative to document text size. Age Descriptions remain at 100%. Text-size changes update visible Chronicles immediately; reopen the note for other appearance changes.

Fonts follow the Obsidian theme and CSS snippets. Date headings are bold. Event bullets align with the Date heading's left edge, and narrow screens use a compact Year column.

Default and individual Age colours adapt to Light and Dark modes. They colour the dots, panel borders and drag indicators. The main timeline line and panel shading share the same neutral, theme-aware grey. **Use Default** removes an Age's colour override so it follows future global colour changes.

Settings are stored per vault in the plugin's `data.json`; Chronicle content and individual Age colours stay in Markdown.

## Customising the example Chronicle

**Insert example Chronicle** uses a template bundled into `main.js`. Developers can edit `source/Template.md` and rebuild to change it. An optional `Template.md` in the installed plugin folder overrides the bundled template.

Insertion assigns fresh Chronicle identifiers to avoid linking to an existing Chronicle accidentally. It preserves the template's content and does not modify Chronicles already inserted. An invalid override template shows an error and inserts nothing.

## Performance and current scope

The author's Infusion Chronicle currently contains **804 Events**, with no issues reported in its current use. This is a real-use report, not a performance guarantee for every device, theme or plugin combination.

Each linked Age renders independently. Rich Markdown formatting is deferred until Events approach the viewport and processed in small batches. Unchanged formatted content is reused where possible, and Event controls are shared rather than duplicated for every Event. Search still covers the full Chronicle.

Reading View and Live Preview use Obsidian's normal code-block processor. Source Mode remains editable fenced Markdown, with no custom editor syntax extension. Separate Age blocks also avoid keeping the entire Chronicle inside one very long fence; exceptionally large individual blocks may still encounter Obsidian's own editor limits.

Aion currently focuses on authoring and displaying Chronicles. It does not provide a calendar grid, cross-note aggregation, automatic sorting, duration bars or Xmind conversion. Mobile drag/drop has not been established as a supported workflow.

## Development

The installable `main.js` is bundled from the local source files. It has no external runtime dependencies beyond Obsidian.

From the plugin directory, rebuild with `node source/build.js`. The build also mirrors `Template.md` to `Example.md`; edit the template rather than the generated example.

Run the automated checks with:

```sh
node --test source/*.test.js
```

Checks cover parsing, saving, dialogs, linked blocks, search, sorting, rendering and drag/drop logic. Simulated checks do not replace testing inside Obsidian with real themes and pointer input.

See [CHANGELOG.md](source/CHANGELOG.md) for the retained release history.

Development source, build script and automated tests are kept in `source/`. The build writes the installable `main.js` to the plugin root.
