#!/bin/sh
# CP21 release packaging: one full-source ZIP and unsigned runtime archives.
# NO signing and NO App Store upload.
# Mandatory HDS/CP21 qualification and certificate signing belong to Hacesoft Publisher.
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
INFO="$ROOT/src/appinfo/info.xml"
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[ -f "$INFO" ] || fail 'Missing src/appinfo/info.xml'
APP_ID="$(sed -n 's:.*<id>\([^<]*\)</id>.*:\1:p' "$INFO" | head -n 1)"
VERSION="$(sed -n 's:.*<version>\([^<]*\)</version>.*:\1:p' "$INFO" | head -n 1)"
case "$APP_ID" in hc_*) ;; *) fail 'Invalid app id' ;; esac
case "$APP_ID" in *[!a-z0-9_]*) fail 'Invalid app id' ;; esac
case "$VERSION" in ''|*[!a-zA-Z0-9._+-]*) fail 'Invalid version' ;; esac
for command_name in zip unzip tar sha256sum mktemp node; do
  command -v "$command_name" >/dev/null 2>&1 || fail "Missing command: $command_name"
done
for item in src README.md README_CZ.md LICENSE CHANGELOG.md CHANGELOG.cs.md CHANGELOG.en.md docs install.sh uninstall.sh build-release.sh scripts/install-transaction.sh scripts/custom-apps-safety.sh scripts/ensure-schema.php scripts/check-appstore-assets.cjs scripts/check-appstore-public-urls.cjs scripts/appstore-approved-assets.json; do
  [ -e "$ROOT/$item" ] || fail "Missing project file: $item"
done
[ -f "$ROOT/src/img/app.svg" ] || fail 'Missing src/img/app.svg'
# If the complete internal QA checkout is available, do not bypass its automatic checks.
if [ -d "$ROOT/tests" ] && [ -f "$ROOT/package.json" ]; then
  command -v npm >/dev/null 2>&1 || fail 'Internal QA checkout needs npm'
  (cd "$ROOT" && npm run check) || fail 'Internal source tests did not pass'
fi
if find "$ROOT/src" "$ROOT/docs" -type l | grep -q .; then fail 'Source contains symbolic links'; fi
RELEASE="$ROOT/release"
FULL_SOURCE="$APP_ID-$VERSION-full-source.zip"
RUNTIME_ZIP="$APP_ID-$VERSION.zip"
UNSIGNED="$APP_ID-$VERSION-UNSIGNED-STAGING.tar.gz"
CHECKS="SHA256SUMS-$VERSION.txt"
for name in "$FULL_SOURCE" "$RUNTIME_ZIP" "$UNSIGNED" "$CHECKS"; do
  [ ! -e "$RELEASE/$name" ] || fail "Refusing to overwrite release/$name"
done
TMP="$(mktemp -d "${TMPDIR:-/tmp}/$APP_ID-public.XXXXXXXX")"
trap 'rm -rf "$TMP"' EXIT HUP INT TERM
mkdir -p "$TMP/source/$APP_ID/scripts" "$TMP/source/$APP_ID/docs" "$TMP/runtime/$APP_ID"
# The entire runnable application (source is not minified or substituted).
cp -R "$ROOT/src" "$TMP/source/$APP_ID/src"
for file in README.md README_CZ.md LICENSE CHANGELOG.md CHANGELOG.cs.md CHANGELOG.en.md install.sh uninstall.sh build-release.sh .gitignore .gitattributes; do
  [ ! -f "$ROOT/$file" ] || cp "$ROOT/$file" "$TMP/source/$APP_ID/$file"
done
# Include only files necessary for public source installation and packaging.
for file in custom-apps-safety.sh install-transaction.sh ensure-schema.php check-appstore-assets.cjs check-appstore-public-urls.cjs appstore-approved-assets.json; do
  cp "$ROOT/scripts/$file" "$TMP/source/$APP_ID/scripts/$file"
done
# Public example documentation; actual GEDCOM/GEDZIP files are published separately on GitHub.
mkdir -p "$TMP/source/$APP_ID/examples"
for file in README.md README_CZ.md; do
  [ -f "$ROOT/examples/$file" ] || fail "Missing public example guide: examples/$file"
  cp "$ROOT/examples/$file" "$TMP/source/$APP_ID/examples/$file"
done
mkdir -p "$TMP/source/$APP_ID/docs/cz" "$TMP/source/$APP_ID/docs/en"
for file in 01_INSTALACE.md 02_CORE.md 03_DATA.md ARCHIV_OSOB_A_MEDII.md FILTRY_VYZKUMNEHO_DENIKU.md FORMATY_IMPORT_EXPORT.md FOTOGRAFIE_OSOB.md IMPORT_EXPORT_ZALOHA.md IMPORT_VYZKUMNEHO_DENIKU.md IMPORT_NALEZU_DO_STAVAJICIHO_RODOKMENU.md MOBILNI_LAYOUT.md OBRAZKY_APPSTORE.md OPRAVA_INSTALACE.md STATISTIKY.md VYZKUMNY_DENIK_OVLADANI.md ZOBRAZENI_LISTA_LEGENDA.md; do
  [ ! -f "$ROOT/docs/cz/$file" ] || cp "$ROOT/docs/cz/$file" "$TMP/source/$APP_ID/docs/cz/$file"
