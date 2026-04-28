# iDeal CSV Upload Spec — Manual Kod Rujukan (Transaksi Syarikat)

**Note**: This spec is for future use — KPKT compliance reporting when loan data is available. Not required for Phase 1 (sign in / sign up).

Source: *Manual Kod Rujukan bagi Proses Muatnaik Fail Transaksi Syarikat* (PDF).

This document is **developer-facing**: it describes the **CSV headers** and the **accepted formats / validations** required by the iDeal upload.

---

## CSV basics

- **Header row required** and must match the field names **exactly** (case-sensitive, no spaces).
- Recommended file encoding: **UTF-8**.
- For all numeric money fields: use **dot decimals** (e.g. `5000.00`), **no thousands separators** (no `,`).
- For values with fixed choices (enums), spelling must match **exactly** as listed below.

---

## Header list (in logical order)

> If your SQL export has a different order, reorder columns to match this list for consistency.

1. `JenisPemohon`
2. `NamaPemohon`
3. `JenisSyarikat`
4. `NomborPerniagaan`
5. `NoKp`
6. `NomborTelefon`
7. `Bangsa`
8. `Jantina`
9. `Pekerjaan`
10. `Pendapatan`
11. `Majikan`
12. `Alamat`
13. `StatusCagaran`
14. `JenisCagaran`
15. `NilaiCagaran`
16. `TarikhPinjaman`
17. `PinjamanPokok`
18. `JumlahFaedahKeseluruhan`
19. `JumlahPinjamanKeseluruhan`
20. `KadarFaedah`
21. `TempohBayaran`
22. `BakiPinjamanKeseluruhan`
23. `JumlahNpl`
24. `Nota`

---

## Field-by-field spec

### Applicant identity

| Field | Required | When | Type / Max | Allowed values / Rules | Notes |
|---|---|---|---|---|---|
| `JenisPemohon` | Yes | Always | Text, max 255 | `Individu` or `Syarikat` | Must be exactly one of the accepted values. fileciteturn0file0L1-L17 |
| `NamaPemohon` | Yes | Always | Text, max 255 | Any | Applicant name. fileciteturn0file0L18-L26 |

### Company-only fields (only when `JenisPemohon = Syarikat`)

| Field | Required | When | Type / Max | Allowed values / Rules | Notes |
|---|---|---|---|---|---|
| `JenisSyarikat` | Conditional | If `JenisPemohon = Syarikat` | Text, max 255 | `Bumi`, `Bukan Bumi`, `Asing` | Spelling must match exactly. fileciteturn0file0L27-L47 |
| `NomborPerniagaan` | Conditional | If `JenisPemohon = Syarikat` | Text+Number, max 25 | Any | Business registration / number. fileciteturn0file0L48-L56 |

### Individual-only fields (only when `JenisPemohon = Individu`)

| Field | Required | When | Type / Max | Allowed values / Rules | Notes |
|---|---|---|---|---|---|
| `NoKp` | Conditional | If `JenisPemohon = Individu` | Number, max 12 | **No dash `-`**. Example: `XXXXXXXXXXXX` | Doc notes: for Malaysians use IC; non-Malaysians use passport number, but system expects numeric formatting. fileciteturn0file0L1-L19 |
| `NomborTelefon` | Conditional | If `JenisPemohon = Individu` | Number, max 10 | **No dash `-`**, **no `+6` prefix**. Example: `017XXXXXXX` | fileciteturn0file0L1-L17 |
| `Bangsa` | Conditional | If `JenisPemohon = Individu` | Text, max 25 | `Melayu`, `Cina`, `India`, `Lain-lain`, `Bumiputera (Sabah/Sarawak)`, `Bukan Warganegara` | Common errors: must be exactly `Lain-lain` and `Bumiputera (Sabah/Sarawak)` (including punctuation). fileciteturn0file0L18-L44 |
| `Jantina` | Conditional | If `JenisPemohon = Individu` | Text, max 25 | `Lelaki` or `Perempuan` | fileciteturn0file0L1-L14 |
| `Pekerjaan` | Conditional | If `JenisPemohon = Individu` | Text, max 25 | Any | fileciteturn0file0L15-L22 |
| `Pendapatan` | Conditional | If `JenisPemohon = Individu` | Number | Format: `5000.00` (no commas) | fileciteturn0file0L23-L33 |
| `Majikan` | Conditional | If `JenisPemohon = Individu` | Text, max 25 | `Tiada Maklumat`, `Kerajaan`, `Swasta`, `Berniaga`, `Kerja Sendiri`, `Tidak Bekerja` | Must match exactly. fileciteturn0file0L1-L17 |
| `Alamat` | Conditional | If `JenisPemohon = Individu` | Text+Number, max 255 | Any | fileciteturn0file0L18-L25 |

---

### Collateral (Cagaran)

