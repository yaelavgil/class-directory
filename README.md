# Class Directory · דפי קשר

Contact pages for school classes: kids, parents, phones (call / WhatsApp), addresses (Google Maps), birthdays.
Live: https://yaelavgil.github.io/class-directory/

- **No data in this repo.** Everything lives in Firestore (`class-directory-20a3b`, me-west1) behind `firestore.rules`.
- Sign-in: Google or email link. Admins approve every member; parents are linked to their kids and edit only them.
- One folder per directory (`d3-2026/`) so each class has its own link, tab title, favicon and WhatsApp preview.
  Add the directory to `dirs.json`, run `python3 build.py <id>`, commit, push.
- `?demo` on any page runs an offline demo with a persona switcher, on `app/demo-seed.json` (fictional).

```
app/            shared app (app.js, api-firebase.js, api-mock.js, photo.js, text.js, slots.js, style.css, config.js)
app/demo-seed.json  fictional roster the published ?demo runs on
templates/      page / og image / icon templates used by build.py
<dir-id>/       generated per-directory page + og.jpg + icons
firestore.rules security rules (paste into Firebase console → Firestore → Rules); not in the repo
```

## Kid document

`first, last, bookName, gender, birth, address, kidPhone, parents[{role,name,phone}], parentEmails[],
photo, babyPhoto, grade1Photo, order`

- `bookName` is the spelling to print, offered pre-filled from the name for the parent to confirm.
- `gender` is `f` / `m` / `x`, because Hebrew phrasing depends on it.
- `photo` is the 480px card crop; `babyPhoto` and `grade1Photo` are 144px thumbnails only.
  Each photo's 1200px original and framing live in their own document — `dirs/{d}/photos/{kidId}`
  for the card photo, `dirs/{d}/kids/{kidId}/assets/{slot}` for the rest — because a Firestore
  document caps at 1MB and lists would get heavy. Slots are declared in `app/slots.js`;
  the rules accept any slot id, so a new one needs no rules deploy.
- Fields a directory can switch off live in `FIELD_DEFS` (app.js) → `dir.settings.fields`.
- Any input marked `data-maxlen="N"` gets a live counter and print-safe filtering (`app/text.js`):
  emoji, curly quotes, pipes and bidi controls are stripped before the value is ever stored.
