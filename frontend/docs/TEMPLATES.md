# Barangay Certificate DOCX Template Guide

This guide explains how barangay administrators and staff can create, upload, and manage custom Microsoft Word (`.docx`) certificate templates in QuickFile.

---

## 1. Quick Start

1. Go to **Admin Portal &rarr; Document Types**.
2. Click **Edit** (or the **Template** shortcut button) on any document type (such as *Barangay Clearance* or *Certificate of Indigency*).
3. Switch to the **Certificate Template** tab.
4. Click **Download Starter Template (.docx)** to obtain a pre-configured Word template with correct formatting, layout, and a pre-configured QR code placeholder.
5. Customize the template in Microsoft Word (change barangay headers, seal, body paragraphs, and signatory names).
6. Upload the `.docx` file in the template panel.
7. Review the **Validation Report**:
   - **Errors (Red)**: Must be fixed before the template can be saved or used.
   - **Warnings (Amber)**: Non-blocking reminders (e.g., optional placeholders missing).
   - **Placeholders Found (Green)**: Recognized tags successfully detected.
   - **Unknown Tags**: Tags that are not recognized, along with suggested replacements.
8. Click **Activate** on the uploaded version. The document type will automatically switch to **Custom v#** mode.

---

## 2. How to Edit Templates in Microsoft Word

### A. Placeholders Syntax & Run Splitting Prevention
All dynamic fields are enclosed in single curly braces: `{placeholder_name}`.

> [!IMPORTANT]
> **Avoid Run Splitting in Microsoft Word:**
> Microsoft Word often splits words internally into multiple XML text runs (for example, if you pause typing, if spellcheck activates, or if you change font style halfway). If `{full_name}` is split into `{full_` and `name}`, the template engine cannot recognize it.
> - **Best Practice 1:** Type the placeholder completely in one continuous go without pausing or backspacing.
> - **Best Practice 2:** Alternatively, copy the tag directly from the QuickFile Placeholders table (using the **Copy** button) and paste it into Word using **Keep Text Only** / **Paste Plain Text** (`Ctrl+Shift+V` or right-click &rarr; *Keep Text Only*).
> - **Best Practice 3:** Ensure the entire placeholder has identical formatting (same font, same weight, same size, same color).

### B. Barangay Letterhead, Logos, and Standard Content
- Keep your barangay logo, municipal seal, borders, headers, and footers as standard Word images and shapes.
- Static official text (e.g., Republic of the Philippines, Province, Municipality, Office of the Punong Barangay) should be typed directly as normal text.

### C. QR Code Placeholder Rules
Every issued certificate generates a unique verification QR code that allows anyone (police, banks, employers, or embassies) to verify document authenticity online.

To include the QR code on your certificate:
1. Insert a placeholder picture in Word (or use the one already provided in the starter template).
2. The image dimensions should be **square** and at least **2.5 cm &times; 2.5 cm** (approx. 1 inch &times; 1 inch) to ensure clear readability when printed and scanned by mobile phones.
3. Set the image **Alt Text**:
   - Right-click the image &rarr; **View Alt Text...** (or **Format Picture** &rarr; **Layout & Properties** &rarr; **Alt Text**).
   - In either the **Title** or **Description** field, type exactly: `qr_code`.
4. When certificates are issued, QuickFile automatically swaps this placeholder picture with the high-resolution dynamic PNG QR code.
5. If your template does not have a picture with alt text `qr_code`, it is treated as a text-only certificate (the verification code will still be available as text `{verification_code}`).

### D. Security & Safe Word Content
For security, QuickFile rejects documents with dangerous active content:
- **Allowed:** Standard text, tables, fonts, headings, static images, margins, page breaks, and plain Word fields (`PAGE`, `NUMPAGES`, `DATE`, `TIME`, and `http`/`https` hyperlinks).
- **Prohibited:** Macros (`.docm`), VBA scripts, External Links/DDE fields, OLE objects, custom XML inclusions, and embedded executables. Templates containing these will be rejected during upload.
- File size limit: **2 MB**.

---

## 3. Placeholders Reference Catalog

Below is the complete reference catalog of allowlisted placeholders available in QuickFile.

### Citizen Details (`citizen`)
| Placeholder | Description | Example Output |
| :--- | :--- | :--- |
| `{full_name}` | Full citizen name (First Middle Last Suffix) | `Juan Dela Cruz Jr.` |
| `{full_name_upper}` | Uppercase full name | `JUAN DELA CRUZ JR.` |
| `{first_name}` | First name | `Juan` |
| `{middle_name}` | Middle name or initial | `Mercado` |
| `{last_name}` | Last name | `Dela Cruz` |
| `{suffix}` | Name extension / suffix | `Jr.` |
| `{civil_status}` | Civil status | `Single` |
| `{gender}` | Gender | `Male` |
| `{birthdate_long}` | Formatted birthdate | `January 15, 1995` |
| `{age}` | Calculated age at time of issuance | `31` |
| `{address}` | Complete residential address (Street and Purok) | `123 Rizal St., Purok 4` |
| `{purok_zone}` | Purok or Zone | `Purok 4` |
| `{barangay}` | Barangay of residence | `Barangay Central` |
| `{city}` | City or Municipality | `City Hall` |
| `{province}` | Province | `Metro Manila` |
| `{occupation}` | Resident's occupation | `Freelancer` |

