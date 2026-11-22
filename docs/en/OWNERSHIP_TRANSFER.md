# Family tree ownership transfer (1.3.0)

From the tree's `⋯` menu choose **Transfer family tree ownership**, select one active Nextcloud user, review the selected recipient in the confirmation dialog, and explicitly confirm. No account password or retyping is required.

The recipient becomes the actual owner with full editing, sharing and deletion authority. The previous owner loses direct ownership, though existing group shares may still grant access. Person and tree IDs, history, research, photographs and shares remain unchanged. The operation is audited. If a previously opened journal or tree list still shows the former owner, refresh the page to reload the current permissions from the server.

Old local attachments, imported GEDCOM/GEDZIP originals and legacy photographs are copied non-destructively into private AppData before switching the owner; the original user's Files are untouched. The native ZIP v2 backup continues to include these attachments. If any file cannot be safely preserved, the transfer is denied without changing ownership. Limits: 1,000 attachments, 48 MiB per file and 256 MiB of newly preserved data. External URLs stay references.

A complete backup is recommended first. Test with two Nextcloud accounts on a non-production tree before publication.

After transfer, linked local documents and import archives are available through authenticated FamilyTree endpoints, not another user’s Files.
