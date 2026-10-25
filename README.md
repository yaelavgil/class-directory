# Class Directory · דפי קשר

Contact pages for school classes: kids, parents, phones (call / WhatsApp), addresses (Google Maps), birthdays.
Live: https://yaelavgil.github.io/class-directory/

- **No data in this repo.** Everything lives in Firestore (`class-directory-20a3b`, me-west1) behind `firestore.rules`.
- Sign-in: Google or email link. Admins approve every member; parents are linked to their kids and edit only them.
- One folder per directory (`d3-2026/`) so each class has its own link, tab title, favicon and WhatsApp preview.
  Add the directory to `dirs.json`, run `python3 build.py <id>`, commit, push.
- `?demo` on any page runs an offline demo with a persona switcher.

```
app/            shared app (app.js, api-firebase.js, api-mock.js, photo.js, style.css, config.js)
templates/      page / og image / icon templates used by build.py
<dir-id>/       generated per-directory page + og.jpg + icons
firestore.rules security rules (paste into Firebase console → Firestore → Rules)
```
