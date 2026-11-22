# Custom DOCX Certificate Template — Step-by-Step Guide

This guide explains how to create, upload, and activate a custom Word (`.docx`) template for a document type in QuickFile. When a staff member issues a document for a citizen request, the system fills the active template with real data and returns a `.docx` file.

---

## 1. How it works (short version)

1. Each **document type** has a setting called `template_mode`:
   - `builtin` — the system's standard certificate layout.
   - `custom` — your uploaded `.docx` template.
2. You upload one or more versions of a `.docx` template for a document type.
3. You **activate** one version — that version becomes the live template.
4. At issuance, the server replaces placeholders like `{full_name}` with real values and swaps a special QR image with the document's real verification QR code.

> **Important:** `DocumentType.active_template_id` is the single source of truth for which template is live. The `is_active` flag shown in the UI is display-only.

---

## 2. Prerequisites

- An **Admin** account (all template management routes require the `ADMIN` role).
- Microsoft Word (or LibreOffice Writer / Google Docs exported as `.docx`).
- A **PNG** image for the QR placeholder (any PNG works — it gets replaced at issuance).
- Your template file must be **2 MB or smaller**.

---

## 3. Create your template (recommended: start from the starter file)

### Step 1 — Download the starter template

1. Log in as an **Admin**.
2. Go to **Admin → Document Types** and open the document type you want to configure (e.g. *Barangay Clearance*).
3. Open the **Certificate Template** panel.
4. Click **Download Starter Template** (`starter-certificate-template.docx`).

The starter file already contains:
- an official-looking certificate layout with all allowlisted placeholders,
- a real PNG QR image whose alt text is already set to `qr_code`.

Editing this file is the safest path — you can't accidentally break the QR mechanism if you keep its alt text intact.

### Step 2 — Edit the document layout

Open the file in Word and change the text freely: add your barangay letterhead, seal, a signature line, adjust fonts, etc.

To insert a value that changes per request, type a **plain placeholder tag** exactly as listed in Section 4, for example:

```
This certifies that {full_name}, {age} years old, of {address},
has no derogatory record in this barangay.

Issued this {issued_date_long} at {barangay_name}, {province}.
Certificate No.: {certificate_number}
Verify at: {verification_url}
```

Placeholder rules:
- Use plain `{name}` tags only — **no spaces inside the braces**.
- No loops (`{#items}`), conditions (`{^items}` / `{/items}`), expressions (`{(a+b)}`), or filters (`{name|uppercase}`) — these are rejected.
- Only the allowlisted names in Section 4 are accepted. A typo produces an error with a "Did you mean…?" suggestion.
- The same tag can be used multiple times in the document (including in headers and footers).

### Step 3 — (If not using the starter) add the QR placeholder image

The QR code is **not** a text placeholder. It is an **image with special alt text**:

