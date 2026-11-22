# FamilyTree 1.3.2 for Nextcloud

**Language:** English · [Česky](README_CZ.md)

**FamilyTree** is a self-hosted genealogy application for **Nextcloud 35**. Create and share family trees, people, relationships and events; manage photos, sources, documents and research notes; import GEDCOM 7 / GEDZIP; and keep your records in your own Nextcloud.

## Screenshots

The following screenshots are displayed directly from the existing GitHub `screenshot/` directory. No PNG files are bundled with the application or source archives.

![Screenshot 01 – Family tree overview](https://raw.githubusercontent.com/hacesoft/familytree/main/screenshot/01.png)

![Screenshot 02 – Research journal](https://raw.githubusercontent.com/hacesoft/familytree/main/screenshot/02.png)

![Screenshot 03 – Registers and photographs](https://raw.githubusercontent.com/hacesoft/familytree/main/screenshot/03.png)

The Nextcloud App Store references these same external screenshots through `appinfo/info.xml`. They are not distributed inside the signed Nextcloud app. The installed app keeps its approved `img/app.svg` icon.

**Documentation updated in 1.2.0:** The three original GitHub-hosted screenshots are displayed directly in the README via external image URLs. No PNG assets are added to the distribution archives.

**New in 1.1.8:** Private per-person photo gallery with crop, rotation, primary portrait selection and original-image preservation. Since 1.2.2, new images are stored in private application AppData, while older images in the original owner's Files remain readable. Native ZIP v2 backups include the photo files. [Photo management guide](docs/en/PERSON_PHOTOS.md).

**Fixed in 1.1.10:** Person portraits stay visible in the tree after refresh and ordinary profile edits, using the private photo gallery as fallback. Originals remain unchanged. **Since 1.1.9:** Arrange your family trees using a lockable drag handle (mouse, touch or arrow keys). The order persists across devices per user. In Settings → Tree list and startup, choose your own startup tree or inherit the administrator’s default; inaccessible defaults fall back to the first available tree.

**Updated in 1.3.2:** Fixed sidebar dragging and panel resizing on desktop, improved the transfer dialog on small screens, and disabled accidental backdrop/Escape dismissal for ownership transfer and the research journal. Tree statistics now show your effective role, the tree owner, and whether access is granted directly or through a group.

**Updated in 1.3.1:** Ownership transfer no longer asks the owner to retype the tree name or enter a Nextcloud password; the explicit confirmation and server-side authorization remain mandatory. On desktop, drag the separator to resize the left tree list (or use arrow keys), with width remembered in the browser. Long tree names and descriptions are shortened with an ellipsis, with full names available on hover.

**New in 1.3.0:** An owner can transfer an entire family tree to one existing active Nextcloud user from the tree action menu (⋯ → Transfer family tree ownership). The recipient becomes its owner and can manage sharing and deletion. The previous owner confirms the selected account and the transfer in a separate dialog; the transfer is audited. Historic photographs, research media, and imported source attachments are preserved into private AppData without changing or deleting the previous owner’s Files. Local document links open through an access-controlled FamilyTree endpoint after transfer. A failed attachment check cancels the ownership change. Existing group shares can still grant the former owner access.

**New in 1.2.2:** Photos in shared trees are stored via private application AppData instead of writing into another user’s Nextcloud Files; legacy photos remain readable and are copied safely on re-edit. Native ZIP v2 export/restore retains originals and portraits. The dashboard shows edits from *all* authorized contributors to owned or shared trees (including who changed a person) and refreshes on returning to the Dashboard. No database schema or backup-format changes.

**New in 1.2.1:** The dashboard widget refreshes counts, shows recently edited people and newly added events, and opens your first ordered family tree directly. The original approved FamilyTree icon is shown in the widget.

## Installation — recommended for all users

**Install the official, signed release through Nextcloud's Apps interface**, not from this GitHub source archive:

1. In Nextcloud, sign in as an administrator and go to **Apps**.
2. Install and enable **Hacesoft Shared App Core** (`hc_shared_app_core`) version **0.18.8 or later**.
3. Find **FamilyTree** (`hc_familytree`) in the app catalog, choose **Download and enable**, and open it in the navigation menu.
4. For subsequent updates, use Nextcloud's app-update mechanism and back up the database and files before upgrading.

App Store: https://apps.nextcloud.com/apps/hc_familytree

The release published to the Nextcloud App Store is distributed as a **cryptographically signed TAR.GZ archive**. Nextcloud downloads and validates it as part of the supported installation workflow. The public **full-source.zip** contains source files and is **not** the signed installable application. Do not upload a plain, unsigned runtime TAR.GZ as an official release.

## Requirements

- Nextcloud **35** (the compatibility range currently declared in `src/appinfo/info.xml`)
- PHP/runtime compatible with the installed Nextcloud server
- Hacesoft Shared App Core (`hc_shared_app_core`) **0.18.8+**, installed and enabled

## Development and testing only

The repository includes `install.sh` for a **specific Docker/Synology-style deployment** with accessible Nextcloud containers. It is **not** the default installer for end users, not a general Linux installer, and not a substitute for signed App Store releases.

From an extracted *complete source* checkout located **outside** `custom_apps`, a developer/tester can run:

```sh
sudo sh install.sh
```

The script deploys `src/` into the selected Nextcloud containers, checks the Core dependency, validates code and schema, and can change the application's installation and database structures. Back up your database and files first. Do not use it just to update an App Store installation without understanding the custom deployment workflow. See [developer/test installation and recovery](docs/en/01_INSTALLATION.md).

`uninstall.sh` is likewise a **developer/administrator tool** for these Docker layouts, not the recommended uninstall method. Ordinary users should manage installation and removal through Nextcloud Apps.

## Features

- Interactive family trees, pan/zoom, person and relationship editing, events and notes
- GEDCOM 7 (`.ged`) and GEDZIP (`.gdz`) import, and a versioned native ZIP backup and restore
- Documents, photographs, source citations and a research journal with tasks, searches and evidence
- Sharing with Nextcloud users and permission-aware access
- Responsive UI with English as default/fallback, Czech and nine other locale catalogs
- **Merge research findings** into an existing family tree using a ZIP bundle with GEDZIP, a research-journal JSON, and archive scans. Preview and explicitly approve all changes before importing; existing people and facts are not overwritten.

## Sample family tree of Charles IV

To try the import workflow, see **[examples/ – Charles IV sample family tree](examples/)** on GitHub. This directory is prepared for a sample GEDCOM 7 (`.ged`) or GEDZIP (`.gdz`) file and includes [English import instructions](examples/README.md). Sample data is intended for demonstration, not as a FamilyTree native backup. If there is no `.ged` or `.gdz` file in the directory yet, the sample data still needs to be published on GitHub.

## Data and documentation

- [Import/export formats and data ownership](docs/en/03_DATA.md)
- [Backup and restore (native ZIP v2 vs. GEDCOM)](docs/en/IMPORT_EXPORT_BACKUP.md)
- [Research journal JSON interchange](docs/en/RESEARCH_JOURNAL_FORMAT.md)
- [Shared App Core integration](docs/en/02_CORE.md)
- [App Store screenshots](docs/en/APPSTORE_SCREENSHOTS.md)

A native FamilyTree ZIP backup is distinct from GEDCOM exchange. Keep independent backups of the Nextcloud database and stored files before major updates.

## Repository and release artifacts

The **public GitHub source ZIP** contains `src/` (the complete runnable app), public `docs/`, license, changelogs and source deployment/build scripts. It intentionally excludes private keys, credentials, internal HDS/CP21 audit evidence, runtime logs and test reports.

`sh build-release.sh` assembles an **unsigned runtime ZIP** (`release/hc_familytree-1.3.2.zip`) for Publisher CP21, an **unsigned staging TAR.GZ**, and exactly one clean **`release/hc_familytree-1.3.2-full-source.zip`** from this checkout; the build **does not sign or publish** a release. The release manager uses Hacesoft Publisher to run mandatory quality gates, sign the application with the registered Nextcloud certificate, and publish the final TAR.GZ and its archive signature to the App Store. The signed final artifact is not produced by this GitHub source ZIP alone.

**License:** [AGPL-3.0-or-later](LICENSE). Report problems via [GitHub Issues](https://github.com/hacesoft/familytree/issues).

**Also supported:** [Import research findings into an existing tree](docs/en/IMPORT_FINDINGS_INTO_EXISTING_TREE.md).

## Changelog

The version history is available in [the English changelog](CHANGELOG.en.md).
