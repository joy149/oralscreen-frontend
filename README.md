# OralScreen — Frontend (Patient Flow)

React + Vite PWA. Deployed separately from the Spring Boot backend (see
"Deployment" below) — the only coupling is CORS.

## What's built so far

The **patient path**: phone entry → symptom questionnaire → photo upload →
AI risk result. The doctor queue / review / pitch dashboard are not built
yet — planned next.

## Backend contract this assumes (confirm before running)

**`POST /api/patients`** must behave as find-or-create by `phoneNumber`:

- Body `{ phoneNumber }` only:
  - Patient exists → `200` with the `Patient` record.
  - Patient doesn't exist → `404` with a body like `{ "code": "PATIENT_NOT_FOUND" }`.
- Body `{ phoneNumber, name, age?, sex? }`:
  - Creates the patient → `201` with the `Patient` record.

If your backend ends up signaling "not found" a different way (a different
status code, a different body shape), update the check in
`src/screens/PhoneEntry.jsx` (`err.status === 404`) and the comment above
`findOrCreatePatient` in `src/api/client.js` to match.

Everything else follows `03_API_REFERENCE.md` as documented, including that
`POST /api/questionnaires/{id}/assess` runs the AI call synchronously and
returns the full result in one response (no polling needed).

## Known MVP gaps (intentional, documented here so they're not a surprise)

- **No image delete-after-upload endpoint.** A successfully uploaded photo
  can be hidden from the list in the UI, but isn't actually deleted from S3
  or the DB. Fine for pilot scale; revisit if it matters later.
- **Refreshing the result page loses the result.** The assessment result is
  passed via router state, not fetched by URL. There's no
  "get assessment by questionnaire id" endpoint yet — only by assessment id.
  Low priority for a single-sitting pilot flow, but worth a backend endpoint
  if patients are expected to revisit results later.
- **No global exception handler on the backend yet** (per your own
  `05_OPEN_DECISIONS_AND_ROADMAP.md`, item #6), so bad ids can 500 instead of
  404. The frontend's `ErrorState` component never surfaces raw error bodies
  to a patient regardless — it always shows plain language — but you'll want
  that handler before this is used by real patients, for cleaner logs if
  nothing else.

## Local development

```bash
npm install
cp .env.example .env   # then set VITE_API_BASE_URL to your backend
npm run dev            # http://localhost:5173
```

## Build

```bash
npm run build           # outputs to dist/
npm run preview         # serve the production build locally
```

## Deployment

This is a static site once built (`dist/`) — deploy it anywhere that serves
static files: Vercel, Netlify, S3 + CloudFront, Nginx, etc. It does not need
to run on the same server as Spring Boot.

Two things to configure wherever it's hosted:

1. **Environment variable** `VITE_API_BASE_URL` pointing at your deployed
   backend's URL (baked in at build time, since Vite env vars are
   compile-time, not runtime — rebuild if the backend URL changes).
2. **CORS** on the Spring Boot backend, allowing the frontend's origin. A
   minimal example:

   ```java
   @Configuration
   public class CorsConfig implements WebMvcConfigurer {
       @Override
       public void addCorsMappings(CorsRegistry registry) {
           registry.addMapping("/api/**")
               .allowedOrigins("http://localhost:5173", "https://your-frontend-domain.com")
               .allowedMethods("GET", "POST", "PUT", "DELETE")
               .allowedHeaders("*");
       }
   }
   ```

## Project structure

```
src/
├── api/client.js              Fetch/XHR wrapper for the backend API
├── context/PatientContext.jsx Patient session (phone-only, localStorage-persisted)
├── components/
│   shared/                    RiskBadge (tiered gauge), ImageUploadRow, Loading/ErrorState
│   layout/AppShell.jsx        Header, step indicator, footer
├── screens/
│   PhoneEntry.jsx             Phone number → find-or-create patient
│   QuestionnaireForm.jsx      Symptom questionnaire
│   PhotoUpload.jsx            Per-image upload with independent progress/retry/remove
│   AssessmentPending.jsx      Risk result display
└── styles/tokens.css          Design tokens (colors, type, spacing)
```

## Design notes

- Type is Figtree (display) + Noto Sans (body), loaded from Google Fonts via
  `<link rel="preconnect">` in `index.html`. They are deliberately **not**
  `@import`-ed from CSS, which would queue the font request behind the
  stylesheet parse and delay first paint on slow connections.
- Risk is shown as a verdict block followed by a position on a three-zone gauge
  (mild → moderate → high), since the classification is a real ordinal scale.
  The verdict renders first and unanimated — it's the one thing the patient
  opened the app for, so it must not sit below supporting text.
- Colors avoid literal traffic-light red/yellow/green, which reads as
  alarming for a health context — sage / amber / clay-red instead.
- Every risk tier has two tokens: a saturated **fill** (`--color-risk-*`) for
  gauges and dots, and a darkened **ink** (`--color-risk-*-ink`) for text. The
  fills do not meet WCAG contrast as type — the moderate fill measured 2.6:1 on
  its own background. Use the ink variant for anything readable.
- `--color-line` is a decorative divider only (1.3:1). Interactive boundaries
  such as form fields use `--color-line-input`, which meets the 3:1 non-text
  contrast requirement (WCAG 1.4.11).
- Symptom questions use a segmented Yes/No control rather than toggle switches.
  A switch implies a setting, and collapses "no" and "not answered" into one
  state — a distinction the reviewing dentist needs.
- Clinician and admin routes are lazy-loaded and excluded from the PWA
  precache, so the patient bundle doesn't carry chart.js and the doctor screens.

## Next up

Doctor queue, case review, and the leadership-pitch metrics dashboard —
not part of this build.