done
for file in 01_INSTALLATION.md 02_CORE.md 03_DATA.md APPSTORE_SCREENSHOTS.md PERSON_PHOTOS.md IMPORT_EXPORT_BACKUP.md INSTALLER_RECOVERY.md JOURNAL_FILTERS.md LEGACY_RESEARCH_AND_MEDIA.md IMPORT_FINDINGS_INTO_EXISTING_TREE.md MOBILE_LAYOUT.md RESEARCH_JOURNAL_FORMAT.md TOOLBAR_LEGEND_LAYOUT.md; do
  [ ! -f "$ROOT/docs/en/$file" ] || cp "$ROOT/docs/en/$file" "$TMP/source/$APP_ID/docs/en/$file"
done
# Ensure all public links in README resolve within the staged repository.
for file in README.md README_CZ.md docs/cz/01_INSTALACE.md docs/en/01_INSTALLATION.md; do
  [ -f "$TMP/source/$APP_ID/$file" ] || fail "Missing public README or installation guide: $file"
done
# Reject private/audit/report artifacts from public source AND runtime.
for item in "$TMP/source" "$TMP/runtime"; do
  if find "$item" \( -name '.env' -o -name '.env.*' -o -name '*.key' -o -name '*.csr' -o -name '*.crt' -o -name '*.pem' -o -name 'config.php' -o -name 'HDS_CERTIFICATE.json' -o -name 'HDS_AUDIT_REPORT_CZ.md' -o -name 'SOURCE_MANIFEST.sha256' -o -name 'EVIDENCE_MANIFEST.sha256' -o -name 'evidence' -o -name 'node_modules' -o -name 'tests' \) | grep -q .; then
    fail 'Forbidden private or internal file in staged release'
  fi
done
if find "$TMP/source/$APP_ID" -type f | grep -Eq '/(docs/hds|docs/.*/HDS_|package\.json|hacesoft-standard\.json|tests/|\.git/)'; then
  fail 'Internal audit or test files found in GitHub source stage'
fi
# Runtime contains executable app files + public license/change history, no source-only installer.
cp -R "$ROOT/src/." "$TMP/runtime/$APP_ID/"
for file in LICENSE CHANGELOG.md CHANGELOG.cs.md; do cp "$ROOT/$file" "$TMP/runtime/$APP_ID/$file"; done
# HDS: chybějící/změněný schválený obrázek, chybný odkaz nebo ztráta v runtime
# musí zastavit vydání před podpisem. Validuje i veřejný GitHub source staging.
node "$ROOT/scripts/check-appstore-assets.cjs" "$ROOT" "$TMP/runtime/$APP_ID" "$TMP/source/$APP_ID" \
  || fail 'BLOCKING: Schválené ikony, screenshoty nebo metadata neprošly kontrolou' 
(cd "$TMP/source" && zip -X -q -r "$TMP/$FULL_SOURCE" "$APP_ID")
# Publisher CP21 expects an unsigned runtime ZIP with appinfo/ at the app root,
# not src/appinfo/. Build it from exactly the same staged tree as the TAR.GZ.
(cd "$TMP/runtime" && zip -X -q -r "$TMP/$RUNTIME_ZIP" "$APP_ID")
(cd "$TMP/runtime" && tar -czf "$TMP/$UNSIGNED" "$APP_ID")
unzip -tqq "$TMP/$FULL_SOURCE" || fail 'Invalid full-source ZIP'
unzip -tqq "$TMP/$RUNTIME_ZIP" || fail 'Invalid Publisher runtime ZIP'
unzip -Z1 "$TMP/$RUNTIME_ZIP" | grep -Fx "$APP_ID/appinfo/info.xml" >/dev/null || fail 'Runtime ZIP does not contain appinfo/info.xml at the expected path'
unzip -Z1 "$TMP/$RUNTIME_ZIP" | grep -Fx "$APP_ID/lib/AppInfo/Application.php" >/dev/null || fail 'Runtime ZIP does not contain application PHP code'
if unzip -Z1 "$TMP/$RUNTIME_ZIP" | grep -Eq "^$APP_ID/(src/|tests/|docs/|evidence/|secrets/)"; then
  fail 'Runtime ZIP contains source-only, audit or secret directories'