### Document Request Details (`request`)
| Placeholder | Description | Example Output |
| :--- | :--- | :--- |
| `{purpose}` | Declared purpose of document request | `Employment Requirements` |
| `{copies}` | Number of requested copies | `1` |
| `{tracking_number}` | QuickFile resident tracking number | `QF-2026-0001` |

### Document & Certificate Details (`document`)
| Placeholder | Description | Example Output |
| :--- | :--- | :--- |
| `{document_name}` | Official document title | `Barangay Clearance` |
| `{document_name_upper}` | Uppercase document title | `BARANGAY CLEARANCE` |
| `{document_code}` | Document type code | `BC` |
| `{certificate_number}` | Unique sequential certificate number | `BRGY-BC-2026-123456` |
| `{verification_code}` | Unique public verification string | `A1B2C3D4E5F6G7H8J9K0` |
| `{verification_url}` | Full public verification URL | `http://localhost:5173/verify/A1B2C3D4E5F6G7H8J9K0` |
| `{issued_date}` | Date certificate was officially issued | `March 15, 2026` |
| `{issued_date_long}` | Date certificate was officially issued (Formal long form) | `15th day of March, 2026` |
| `{issued_day_ordinal}` | Day of the month with ordinal suffix | `15th` |
| `{issued_month}` | Full month name of issue | `March` |
| `{issued_year}` | 4-digit issuance year | `2026` |
| `{expiry_date}` | Expiration date of certificate | `September 11, 2026` |

### Barangay Office & Signatories (`barangay`)
| Placeholder | Description | Example Output |
| :--- | :--- | :--- |
| `{barangay_name}` | Barangay name | `Barangay 11` |
| `{barangay_name_upper}` | Uppercase barangay name | `BARANGAY 11` |
| `{city_municipality}` | City or Municipality name | `Malaybalay` |
| `{province}` | Province name | `Bukidnon` |
| `{office_name}` | Official office name | `Office of the Barangay Captain` |
| `{captain_name}` | Current Punong Barangay / Barangay Captain | `Hon. Juan dela Cruz` |
| `{secretary_name}` | Current Barangay Secretary | `Maria Santos` |

---

## 4. How the Preview Feature Works

In the template version table, click the **Preview** button for any template version.
- QuickFile generates a populated test document using **standardized sample data** (e.g. `Juan Dela Cruz Jr.`, `Barangay Clearance`, sample dates, and a test verification code).
- The document downloads immediately as `template-preview-v{version}.docx`.
- Open this file in Word to visually inspect:
  - Font sizes, alignments, margins, and line spacing.
  - Replacement of all `{placeholders}` with sample text.
  - Position and appearance of the dynamic QR code image.
  - Assure that no leftover `{...}` or `undefined` text appears.

---

## 5. Common Errors & Resolutions

| Issue | Cause | Resolution |
| :--- | :--- | :--- |
| **"Unclosed tag at line X"** | A placeholder has `{` without a matching `}`. | Inspect the template in Word for missing closing braces or broken tags like `{full_name`. |
| **Placeholder remains literal `{full_name}` after rendering** | Tag name is misspelled or has extra whitespace, e.g., `{ full_name }` or `{fullname}`. | Check spelling against the Placeholder Reference Table. Copy tags directly from the QuickFile table. |
| **"QR placeholder image missing or invalid"** | Image alt text is not set to `qr_code`, or image format is not PNG. | Right-click the placeholder picture &rarr; Alt Text &rarr; Set Title or Description to `qr_code`. Ensure the image is PNG format. |
| **"Compressed size ratio exceeds limit" / Zip Bomb** | File contains invalid compression or corrupted zip tables. | Save the document afresh using Microsoft Word ("Save As &rarr; Word Document (.docx)") rather than third-party converters. |
| **"File exceeds maximum allowed size of 2MB"** | High-resolution embedded photographs or logos made the file too large. | In Word, select images &rarr; Picture Format &rarr; **Compress Pictures** (select "Print (220 ppi)" or "Web (150 ppi)"). |
| **"Cannot retire active template" (409 Conflict)** | The template version is currently marked active. | Switch the document type mode to **Built-in** first (or activate another template version), then proceed to retire. |
| **"Cannot delete template referenced by issued documents" (409 Conflict)** | At least one certificate was already issued using this template version. | For audit integrity, templates that produced issued certificates cannot be deleted. Retire the template instead to prevent future use. |

---

## 6. Important System Configuration: QR Verification URL

> [!WARNING]
> **Production QR Code Verification Domain (`PUBLIC_APP_URL`):**
> The QR code printed on certificates encodes an absolute URL pointing to QuickFile's public verification page:
> `{PUBLIC_APP_URL}/verify/{verification_code}`
>
> In development/testing, this defaults to `http://localhost:3000`.
> **Before deploying to production and issuing certificates to real residents, your system administrator must configure `PUBLIC_APP_URL` in the server environment (or system settings) to the barangay's public domain (e.g., `https://quickfile.barangaycentral.gov.ph`).**
> If this is not set, printed QR codes will point to localhost and cannot be scanned by residents or third-party verifiers.
