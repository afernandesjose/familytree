# Person photos (FamilyTree 1.1.8)

Open **Edit person → Photos of this person**. A new person must be saved before uploading a photo.

1. Choose a JPG, PNG or WebP original photo; the original is preserved unchanged.
2. Drag the image within the square portrait crop, zoom or rotate by 90° increments. The cropped portrait is saved separately as a JPEG.
3. Select **Use as main portrait** and **Save photo**. The portrait appears on the person card, in the detail dialog and in the family tree.
4. Keep multiple photos for one person. Each gallery item can be made primary, re-cropped from its original, opened at original resolution or removed.

The original and cropped portrait are private Nextcloud Files owned by the tree owner. Image APIs enforce tree viewing/editing permissions including shares; no public URL is required. Legacy external photo URLs remain supported but remote files are never downloaded for backup.

Storage: `Rodokmen/Fotografie/<tree SQL ID>/<person stable ID>/<photo ID>/original.jpg|png|webp` and `portrait.jpg`. The existing documents table stores the original in `file_path`, the cropped preview in `source`, and the main portrait in the person's `photo_url`. There is no new database table or migration. Do not manually move these application-managed files.

**Complete native ZIP v2 backup** includes all originals and crops, with SHA-256 checks and safe remapping of tree/person IDs during restoration into **new** trees. Test the round trip on a staging Nextcloud instance before production publication. GEDCOM 7 `.ged` cannot embed the images; GEDZIP export is unchanged. For portable photos use the complete native ZIP v2 backup. Limits: 12 MiB per original upload, 4 MiB per cropped preview, 48 MiB per archived file and 256 MiB total archived files.
