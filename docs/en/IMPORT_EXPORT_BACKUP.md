**Downloaded filenames:** A single-tree backup or GEDCOM is named after the tree, e.g. `Charles_IV_Family_Tree_17112026_1151.zip` or `.ged` (DDMMYYYY_HHMM, local browser time). Spaces become underscores. A multi-tree ZIP backup uses `Vsechny_rodokmeny_DDMMYYYY_HHMM.zip`. The archive format and restore procedure remain unchanged.

# Native backup and journal interchange

**Native ZIP v2** (`hc-familytree-native-backup`, `formatVersion: 2`): full export of all 13 FamilyTree tables of owned trees, including research history/proposals, and accessible local attachments. ZIP root contains `manifest.json` with checksums and `data.json` containing all ordered tables, plus `files/<sha256>` blobs. Import previews and checks integrity, then restores as **new** trees; it never overwrites existing trees. External URLs are retained as references, not downloaded. Limits: 40 MiB data JSON, 48 MiB per attachment, 256 MiB attachments total, 3000 files. v1 ZIP restores are not supported in the development v2 schema. Back up private data securely.

**Research journal JSON v1** (`hc-familytree-research-journal`, `formatVersion: 1`): import/export of tasks, searches and evidence only. It does not contain genealogy facts, audit history, proposals or attachments, and does not update existing records when reimported. See [RESEARCH_JOURNAL_FORMAT.md](RESEARCH_JOURNAL_FORMAT.md).

**GEDCOM 7 / GEDZIP** is an interchange format, not the complete archive. Access full backup import/export via the app's top-left `⋯` menu and current tree's `⋯` context menu, not old bottom sidebar buttons.

## Charles IV sample family tree

To try the import process, visit **[examples/ – Charles IV sample family tree](../../examples/)** in the GitHub repository. Once a `.ged` or `.gdz` file has been uploaded there, download it and select **⋯ → Import family tree / backup → GEDCOM 7 / GEDZIP**. For a safe demonstration, create a **new tree** instead of importing sample data into an existing family tree.

GEDCOM/GEDZIP is not a full native FamilyTree backup; the actual sample file is **not included in the release archives**. See the [sample import guide](../../examples/README.md).

## Unified import (1.1.0-dev11)

Open **⋯ → Import family tree / backup** and choose GEDCOM 7 / GEDZIP (`.ged`, `.gedcom`, `.gdz`, or `.zip` containing `gedcom.ged` at its root) or the complete native FamilyTree backup (`.zip` with the documented FamilyTree manifest). GEDCOM can create a **new tree** directly after preflight, or import into an editable selected tree. Native backup restoration always creates separate trees and retains current records. An arbitrary ZIP is not a recognized import format. Only GEDCOM structures supported by the parser are projected into the database; auxiliary archive files remain in the archived original.