fi
tar -tzf "$TMP/$UNSIGNED" | grep -Fx "$APP_ID/appinfo/info.xml" >/dev/null || fail 'Invalid runtime TAR.GZ'
unzip -Z1 "$TMP/$FULL_SOURCE" | grep -Fx "$APP_ID/src/appinfo/info.xml" >/dev/null || fail 'Incomplete full-source ZIP'
unzip -Z1 "$TMP/$FULL_SOURCE" | grep -Fx "$APP_ID/build-release.sh" >/dev/null || fail 'Full-source ZIP missing build script'
unzip -Z1 "$TMP/$FULL_SOURCE" | grep -Fx "$APP_ID/README.md" >/dev/null || fail 'Full-source ZIP missing README'
unzip -Z1 "$TMP/$FULL_SOURCE" | grep -Fx "$APP_ID/README_CZ.md" >/dev/null || fail 'Full-source ZIP missing README_CZ'
unzip -Z1 "$TMP/$FULL_SOURCE" | grep -Fx "$APP_ID/examples/README.md" >/dev/null || fail 'Full-source ZIP missing English example guide'
unzip -Z1 "$TMP/$FULL_SOURCE" | grep -Fx "$APP_ID/examples/README_CZ.md" >/dev/null || fail 'Full-source ZIP missing Czech example guide'
# Screenshot PNG jsou záměrně mimo všechny vydávací archivy.
if unzip -Z1 "$TMP/$FULL_SOURCE" | grep -Eq '^'$APP_ID'/(src/img/[^/]+\.png|screenshot/|screenshots/)'; then
  fail 'BLOCKING: GitHub ZIP nesmí obsahovat externí screenshoty'
fi
# Ověřit skutečné bajty uvnitř obou ZIPů a TAR.GZ, nejen vstupní soubory.
for image in app.svg; do
  expected="$(sha256sum "$ROOT/src/img/$image" | cut -d ' ' -f 1)"
  actual_zip="$(unzip -p "$TMP/$RUNTIME_ZIP" "$APP_ID/img/$image" | sha256sum | cut -d ' ' -f 1)"
  actual_tar="$(tar -xOzf "$TMP/$UNSIGNED" "$APP_ID/img/$image" | sha256sum | cut -d ' ' -f 1)"
  [ "$expected" = "$actual_zip" ] && [ "$expected" = "$actual_tar" ] \
    || fail "BLOCKING: Schválená ikona $image změněna v runtime ZIP/TAR.GZ"
done
expected="$(sha256sum "$ROOT/src/appinfo/info.xml" | cut -d ' ' -f 1)"
actual_zip="$(unzip -p "$TMP/$RUNTIME_ZIP" "$APP_ID/appinfo/info.xml" | sha256sum | cut -d ' ' -f 1)"
actual_tar="$(tar -xOzf "$TMP/$UNSIGNED" "$APP_ID/appinfo/info.xml" | sha256sum | cut -d ' ' -f 1)"
[ "$expected" = "$actual_zip" ] && [ "$expected" = "$actual_tar" ] || fail 'BLOCKING: Screenshot metadata changed in runtime ZIP/TAR.GZ'
# App Store screenshoty jsou veřejné soubory na GitHubu MIMO archivy.
# Zabránit jejich přibalení a pozdějšímu skrytému přidání.
for archive in "$TMP/$FULL_SOURCE" "$TMP/$RUNTIME_ZIP"; do
  if unzip -Z1 "$archive" | grep -Eq '^'$APP_ID'/(img/[^/]+\.png|src/img/[^/]+\.png|screenshot/|screenshots/)'; then
    fail 'BLOCKING: Screenshoty se nesmí nacházet ve vydávacích ZIPech'
  fi
done
if tar -tzf "$TMP/$UNSIGNED" | grep -Eq '^'$APP_ID'/(img/[^/]+\.png|screenshot/|screenshots/)'; then
  fail 'BLOCKING: Screenshoty nesmí být v runtime TAR.GZ'
fi
printf 'PASS: Schválená ikona v ZIP/TAR.GZ; screenshoty se distribuují jen na GitHubu.\n'
printf 'PENDING: před zveřejněním povinně ověřit veřejné URL a SHA-256 screenshotů.\n'
mkdir -p "$RELEASE"
for name in "$FULL_SOURCE" "$RUNTIME_ZIP" "$UNSIGNED" "$CHECKS"; do
  [ ! -e "$RELEASE/$name" ] || fail "Output appeared concurrently: $name"
done
mv "$TMP/$FULL_SOURCE" "$RELEASE/$FULL_SOURCE"
mv "$TMP/$RUNTIME_ZIP" "$RELEASE/$RUNTIME_ZIP"
mv "$TMP/$UNSIGNED" "$RELEASE/$UNSIGNED"
(cd "$RELEASE" && sha256sum "$FULL_SOURCE" "$RUNTIME_ZIP" "$UNSIGNED" > "$CHECKS")
printf 'Publisher CP21 full source: %s\n' "$RELEASE/$FULL_SOURCE"
printf 'UNSIGNED runtime ZIP (Publisher CP21 input): %s\n' "$RELEASE/$RUNTIME_ZIP"
printf 'UNSIGNED staging (do not publish): %s\n' "$RELEASE/$UNSIGNED"
printf 'Next step: Hacesoft Publisher HDS/CP21 + code signature + TAR.GZ signature + App Store publication.\n'