1. Prepare any **PNG** image (a blank square works — the image content is replaced at issuance).
2. In Word: **Insert → Pictures → This Device…** and place it where the QR should appear.
3. **Right-click the image → View Alt Text…** (older Word: *Format Picture → Alt Text*).
4. In the **Description** field, type exactly:

   ```
   qr_code
   ```

   Lowercase, underscore, no spaces. Leave *Title* empty. (The validator checks the `descr` or `title` attribute of the image; Word's *Description* field exports as `descr`.)

5. Resize/position the image as desired — moving or resizing preserves the alt text.

QR rules (enforced at upload):
- **Exactly one** QR-marked image per template.
- The image must be a **valid PNG** (JPEG is rejected).
- The image must be **dedicated**: don't reuse the same PNG file anywhere else in the document (e.g., as a logo or a second copy). If the same media file is shared by another drawing, validation fails.
- The file must physically exist inside the `.docx` archive (don't just link to an external image).

### Step 4 — Save the file

Save as **Word Document (`.docx`)**. Confirm the file size is ≤ 2 MB.

### Step 5 — Upload the template

1. In the **Certificate Template** panel, select your `.docx` in the **Upload** section and click **Upload**.
2. The server validates the file. The **validation report** appears:
   - **Errors** → the upload is rejected; fix the file and try again (see Section 6).
   - **Warnings** → the template is accepted (e.g., "Template does not contain `{full_name}`"), but review them.
   - On success: the new **version number** (auto-incremented: v1, v2, v3…) and the list of placeholders found are shown.

Note: uploads are limited to **10 per hour per admin**.

### Step 6 — Preview and activate

1. Find your version in the **Version History** table.
2. Click **Preview** to download a sample-rendered `.docx` (filled with example catalog data and a real QR). Open it and check layout, alignment, and that the QR appears.
3. Click **Activate** on the version you want to use. This switches the document type to `custom` mode and sets it as the live template (**builtin** mode can be restored with the mode switch if needed).
4. (Optional) After previewing, you can re-activate an older version at any time, or **retire** / **delete** unused versions. The active version can't be retired; a version referenced by an already-issued document can't be deleted.

### Step 7 — Verify with a real request

1. Submit a test document request as a citizen, approve/issue it as staff, and download the resulting `.docx`.
2. Confirm that real values (name, address, certificate number, dates) and the QR code appear correctly.
3. Scan the QR with your phone — it should open the public verification page for the issued document.

---

## 4. Allowed placeholders (catalog)

Only these tags are accepted. Sensitive values (phone, email, ID numbers, voter status) are deliberately excluded.

### Citizen
| Tag | Example |
|---|---|
| `{full_name}` | Juan Dela Cruz |
| `{full_name_upper}` | JUAN DELA CRUZ |
| `{first_name}` | Juan |
| `{middle_name}` | Santos |
| `{last_name}` | Dela Cruz |
| `{suffix}` | Jr. |
| `{civil_status}` | Single |
| `{gender}` | Male |
| `{birthdate_long}` | June 15, 1995 |
| `{age}` | 30 (age at issue date) |
| `{address}` | 123 Rizal Street, Zone 4 |
| `{purok_zone}` | Zone 4 |
| `{barangay}` | Barangay 11 |
| `{city}` | Malaybalay |
| `{province}` | Bukidnon |
| `{occupation}` | Office Clerk |

### Request
| Tag | Example |
|---|---|
| `{purpose}` | Employment requirement |
| `{copies}` | 1 |
| `{tracking_number}` | QF-2026-0001 |

### Document
| Tag | Example |
|---|---|
| `{document_name}` | Barangay Clearance |
| `{document_name_upper}` | BARANGAY CLEARANCE |
| `{document_code}` | BC |
| `{certificate_number}` | BRGY-BC-2026-123456 |
| `{verification_code}` | A1B2C3D4E5F6G7H8J9K0 |
| `{verification_url}` | https://…/verify/A1B2… |
| `{issued_date}` | March 15, 2026 |
| `{issued_date_long}` | 15th day of March, 2026 |
| `{issued_day_ordinal}` | 15th |
| `{issued_month}` | March |
| `{issued_year}` | 2026 |
| `{expiry_date}` | September 11, 2026 (empty if no expiry) |

### Barangay
| Tag | Example |
|---|---|
| `{barangay_name}` | Barangay 11 |
| `{barangay_name_upper}` | BARANGAY 11 |
| `{city_municipality}` | Malaybalay |
| `{province}` | Bukidnon |
| `{office_name}` | Office of the Barangay Captain |
| `{captain_name}` | Hon. Juan dela Cruz |
| `{secretary_name}` | Maria Santos |

Notes:
- Values are sanitized (invalid XML control characters removed, capped at 500 characters).
- Dates follow the configured jurisdiction timezone (`APP_TIMEZONE_OFFSET_MINUTES`).
- If a placeholder's value is missing for a particular request, it renders as an empty string and a non-blocking `data_warnings` entry is recorded on the issued document.

---

## 5. Validation rules (what gets rejected at upload)

| Rule | Reason |
|---|---|
| File > 2 MB | Upload size limit |
| More than 300 ZIP entries; any entry > 10 MB; total uncompressed > 20 MB; compression ratio > 100:1 | Zip-bomb protection |
| Malformed DOCX / missing End-of-Central-Directory record | Not a valid Word file |
| Spaces inside tags (`{ full_name }`), loops, conditions, expressions, filters, arithmetic/comparison in tags | Only plain `{name}` tags supported |
| Unknown tag not in the catalog | Prevents arbitrary data access; suggestion provided for typos |
| External relationships, `attachedTemplate`, `oleObject`, `externalLink` (except standard hyperlinks) | Security — no external resource loading |
| `<w:altChunk>`, `<w:subDoc>`, `<w:object>`, `<w:control>`, `<o:OLEObject>` | Prohibited embedded content |
| Dynamic fields: `INCLUDETEXT`, `INCLUDEPICTURE`, `DDE`, `DDEAUTO`, `LINK`, `IMPORT` | Prevents live content injection |
| More than one QR image, non-PNG QR image, shared QR image, missing QR media | QR swap must be unambiguous and fail-safe |
| Missing `{certificate_number}` | Required identifier |

**Required verification element:** the template must contain at least one of `{verification_code}`, `{verification_url}`, or a QR image with alt text `qr_code`.

**Warning (not an error):** if neither `{full_name}` nor `{full_name_upper}` is present, the certificate will lack the recipient's name.

---

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| "Unknown placeholder `{...}`" | Use the suggested catalog name; check spelling/case. Tags are case-sensitive. |
| "Spaces inside tag braces are not allowed" | Change `{ full_name }` → `{full_name}`. |
| "Unsupported tag syntax … loops/conditions/filters" | Remove `{#…}`, `{^…}`, `{/…}`, `{…|filter}`, `{a+b}` — only plain tags are supported. |
| "Missing required placeholder: `{certificate_number}`" | Add `{certificate_number}` anywhere in the document. |
| "Missing required verification element" | Add `{verification_url}` or `{verification_code}`, or a QR image alt-tagged `qr_code`. |
| "QR placeholder must be a valid PNG" | Replace the placeholder image with a real `.png` file (not JPEG). |
| "shared with another image element" | The QR PNG must be a dedicated image — insert it only once and don't use the same file elsewhere. |
| "Multiple QR code placeholder images detected" | Only one image may have alt text `qr_code`. |
| "File size exceeds maximum allowed limit of 2 MB" | Compress images or reduce embedded content. |
| Preview shows blank values | Expected — preview uses example data; check the tags are spelled correctly. |
| Issuance fails with a generic server error | The QR swap failed closed (media missing/corrupt); re-upload a valid template with a dedicated PNG. |

---

## 7. Admin UI reference

Admin → Document Types → *(document type)* → Certificate Template panel:

- **Download Starter Template** — get the pre-built sample `.docx`.
- **Upload** — validate and save a new version.
- **Placeholder catalog table** — lists every allowed tag, its group, and example value.
- **Version history table** — for each version:
  - **Preview** — download a sample-rendered `.docx`.
  - **Download** — get the original uploaded file.
  - **Activate** — make it the live template.
  - **Retire** — mark as retired (not allowed for the active version).
  - **Delete** — remove it (blocked if an issued document references it).
- **Template mode switch** — `builtin` ↔ `custom`.

---

## 8. Under the hood (for developers)

- Validation: `backend/src/services/templateValidator.service.js`
- Placeholder allowlist and render-data builder: `backend/src/helpers/templatePlaceholders.js`
- Rendering/QR swap: `backend/src/services/documentTemplates.service.js`
- Starter file generation: `backend/src/services/templateStarter.service.js`
- Issuance integration: `backend/src/services/staff.service.js` (template selection + `render_data` snapshot)
- Model: `backend/src/models/DocumentTemplate.js`; live version on `backend/src/models/DocumentType.js` (`active_template_id`)
- Storage: `backend/uploads/templates/` (random hex filenames, SHA-256 verified)
- Admin UI: `frontend/src/pages/admin/doctypes/templates/`
- Integration tests: `backend/tests/test_docx_templates_real.js`
