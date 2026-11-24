# Abi Calculator Gaesdonck

A calculator for your Abitur average grade under the APO-GOSt NRW rules, tailored to the subjects offered at Collegium Augustinianum Gaesdonck. The site runs entirely in your browser, including on mobile.

**Live:** https://Maximilian-Stapper.github.io/abi-rechner_gaesdonck/

## How to use

1. **Set up:** The first time you open the site, you can load your **LuPO file** (`.lpo`) to fill in the subjects, course types and Abitur subjects automatically (see below). Or enter which subjects you take in each semester (Q1.1 through Q2.2), and whether each is an advanced course with exams (S), without exams (M), an advanced-level course (LK), or an additional course (ZK). Then select your four Abitur exam subjects and, optionally, a project course or Advanced Class. A *Facharbeit* (research paper) only replaces one Klausur in Q1.2; enter its grade there as a written grade.
2. **Enter grades:** For each course, add any number of oral grades (optionally weighted) and written grades. You pick each grade on a color scale from red to green that shows both the grade (1+ to 6) and the points (15 to 0), so you do not need to know the points by heart. The site calculates a provisional course grade (gray). Once you enter the official final grade, it is treated as confirmed (blue).
3. **Results:** The overview shows your projected Abitur grade, Blocks I and II, semester and subject averages, an eligibility check, and the calculation method. Each course is marked as required (*Pflicht*), counted (*zählt*), excluded (*gestrichen*) or still open (*wählbar*).

## How Block I is chosen

The calculator knows the rules before you have a single grade, and then picks the courses that give the best average.

- **Required courses** (§ 28 APO-GOSt, valid from 1 Aug 2025): all four courses of the four Abitur subjects; German and Mathematics; one continuously taken foreign language, one natural science and one social science (four courses each); two courses each in History and Social Sciences if that is not already your social science (additional courses, *ZK*, are required); two courses of Religion; two consecutive courses of Art or Music (or two of Literature); and the two Q2 courses of your *Schwerpunktfach* (9th compulsory subject: another foreign language or another MINT subject, § 28 (6)). If the Schwerpunktfach is a natural science, it may swap roles with your natural science (VV 28.3.1). Without a Schwerpunktfach the eligibility check reports a violation.
- **Spanish from EF** is a normal subject. Only if you had no second foreign language in Sekundarstufe I (tick the box in setup step 2) must it count: its two Q2 courses (§ 28 (4)), or all four if it is your only foreign language (§ 28 (5)).
- **Not required:** Sport, all other courses, and the Projektkurs / Advanced Class. They are counted only if they improve your average.
- **How many count:** 35 to 40 courses (a Projektkurs etc. counts as two). With 35 to 37 courses at most 7 deficits (4 points or fewer) are allowed, with 38 to 40 at most 8, and never more than 3 in advanced courses. At most 2 Literature courses can count. The calculator tries every legal combination, so it also takes more courses than the minimum when that is the only way to stay within the deficit limit.
- **Ambiguous subjects:** If more than one subject could be your foreign language, natural science, social science or Schwerpunktfach, all legal assignments are tried and the best one wins. In setup step 2 you can fix them yourself under *Pflichtfächer*.
- **0 points:** A course with 0 points counts as not taken (§ 6 (7), § 28 (1)). It is never counted and never a deficit. If another subject can fulfil the same requirement, that one is used (for example Physics instead of Biology). If not, the eligibility check shows which requirement fails.
- **Projection:** Courses without a grade yet are assumed to reach the average of their subject (or your overall average if the subject has no grade yet), so the projection counts 35 to 40 courses from the very first semester instead of only the few graded ones. Missing Abitur exams are assumed at your average in that exam subject.

## How Block II is calculated

Each of the four exam results counts five times (max. 300). With an additional oral exam in subjects 1 to 3, the written part counts double: (2 × written + oral) ÷ 3 × 5, rounded only at the end (table in Anlage 8 VVzAPO-GOSt; e.g. 5 written and 6 oral give 27, not 25). To pass, at least two exam subjects, one of them an LK, need 25 points or more, and Block II needs at least 100.

## Tests

The `tests` folder is not needed on the website. It runs with Node.js (no packages). `node tests/klausuren.test.js` checks that the exam calendar shows only your own written exams (Grundkurs exams only for S courses, LK exams only in your own band). `node tests/untis-worker.test.mjs` checks the Untis worker (CORS, allowed origin, fixed target host, forwarding, cookies, the whole Microsoft sign-in including wrong password, MFA and ADFS) together with `untis.js` using stand-ins for WebUntis and Microsoft, without a network. `node tests/untis-subjects.test.js` checks the recognition of all Q1 courses (264 cases), `node tests/untis-mobile.test.js` checks the one-time code (RFC 6238 test vectors) and the homework request. `node tests/push-worker.test.mjs` checks the reminder worker: the encryption reproduces the example from RFC 8291 byte for byte, a simulated browser decrypts the notification, the VAPID signature verifies, plus CORS, allowed push services, storage and the hourly reminder (winter and summer time). `node tests/untis-push.test.js` checks what the app sends to that worker and where it offers notifications at all.