| Field | Required | When | Type / Max | Allowed values / Rules | Notes |
|---|---|---|---|---|---|
| `StatusCagaran` | Yes | Always | Text, max 25 | `Bercagar` or `Tidak Bercagar` | If has collateral, choose `Bercagar`. fileciteturn0file0L26-L39 |
| `JenisCagaran` | Conditional | If `StatusCagaran = Bercagar` | Text, max 25 | `Lain-lain`, `Emas`, `Tanah`, `Rumah`, `Kenderaan Bermotor` | Must match exactly. fileciteturn0file0L1-L17 |
| `NilaiCagaran` | Conditional | If `StatusCagaran = Bercagar` | Number, max 10 | Format: `5000.00` (no commas) | fileciteturn0file0L18-L31 |

---

### Loan details

| Field | Required | When | Type / Max | Allowed values / Rules | Notes |
|---|---|---|---|---|---|
| `TarikhPinjaman` | Yes | Always | Date | `dd/mm/YYYY` (e.g. `01/01/2023`) | fileciteturn0file0L32-L37 |
| `PinjamanPokok` | Yes | Always | Number, max 10 | Format: `5000.00` (no commas) | fileciteturn0file0L38-L47 |
| `JumlahFaedahKeseluruhan` | Yes | Always | Number, max 10 | Format: `5000.00` (no commas) | fileciteturn0file0L1-L9 |
| `JumlahPinjamanKeseluruhan` | Yes | Always | Number, max 10 | Format: `5000.00` (no commas) | fileciteturn0file0L10-L18 |
| `KadarFaedah` | Yes | Always | Number, max 10 | **Do not include `%`**. Example: `12` | fileciteturn0file0L19-L27 |
| `TempohBayaran` | Yes | Always | Number, max 10 | Any numeric value | fileciteturn0file0L28-L34 |
| `BakiPinjamanKeseluruhan` | Yes | Always | Number, max 10 | Format: `5000.00` (no commas) | fileciteturn0file0L1-L9 |
| `JumlahNpl` | Yes | Always | Number, max 10 | Format: `1000.00` (no commas) | fileciteturn0file0L10-L18 |
| `Nota` | Yes | Always | Text, max 150 | One of: `PINJAMAN SELESAI`, `PINJAMAN SEMASA`, `DALAM PROSES DAPAT BALIK`, `DALAM TINDAKAN MAHKAMAH` | Must match exactly. fileciteturn0file0L19-L36 |

---

## Conditional logic summary (implementation rules)

### 1) Applicant type rules
- If `JenisPemohon = Syarikat`:
  - Require: `JenisSyarikat`, `NomborPerniagaan`
  - Do **not** require: `NoKp`, `NomborTelefon`, `Bangsa`, `Jantina`, `Pekerjaan`, `Pendapatan`, `Majikan`, `Alamat`
- If `JenisPemohon = Individu`:
  - Require: `NoKp`, `NomborTelefon`, `Bangsa`, `Jantina`, `Pekerjaan`, `Pendapatan`, `Majikan`, `Alamat`
  - Do **not** require: `JenisSyarikat`, `NomborPerniagaan`

### 2) Collateral rules
- If `StatusCagaran = Bercagar`:
  - Require: `JenisCagaran`, `NilaiCagaran`
- If `StatusCagaran = Tidak Bercagar`:
  - `JenisCagaran` and `NilaiCagaran` should be blank / NULL in the CSV export.

---

## Example row (for sanity check)

> This is an **example only**. Ensure your export matches real DB data.

```csv
JenisPemohon,NamaPemohon,JenisSyarikat,NomborPerniagaan,NoKp,NomborTelefon,Bangsa,Jantina,Pekerjaan,Pendapatan,Majikan,Alamat,StatusCagaran,JenisCagaran,NilaiCagaran,TarikhPinjaman,PinjamanPokok,JumlahFaedahKeseluruhan,JumlahPinjamanKeseluruhan,KadarFaedah,TempohBayaran,BakiPinjamanKeseluruhan,JumlahNpl,Nota
Individu,ALI BIN ABU,,,900101011234,0171234567,Melayu,Lelaki,Jurutera,5000.00,Swasta,"No 1, Jalan Example, 11900 Pulau Pinang",Bercagar,Rumah,100000.00,01/01/2023,5000.00,600.00,5600.00,12,12,2000.00,0.00,PINJAMAN SEMASA
```

---

## Notes for DB → CSV export

- Treat all enum fields as **strict** (fail export if value is outside allowed list).
- For phone / NoKp fields:
  - Store and export as strings if you need to preserve leading zeros (e.g., `017...`).
  - Still ensure they contain only digits and respect max length.
- If you generate with SQL:
  - Ensure date formatting is `DD/MM/YYYY`.
  - Ensure decimal formatting uses `.` and not locale commas.
