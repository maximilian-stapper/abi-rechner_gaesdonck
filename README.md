# Abi Calculator Gaesdonck

A calculator for your Abitur average grade under the APO-GOSt NRW rules, tailored to the subjects offered at Collegium Augustinianum Gaesdonck. The site runs entirely in your browser, including on mobile.

**Live:** https://Maximilian-Stapper.github.io/abi-rechner/

## How to use

1. **Set up:** The first time you open the site, you can load your **LuPO file** (`.lpo`) to fill in the subjects, course types and Abitur subjects automatically (see below). Or enter which subjects you take in each semester (Q1.1 through Q2.2), and whether each is an advanced course with exams (S), without exams (M), an advanced-level course (LK), or an additional course (ZK). Then select your four Abitur exam subjects and, optionally, a project course, Advanced Class, or research paper.
2. **Enter grades:** For each course, add any number of oral grades (optionally weighted) and written grades. You pick each grade on a color scale from red to green that shows both the grade (1+ to 6) and the points (15 to 0), so you do not need to know the points by heart. The site calculates a provisional course grade (gray). Once you enter the official final grade, it is treated as confirmed (blue).
3. **Results:** The overview shows your projected Abitur grade, Blocks I and II, semester and subject averages, an eligibility check, and the calculation method. Each course is marked as required, counted, or excluded.

## LuPO import

- In the setup, tap *LuPO-Datei laden* and choose your `.lpo` file. The table of Q1.1 to Q2.2 and the four Abitur subjects are filled in; you can still change everything by hand.
- EF.1/EF.2 and the Vertiefungskurse (VKE/VKM) are ignored. If your LuPO choice contains a Projektkurs (`PK`), you are asked for its name in step 2; otherwise you pick Advanced Class or Facharbeit yourself, because LuPO does not list them.
- The file is read **only in your browser** (FileReader, no upload, no server). Only the table with the subjects is read, and from it only subject, course type (Q1.1 to Q2.2) and Abitur subject. Name, e-mail, birth date and the rest of the file are never opened. The page also sets a Content-Security-Policy with `connect-src 'none'`, so it cannot send data anywhere.
- Reading the Access-based `.lpo` format uses [mdb-reader](https://github.com/andipaetzold/mdb-reader) (MIT), bundled as `mdb-reader.js` together with its dependencies; the licenses are in `THIRD-PARTY-LICENSES.txt`.

## Privacy and backups

- All data stays local in your browser. There is no server, login, or data transfer.
- Browsers may delete local data; Safari, for example, may do so after a long period of inactivity. Save a **backup file** regularly from the menu (⋯).
- In a new browser, you can load the backup file when you first open the site and skip the setup.
- Mobile tip: Add the site to your Home Screen.

## Tested

The calculation logic was tested against the four sample academic pathways in the NRW Ministry of Education’s information sheet on calculating the overall qualification (as of August 2018). Block I matches in all four cases.

## Limitations

- Calculated course grades are provisional only. The grade assigned by the teacher is binding.
- The required courses for social sciences and the special rule for foreign languages introduced at a later stage are simplified. The limit of two literature courses is not checked.
- The calculator is based on the current APO-GOSt rules (Abitur 2028). The revised rules taking effect from the introductory phase in 2027/28 have not been implemented.
- No guarantee is given. The school and the NRW Ministry of Education and Cultural Affairs are the authoritative sources.

## Publishing (GitHub Pages)

Upload the `index.html` file to a repository. Under *Settings → Pages*, select the `main` branch and the `/ (root)` folder.