## Updates (version number)

Browsers and especially the iPhone home-screen app keep old files for a while. `index.html` therefore carries a version (`<meta name="app-version">`, plus `?v=…` on every own `.js`/`.css` file), and `version.json` holds the same version. On opening, and whenever the app comes back to the foreground, it asks for `version.json` and reloads once if GitHub Pages has a newer version. **Before committing code changes, run `node tools/bump-version.mjs`**; `node tests/version.test.js` checks that the version matches everywhere.

## LuPO import

- In the setup, tap *LuPO-Datei laden* and choose your `.lpo` file. The table of Q1.1 to Q2.2 and the four Abitur subjects are filled in; you can still change everything by hand.
- EF.1/EF.2 and the Vertiefungskurse (VKE/VKM) are ignored. If your LuPO choice contains a Projektkurs (`PK`), you are asked for its name in step 2; otherwise you pick the Advanced Class yourself, because LuPO does not list it.
- The file is read **only in your browser** (FileReader, no upload, no server). Only the table with the subjects is read, and from it only subject, course type (Q1.1 to Q2.2), Abitur subject and the position in the language sequence (used only to tell whether Spanish from EF is your second foreign language). Name, e-mail, birth date and the rest of the file are never opened. The page also sets a Content-Security-Policy whose `connect-src` allows only the Untis worker (see below), so it cannot send data anywhere else.
- Reading the Access-based `.lpo` format uses [mdb-reader](https://github.com/andipaetzold/mdb-reader) (MIT), bundled as `mdb-reader.js` together with its dependencies; the licenses are in `THIRD-PARTY-LICENSES.txt`.

## Untis planner

The **Untis** button next to *Abi-Rechner* at the top opens a timetable and homework planner. It is independent of the calculator.

- **Week view:** every subject has its own color. The frame runs from **07:55 to 18:30** only; lessons are cut off at these limits and lessons completely outside are not shown (a note says how many). Double lessons are merged, cancelled lessons are dashed, changed lessons and exams get a dot, and a small number shows open homework. Tap a lesson to see time, room and teacher plus the homework of that subject.
- **Homework:** colored subject chips and a list sorted by due date. Tap the circle to mark a task as done, tap a subject to see all its tasks, and add your own with *+ Hausaufgabe*. **Overdue homework is not shown at all**, because teachers do not mark tasks as done in Untis.
- **Fixed addresses:** server `gaesdonck.webuntis.com`, school `gaesdonck` and the worker `https://untis-worker.maximilian-stapper.workers.dev` are built in (`FIX` in `untis.js`, `UNTIS`/`SCHOOL` in the worker) and cannot be changed in the app. The worker only talks to `gaesdonck.webuntis.com`.
- **Subject recognition** (`untis-subjects.js`): Untis course codes such as `D G1`, `E5 L1`, `S0 G1`, `G0 G3`, `DaF G1`, `PKKU` are mapped to subjects. Grundkurse of one subject are one group (`D G1`, `D G2`, `D G3` are *Deutsch*), Leistungskurse are separate groups with a thicker, stronger colored border (*Deutsch LK*), both Spanish codes (`S0`, `S9`) are *Spanisch*, *DaF* is separate from *Deutsch*, every Projektkurs is its own group, `StL-Std` is the Jahrgangsstufenleitung. Codes and names are recognized by pattern and by keywords, so other year groups usually work too. Anything unknown can be assigned by hand under *Fächer zuordnen*.
- **Microsoft login:** in *Untis → Einrichten* enter your school e-mail and Microsoft password and tap *Anmelden und abgleichen*. That is all.
  - The worker (route `POST /login`) does the same as the *Office 365* button on the Untis page: it opens `gaesdonck.webuntis.com/WebUntis/oauth2/authorization/office365`, fills in e-mail and password at `login.microsoftonline.com`, answers *Stay signed in?*, follows the redirect back via `o365.webuntis.com` and returns the Untis session cookies. The app then loads the timetable (`/api/public/timetable/weekly/data`, 4 weeks; JSON-RPC as fallback) and homework (`/api/homeworks/lessons`) with that session.
  - The password is only needed when Untis has ended the session. Optionally tick *Passwort auf diesem Gerät merken*, then the app syncs without asking. The session itself lives only in `sessionStorage` (gone when the tab closes).
  - **Not possible:** accounts that require a second factor (MFA) or a non-Microsoft sign-in page (ADFS). The app then says so. For these cases *Andere Wege* still offers the published calendar link (timetable), the Untis Mobile key (homework, TOTP via `untis-mobile.js`) and an ICS file import. They run only when the Microsoft login fails or no e-mail is entered.
  - **Caveat:** the Microsoft sign-in pages and the Untis web APIs are not official interfaces. If Microsoft changes its login pages, the worker reports *Microsoft zeigt eine Seite, die der Worker nicht kennt (…)* with the page name.
- **After changing the worker code:** paste `worker/untis-worker.js` into the Cloudflare worker `untis-worker` and deploy. An old worker without `/login` is detected and the app asks for a redeploy.
- **The worker does not run on GitHub Pages.** GitHub Pages only serves the static site. The worker lives at Cloudflare and runs only when called; the browser calls it from your Pages site. `OK_ORIGINS` in the worker must contain `https://maximilian-stapper.github.io` (without a path). `index.html` already allows the worker in the Content-Security-Policy (`connect-src 'self' https://untis-worker.maximilian-stapper.workers.dev`; `'self'` is for the update check); if you use another worker, change it there. *Verbindung prüfen* tests the connection and the allowed origin (route `/ping`) and says exactly what is missing.
- **Privacy:** e-mail, a remembered password, the calendar link and the Untis Mobile key are stored only on this device (never in the backup file). When signing in, e-mail and password pass through the worker to Microsoft; the worker stores and logs nothing. Run only this worker and do not share its code with secrets added. Timetable and homework stay in this browser and are part of the backup file (without any login data).
- Text from Untis (subjects, teachers, rooms, homework) is always escaped before it is shown.

## Homework reminders (push notifications)

Below the homework list in the Untis tab, the card **Erinnerungen** turns on a daily notification: every day at the chosen time (06:00 to 22:00) you get one message listing all open homework due within the chosen number of days (*nur am Vortag* up to *ab einer Woche vorher*). Homework due today is left out, ticked-off homework drops out, so each task is repeated every day until it is done. *Test-Mitteilung* sends one right away.

- **How it works:** the app sends its open homework (subject, due date, text; nothing else) and the device's push address to a second Cloudflare worker, `worker/push-worker.js` (`push-worker`). It keeps them in Workers KV and, once an hour (cron), sends the reminders via Web Push (VAPID, RFC 8292; payload encrypted with aes128gcm, RFC 8291) to Apple, Google or Mozilla. `sw.js` (a service worker with no cache and no fetch handler) shows the notification; tapping it opens the Untis tab. The worker never signs in to Untis: new homework reaches it whenever the app syncs (on opening) or you add or tick off something.
- **iPhone/iPad:** only in the app added to the Home Screen (iOS 16.4 or later); `manifest.webmanifest` makes the page a standalone web app. In a Safari tab the card explains how to add it. If the Home Screen app was added before the manifest existed and the button does not appear, save a backup file first (removing the app also removes its data), then remove it and add it again.
- **Set up the worker once** (Cloudflare dashboard): create the worker `push-worker` and paste `worker/push-worker.js`, create a KV namespace (any name, e.g. `push-storage`) and bind it to the worker as `PUSH`, add the cron trigger `0 * * * *`, deploy. The worker creates its VAPID keys itself on the first call and stores them in KV under `vapid`; if they are ever lost, the app notices and subscribes again with the new key. `index.html` already allows `https://push-worker.maximilian-stapper.workers.dev` in `connect-src`; `OK_ORIGINS` in the worker must contain the Pages origin.
- **Privacy:** stored per device are only the push address, the settings and subject, due date and text of open homework (no names, no login data). Entries expire after 60 days without contact; *Ausschalten* (and *Alle Untis-Daten löschen*) deletes them right away. The worker only sends to known push services.

## Privacy and backups

- All data stays local in your browser. There is no server, login, or data transfer.
- Browsers may delete local data; Safari, for example, may do so after a long period of inactivity. Save a **backup file** regularly from the menu (⋯).
- In a new browser, you can load the backup file when you first open the site and skip the setup.
- Mobile tip: Add the site to your Home Screen.

## Tested

The calculation logic was tested against the four sample academic pathways in the NRW Ministry of Education’s information sheet on calculating the overall qualification (Block I matches in all four cases; the sample data is in `tests/merkblatt.js`), against a brute-force search for random students, and in the browser.

## Limitations

- Calculated course grades are provisional only. The grade assigned by the teacher is binding.
- The *Advanced Class* is treated like a Projektkurs (one grade, counts as two courses, optional). Its rules are specific to the school and are not in the APO-GOSt; change the weight in `SPW` in `constants.js` if it works differently. Both take place in Q1. Older saved data with a separate *Facharbeit* grade is cleaned up automatically, because the Facharbeit only replaces a Klausur.
- The per-subject course limits other than the Literature limit (§ 28 (7), (8)) cannot be reached with four semesters and are not checked. Sport has no upper limit (§ 28 (8)). Vertiefungskurse, instrumental/vocal practice courses, the *besondere Lernleistung* and Philosophy as a replacement for Religion are not supported.
- The calculator is based on the current APO-GOSt rules (Abitur 2028). The revised rules taking effect from the introductory phase in 2027/28 have not been implemented.
- No guarantee is given. The school and the NRW Ministry of Education and Cultural Affairs are the authoritative sources.

## Publishing (GitHub Pages)

Upload the whole project (`index.html` plus all `.js` and `.css` files, the icon, `manifest.webmanifest`, `sw.js`, `mdb-reader.js` and the `worker` folder) to a repository. Under *Settings → Pages*, select the `main` branch and the `/ (root)` folder.
