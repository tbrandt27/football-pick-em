# Code review & upgrade notes

Branch: `chore/astro-upgrade-tooling` · Reviewed at `801311e` · 2026-09-05

Scope: full repo (~31k lines across `server/`, `src/`, `scripts/`, `infrastructure/`).
Sections marked **[done]** were changed on this branch. Everything else is a
recommendation with the evidence behind it.

---

## 1. Critical security findings

### 1.1 Every authenticated user was an admin in production **[done]**

The highest-severity finding in the repo.

`DynamoDBUserService` persists the admin flag as a **string**:

```js
// server/services/database/dynamodb/DynamoDBUserService.js:144
is_admin: isAdmin ? 'true' : 'false',
```

`requireAdmin` then tested it for truthiness:

```js
// server/middleware/auth.js (before)
if (!req.user || !req.user.is_admin) { return res.status(403)... }
```

`!"false"` is `false`, so the guard passed for every non-admin. Because
`apprunner.yaml` sets `DATABASE_TYPE: auto`, which resolves to DynamoDB in
production, **this was live in production and not reproducible locally on
SQLite** (which stores `0`/`1`).

Blast radius: all 40+ `requireAdmin` routes in `server/routes/admin.js`,
plus `requireGameOwner`'s admin override, plus `users.js` admin-status
changes. Any logged-in player could delete seasons, reset other users'
passwords, or promote themselves.

Fix: added `server/utils/coerce.js#toBoolean`, applied it in
`requireAdmin`, `requireGameOwner`, and once at the point `req.user` is
built so downstream handlers see real booleans. The same
`Boolean(user.is_admin)` bug in six spots in `server/routes/auth.js`
(login / `/me` / `/update` responses) was leaking admin UI to the client
and is fixed too.

`test/server/auth.middleware.test.js` and `test/server/coerce.test.js`
now pin this behaviour across both providers' encodings.

> `is_admin_invitation` is stored as a real boolean, so the invitation
> flow was not affected. Verified, not assumed.

### 1.2 Production secrets committed to the repo **[done]**

`apprunner.yaml` carried literal values in version control:

```yaml
- name: JWT_SECRET
  value: "your-super-secret-jwt-key-change-this-in-production"
- name: ADMIN_PASSWORD
  value: "admin123"
```

Also `SETTINGS_ENCRYPTION_KEY` and `ADMIN_EMAIL`. Anyone with repo read
access could forge a valid admin JWT.

Fix: replaced with commented ARN placeholders plus a note that
`configService` already resolves `arn:aws:secretsmanager:` values at
runtime.

**Action required from you — the code change is not sufficient:**

1. **Rotate all four values now.** They are in git history (introduced
   at `1e3d1a0`) and scrubbing the working tree does not remove them.
2. Set them as App Runner service-level secrets or Secrets Manager ARNs.
3. Consider `git filter-repo` to purge history, or treat the old values
   as permanently burned.

### 1.3 Hardcoded emergency JWT secret **[done]**

`configService`'s degraded-mode path installed a *literal* fallback:

```js
// before
this.cache.set('JWT_SECRET', process.env.JWT_SECRET || 'emergency-fallback-jwt-secret-change-immediately');
```

So any production boot where secret resolution failed silently switched
to a secret published in this repo — a remote admin-forgery primitive
triggered by a transient AWS error.

Fix: degraded mode now generates `randomBytes(48)` per process. The
intent of degraded mode (don't crash-loop; keep health checks answering)
is preserved, but it now fails *safe*: existing sessions stop verifying
and nobody can mint new ones. The `admin123` degraded-mode admin
password fallback was removed entirely.

### 1.4 Secret values written to CloudWatch **[done]**

```js
// server/services/configService.js (before)
console.log(`🔍 ${key}: Resolved value preview: "${secretValue.substring(0, 100)}..."`);
```

`JWT_SECRET` is shorter than 100 characters, so this logged it in full on
every boot. `server/services/secretsManager.js` did the same twice more
(`Raw secret value:` on parse failure, and a 50-char prefix on every
cache write).

Fix: all three now log type and length only. Full ARN logging on every
boot was also dropped.

### 1.5 Arbitrary file read via the logo route **[done]**

```js
// server/index.js (before)
app.get("/logos/:filename", (req, res) => {
  const { filename } = req.params;
  ... join(process.cwd(), "public/logos", filename) ... res.sendFile(logoPath)
```

Express percent-decodes route params, so `GET /logos/..%2f..%2fpackage.json`
arrived as `filename = "../../package.json"`. `join()` normalises the
`..` away, leaving a clean absolute path that `existsSync` accepts and
`sendFile` serves. Unauthenticated arbitrary file read, bounded only by
the 12 candidate base directories.

Fix: filename is validated against `/^[A-Za-z0-9._-]+$/` before touching
the filesystem. Verified against a running server:

```
GET /logos/..%2f..%2fpackage.json  ->  400 {"error":"Invalid logo filename"}
GET /logos/NFL.svg                 ->  200
```

### 1.6 Still open — recommended, not changed

| Finding | Where | Why it matters |
|---|---|---|
| **No rate limiting anywhere** | `server/routes/auth.js` | `/login`, `/register`, `/forgot-password` accept unlimited attempts. bcrypt cost 12 also makes `/login` a cheap CPU-exhaustion vector. Add `express-rate-limit` — strict on auth routes, loose globally. |
| **Password reset is a stub** | `auth.js:335` | `// TODO: Send reset email` — the route logs the reset token to stdout and returns success. Users cannot reset passwords, and the token sits in CloudWatch. `emailService` already exists; wire it up. |
| **JWT in `localStorage`** | `src/stores/auth.ts`, `src/utils/api.ts` | Any XSS yields a 7-day admin token. `httpOnly; Secure; SameSite=Lax` cookies fix this *and* unblock the SSR work in §4.1. |
| **No request validation** | all routes | No zod/joi/express-validator. Bodies are destructured and trusted. Astro 7 ships zod v4 as a transitive dep already. |
| **Cross-player pick disclosure** | `picks.js:9-29` | `GET /picks?gameId=X&userId=Y` lets any co-participant read another player's picks *before kickoff*. Competitive-integrity hole in a pick'em pool. Gate on game start time. |
| **Timing-unsafe token compare** | `middleware/healthAuth.js:23` | `healthToken === process.env.HEALTH_CHECK_TOKEN`. Use `crypto.timingSafeEqual`. |
| **`update-scores-on-demand` lacks `requireAdmin`** | `admin.js:1420` | Any authenticated user can trigger ESPN sync. May be deliberate; if so, rate-limit it. |
| **Dead branch in `healthAuth`** | `healthAuth.js:10` | `req.path === '/health'` never matches inside a router mounted at `/api/health` — `req.path` is `/detailed` etc. Harmless today because `health.js:13` handles it, but misleading. |

---

## 2. Correctness bugs found

### 2.1 DynamoDB scans are unpaginated — silent data loss

**This will corrupt standings mid-season.** Highest-priority remaining bug.

`_dynamoScan` issues exactly one `ScanCommand` and returns `result.Items`:

```js
// server/providers/DynamoDBProvider.js
const command = new ScanCommand(scanParams);
const result = await this.docClient.send(command);
// ... no LastEvaluatedKey loop
```

DynamoDB caps a Scan response at 1 MB **before** `FilterExpression` is
applied. Past that, results are truncated with no error. There are
**77 scan call sites**. The dangerous ones:

- `DynamoDBGameService.js:264` — `_dynamoScan('picks', { game_id })` for standings
- `DynamoDBSeasonService.js:248,317` — `_dynamoScan('football_games', { season_id })`
- `DynamoDBUserService.js:18,392,435` — full `users` scans

`picks` grows as players × games × weeks. Once the table crosses 1 MB,
leaderboards quietly drop picks. Fix: wrap `_dynamoScan` in a
`LastEvaluatedKey` loop (and log when pagination actually engages, so you
can see which call sites need a GSI).

### 2.2 Scans on hot paths where GSIs already exist

`infrastructure/dynamodb-tables.yml` defines `email-index`,
`game_id-index`, `season_id-index`, `is_admin-index` and more. The
provider has `_dynamoQueryGSI` and uses it in a few places — but
`getUserByEmail` (called on **every login**) still does
`_dynamoScan('users', { email })`. Route the hot paths through the
existing indexes; the cost and latency win is large and needs no infra
change.

Related: `is_admin-index` is queried with the string `'true'`
(`DynamoDBUserService.js:374`), which matches how the value is stored —
correct, but it's the same string-boolean encoding behind §1.1. Consider
migrating the attribute to a native boolean and updating the GSI.

### 2.3 `getGameBySlug` reads the entire games table

```js
// server/services/database/sqlite/SQLiteGameService.js:51
const game = games.find((g) => createGameSlug(g.game_name) === gameSlug);
```

Every game page view loads all games and slugifies each one in JS. The
DynamoDB path scans. Store the slug as a column/attribute at write time
and look it up directly.

### 2.4 Four latent `ReferenceError`s — caught by the new linter **[done]**

These are exactly what the linting task was worth:

| File | Bug |
|---|---|
| `server/utils/seedTeams.js:87,177` | `` `with logo ${logoFilename}` `` — no such variable. Throws on the **success** path of team seeding. Variable in scope is `logoPath`. |
| `server/routes/admin.js:1602` | `crypto.createHash('md5').update(ENCRYPTION_KEY)` — bare identifier; every sibling method uses `getEncryptionKey()`. Legacy settings-decryption fallback #3 always threw. |
| `scripts/test-dynamodb-optimizations.js:172` | `totalDuration` declared inside an `if` block, read from the `return` outside it. |

All fixed.

### 2.5 `/api/teams/records` is unreachable (route shadowing)

`server/routes/teams.js` registers `/:teamId` at line 45 and `/records`
at line 359. Express matches in registration order, so `/records` is
swallowed by `:teamId` and returns `404 {"error":"Team not found"}`.

Currently latent: `api.getTeamRecords()` (`src/utils/api.ts:163`) is
defined but never called. It breaks the moment someone wires it up. Move
literal routes above parameterised ones.

### 2.6 Error middleware was registered too early **[done]**

`server/index.js` mounted the 500 handler *above* `app.get("*")`. Express
only routes to an error handler registered **after** the middleware that
threw, so errors from the API routes and the Astro SSR handler fell
through to Express's default handler instead. Moved below the catch-all,
with a `res.headersSent` guard.

### 2.7 Timezone handling is inconsistent

```js
// server/services/scheduler.js:87
const easternTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
```

Re-parsing a localised string is implementation-defined. It happens to
work for extracting an hour on a UTC host, but `isGameDay()`
(`scheduler.js:25`) uses `today.getDay()` in **server-local** time while
`isActiveGameTime()` uses ET. On a UTC host, a Sunday 8pm ET game reads
as Monday. Use `Intl.DateTimeFormat` with an explicit `timeZone` and
`hour12: false` for both.

### 2.8 Interval stored in state, not a ref

```js
// src/components/WeeklyGameView.tsx:42
const [autoRefreshInterval, setAutoRefreshInterval] = useState<NodeJS.Timeout | null>(null);
```

The effect reads `autoRefreshInterval` but omits it from its dependency
array, so the cleanup closure captures a stale handle and intervals can
leak across re-renders. Use `useRef`. This is one of the 42
`react-hooks/*` warnings the new lint config surfaces.

### 2.9 `type` vs `game_type` duplication

Every game service returns both (`SQLiteGameService`: `g.type as game_type`;
`DynamoDBGameService`: an explicit mapping), and consumers check both:

```js
// server/routes/picks.js:91
if (game && (game.type === 'survivor' || game.game_type === 'survivor'))
```

This was producing the only two pre-existing `astro check` errors. I
added `game_type` to the `PickemGame` type so the codebase type-checks
clean **[done]**, but the real fix is to pick one field and delete the
other.

---

## 3. Astro 5.12.3 → 7.3.1 upgrade **[done]**

Two major versions. The build, type-check, and a boot smoke test all
pass on this branch.

### What was actually breaking here

Most of the v6/v7 breaking-change list doesn't touch this repo — there
are no content collections, no `Astro.glob()`, no markdown pipeline, no
`<ViewTransitions />`, no i18n, no Astro DB. The ones that mattered:

| Change | Impact |
|---|---|
| **Node ≥ 22.12 required** (v6) | The blocker. Repo was on Node 18 in `package.json` engines, `Dockerfile`, and `apprunner.yaml`. Node 18 is also EOL. |
| **Vite 6 → 7 → 8** | Transitively forced the dev-proxy config through two Vite majors. Also why Vitest couldn't be installed *before* the upgrade — Vitest 5 needs Vite ≥ 6.4 and Astro 5 pinned 6.3.5. |
| **Rust compiler mandatory** (v7) | Unclosed tags and invalid HTML nesting are now errors, not silently corrected. This repo's `.astro` files compiled clean. |
| **`compressHTML` default → `'jsx'`** (v7) | Whitespace is stripped with JSX rules. Worth a visual pass on text-heavy views. |
| **Adapter API rewrite** (v6) | `NodeApp`, `createExports()`, `app.setManifestData()` all removed. **`mode: "middleware"` and the exported `handler` survive** — verified `dist/server/entry.mjs` still exports `handler`, so the Express integration in `server/index.js` needed no change. |

### Changes made

- `astro` 5.12.3 → **7.3.1**, `@astrojs/node` 9 → **11.1.5**,
  `@astrojs/react` 4 → **6.0.5**
- `tailwindcss` / `@tailwindcss/vite` → **4.3.3**, `react`/`react-dom` → **19.2.8**
- `engines.node` → `>=22.12.0`; added `.nvmrc` (`22.12.0`)
- `Dockerfile` → **multi-stage on `node:22-alpine`**. The old single-stage
  build ran `npm ci --only=production` and *then* `npm run build`, which
  only worked because every build tool was mis-declared as a runtime
  dependency. Build tooling now lives in `devDependencies`, the build
  happens in stage 1, and `npm prune --omit=dev` produces the runtime
  `node_modules`. Runs as non-root `node`.
- `apprunner.yaml` runtime → `nodejs22`
- Moved `@astrojs/check`, `typescript`, `@types/react*`, `concurrently`
  out of `dependencies`
- Deleted `Dockerfile.backup` (the `docker:build` script was pointing at
  it instead of the real `Dockerfile`)

### TypeScript is deliberately pinned to 6.x, not 7.x

`typescript@7.0.2` is published, but:

- `@astrojs/check@0.9.10` peers `typescript: ^5.0.0 || ^6.0.0`
- `typescript-eslint@8.69.0` peers `typescript: >=4.8.4 <6.1.0`

So the ceiling is **TypeScript 6.0.3**. Revisit when those two publish
TS 7 support.

### Things to check before you deploy

1. **App Runner `nodejs22` runtime availability** in `us-east-1` — I set
   it in `apprunner.yaml` but could not verify it against your account.
   You have a working Dockerfile; the container path is lower-risk.
2. **`compressHTML: 'jsx'`** — quick visual diff on the scores and
   weekly views.
3. **Astro 7 enables filesystem-backed sessions** by default. The build
   logs `[@astrojs/node] Enabling sessions with filesystem storage`.
   Harmless here (nothing uses `Astro.session`), but on App Runner the
   filesystem is ephemeral. If you ever adopt sessions, configure
   `sessionDrivers` explicitly.
4. **Local Node is v25.9.0**, which is neither of the current LTS lines.
   `eslint-plugin-astro` warns `EBADENGINE` against it. Switch to 22 or
   24 LTS (`nvm use` now reads `.nvmrc`).

### Deferred: Express 4 → 5

Not bundled with this change — it's an independent migration with its own
breaking changes, and stacking it on the Astro jump would make a
regression impossible to attribute. When you do it, the known work is:

- `app.get("*")` → `app.get("/*splat")` (`server/index.js`)
- `req.params` no longer partially decoded — re-check the `/logos` guard
- `res.status(500).json()` after `headersSent` now throws

Express 4.21.2 is in maintenance-only, so this shouldn't wait long.

---

## 4. Architecture

### 4.1 Astro's SSR is currently buying nothing

Every page is a thin shell around one `client:load` island:

```astro
---
import AdminDashboard from '../../components/AdminDashboard.tsx';
---
<Layout title="Admin Dashboard - NFL Pickem">
	<AdminDashboard client:load />
</Layout>
```

All 15 pages follow this shape. Consequences:

- Zero server-rendered content. The SSR response is an empty shell; the
  user waits for 179 KB of React plus a per-route chunk (`GameViewRouter`
  is 49 KB) before seeing anything.
- **16 of 20 components call `initAuth()` themselves**, each firing its
  own `/auth/me` round-trip and its own `window.location.href = '/'`
  redirect. That's the flicker-then-redirect behaviour.
- No islands, no `client:visible` / `client:idle`, no partial hydration —
  the three things Astro is for.

Root cause: the JWT lives in `localStorage`, so the server cannot identify
the user and *has* to defer everything to the client.

Recommended sequence, in dependency order:

1. Move the JWT to an `httpOnly` cookie (also fixes §1.6's XSS exposure).
2. Add `src/middleware.ts` to resolve the user once per request and put it
   on `Astro.locals`.
3. Redirect unauthenticated users server-side — deleting 16 duplicated
   client-side auth gates.
4. Fetch page data in Astro frontmatter, pass it as props, and downgrade
   directives to `client:idle` / `client:visible` where the component
   isn't immediately interactive.

If you'd rather not invest there, the honest alternative is
`output: 'static'` for the shell plus a client-side router — cheaper to
run and no worse than today. What isn't worth keeping is paying for Node
SSR and getting none of its benefits.

### 4.2 Duplicated app chrome

`Dashboard`, `ScoresView`, `SurvivorGameView`, `GameManagement`, and
`WeeklyGameView` each carry their own copy of:

- the `hidden md:flex` desktop header / `md:hidden` mobile header pair
- the `mobileMenuOpen` state and hamburger toggle (20 references)
- `getHeaderStyle()` — the identical team-colour gradient function
- the auth gate and the loading spinner (`animate-spin` appears 32 times
  across 20 files)

An `<AppShell>` + `<PageHeader>` + `<Spinner>` extraction removes most of
it. This is the single largest source of accidental divergence in the
frontend — the last three commits on `main` were all mobile-view fixes,
which is what this duplication produces.

### 4.3 Logging

735 `console.*` calls in `server/` and `scripts/`. A perfectly good
level-aware logger exists at `server/utils/logger.js` — and **3 files
use it**. Consequences: no way to raise the level in production, high
CloudWatch cost, and it's how §1.4's secret leak went unnoticed.

Migrate `server/` to `logger`, and consider structured JSON output so
CloudWatch Insights can query it. The emoji prefixes are fine in dev but
add bytes to every production log line.

### 4.4 Dead and duplicated code

| Path | Lines | Status |
|---|---|---|
| `server/routes/games.js` | 420 | Superseded by `games_refactored.js`, which is what `server/index.js` mounts. Nothing imports it. |
| `server/routes/databaseAdmin.js` | ~140 | Import commented out at `server/index.js:20`. |
| `src/components/DatabaseSwitcher.tsx` | 387 | Both call sites are commented-out JSX ("Disabled due to flickering issues"). |

I left all three in place — the comments read as parked work rather than
abandoned code, so deleting them is your call. If `DatabaseSwitcher` is
genuinely parked, `databaseAdmin.js` should stay with it.

Also: `games_refactored.js` should be renamed to `games.js` once the old
file goes. A filename that describes its refactor history rather than its
contents ages badly.

Removed on this branch **[done]**: `Dockerfile.backup`, and the tracked
`database_current.sqlite` symlink (it pointed at a gitignored file, so it
was dangling on every fresh clone).

### 4.5 `tailwind.config.js` is inert

Tailwind v4 is CSS-first. `src/styles/global.css` is just
`@import "tailwindcss";` with no `@config` directive, so
`tailwind.config.js` is **never read**. Delete it and move any theme
work into `@theme` in `global.css` — see §5.1.

---

## 5. Web design recommendations

### 5.1 There is no design system

Raw palette utilities are scattered across the components — 12 distinct
hues, with `text-gray-600` (110×), `text-gray-500` (84×), and
`bg-blue-600` (73×) leading. Nothing is named, so "the primary button
colour" is `bg-blue-600` in some files and `bg-blue-500` in others, and
`bg-purple-600` (17×) appears with no evident rule.

Define semantic tokens in `global.css` and use those instead:

```css
@import "tailwindcss";

@theme {
  --color-brand:        oklch(0.48 0.18 258);
  --color-brand-hover:  oklch(0.42 0.18 258);
  --color-surface:      oklch(1    0    0);
  --color-surface-muted:oklch(0.97 0.005 258);
  --color-ink:          oklch(0.24 0.02 258);
  --color-ink-muted:    oklch(0.52 0.02 258);
  --color-win:          oklch(0.62 0.16 148);
  --color-loss:         oklch(0.58 0.20  25);
  --color-pending:      oklch(0.75 0.14  85);
}
```

`bg-brand` / `text-ink-muted` / `text-win` then read as intent, and a
palette change becomes one edit. This matters more than usual here
because win/loss/pending state is the core visual language of the app and
it's currently expressed with ad-hoc green/red/yellow pairs.

### 5.2 Team-colour headers fail contrast

```jsx
// src/components/ScoresView.tsx:343
<header className="bg-blue-600 text-white shadow-lg" style={getHeaderStyle()}>
```

`getHeaderStyle()` builds a gradient from arbitrary team colours while
the text colour is hardcoded `text-white`. For teams with light
primaries — Packers/Steelers/Vikings gold `#FFB612`, Rams gold — white
on gold lands near **1.7:1**, far below the WCAG AA 4.5:1 minimum. This
affects the five components that duplicate `getHeaderStyle()`.

Fix: compute relative luminance from the team colour and pick
black or white:

```ts
// Returns the accessible foreground for a given background.
function readableInk(hex: string): "#000" | "#fff" {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.45 ? "#000" : "#fff";
}
```

Put it next to the extracted `<PageHeader>` from §4.2 so it's fixed once.

### 5.3 Accessibility gaps

Images are in good shape — all 25 `<img>` tags have real `alt` text, with
sensible `onError` fallbacks. The gaps are elsewhere:

- **23 unassociated labels** (`jsx-a11y/label-has-associated-control`).
  Screen readers can't announce what these inputs are for. Add
  `htmlFor`/`id` pairs.
- **10 keyboard-inaccessible handlers** — `onClick` on `<div>`/`<span>`
  with no `onKeyDown`, no `role`, no `tabIndex`. Those rows/cards are
  unreachable without a mouse.
- **Zero `focus-visible:` styles.** 38 `focus:` utilities, all of which
  also fire on mouse click. Switch to `focus-visible:` for a clean
  keyboard-only ring.
- **No skip link and no landmarks.** `Layout.astro` renders a bare
  `<slot />` into `<body>`. Add a skip-to-content link and make sure each
  page has one `<main>`.
- **36 sub-44px touch targets** (`py-1`/`py-1.5` buttons). Below the
  iOS/Android minimum, on an app whose primary use is picking games on a
  phone on Sunday morning.
- **No `aria-live` region** for score updates. `ScoreUpdateBadge` changes
  silently; a polite live region would announce refreshes.
- **`prefers-reduced-motion` is unhandled** while `animate-spin` appears
  32 times.

### 5.4 Mobile

Recent commit history is three consecutive mobile-view fixes, which
tracks with what's in the code: 47 responsive-breakpoint uses across 20
components, almost all of them `hidden md:*` / `md:hidden` pairs that
render **two separate copies** of the same header. Every change has to be
made twice — and the commit log shows that's exactly what's been
happening.

Concrete steps:

1. Extract `<PageHeader>` once (§4.2) so there is one implementation with
   internal responsive behaviour, not two parallel trees.
2. Replace the four `<table>` elements (`UsersManager` ×2,
   `GamesManager`, `ScoresView`, `SeasonsManager`) with a
   card-list-below-`md` pattern. Tables don't degrade on a 375px screen.
3. Move the primary pick action within thumb reach — a sticky bottom
   action bar on the weekly view rather than a submit button below a long
   scroll.
4. Raise touch targets to 44px minimum (§5.3).

### 5.5 Smaller wins

- `Layout.astro` sets `font-family: system-ui, sans-serif` in a
  `<style is:global>` block while Tailwind also owns typography. Pick
  one — put the font stack in `@theme` as `--font-sans`.
- No `<meta name="theme-color">`, no web manifest. Favicons are there;
  this is nearly a decent installable PWA already.
- `<meta name="description">` is identical on all 15 pages and lives in
  `Layout.astro`. Make it a prop.
- No dark mode. With semantic tokens from §5.1 it's a
  `prefers-color-scheme` block, not a rewrite.
- No empty states. Several views render a bare spinner and then nothing
  when a list is empty, with no explanation or next action.
- `transition-colors` (164×) with no consistent duration. Fold a
  `--default-transition-duration` into `@theme`.

---

## 6. Linting and testing **[done]**

### Linting

ESLint 10 flat config (`eslint.config.js`) with per-area rules:

- `server/**`, `scripts/**` — Node globals, ESM
- `src/**/*.{ts,tsx}` — `typescript-eslint`, `jsx-a11y`, `react-hooks` v7
- `*.astro` — `eslint-plugin-astro`
- `test/**` — TS parser plus relaxed rules

Prettier is wired in via `eslint-config-prettier` (last in the chain, so
formatting rules lose to Prettier) and `prettier-plugin-astro`.

One npm `override` was needed: `eslint-plugin-jsx-a11y@6.10.2` caps its
`eslint` peer at 9, but `eslint-plugin-astro@3` requires ≥10. The plugin
is rules-only and works fine under 10; the override is documented in
`package.json` and keeps `npm ci` resolving in CI and Docker.

**Baseline: 0 errors, 533 warnings.**

I fixed every error (§2.4, §1.5, plus the stray empty template literal at
`DynamoDBProvider.js:2`, `hasOwnProperty` → `Object.hasOwn`, and 15 empty
`catch (e) {}` blocks in `SQLiteProvider.js` that were swallowing genuine
migration failures alongside the expected duplicate-column error).

The 533 warnings are a deliberate, visible backlog rather than a silenced
one. Rules demoted to `warn` are annotated in `eslint.config.js` with
their count and the reason. Promote each back to `error` as its category
reaches zero:

| Count | Rule | Notes |
|---|---|---|
| 219 | `no-unused-vars` (both plugins) | Mostly unused imports and dead locals. Largely auto-fixable. |
| 145 | `react-hooks/error-boundaries` | New in react-hooks v7; fires on JSX inside `try`/`catch`. Mostly noise here. |
| 67 | `no-return-await` | Cosmetic. |
| 42 | `react-hooks/immutability`, `set-state-in-effect`, `exhaustive-deps` | **Read these.** They point at the render loops and leaked intervals in §2.8. |
| 33 | `jsx-a11y/*` | §5.3. |
| 15 | `@typescript-eslint/no-explicit-any` | 9 of 15 are in `WeeklyGameView.tsx`. |

Start with `npm run lint:fix` — it clears a large share of the unused-var
warnings mechanically.

### Testing

Vitest 5 with two projects (`vitest.config.ts`): a `node` pool for
`server/` and a `jsdom` pool for the React/browser code, so backend specs
don't pay for jsdom and `server/` never sees browser globals. V8
coverage is configured.

**63 tests across 4 files, all passing.** These target the code the audit
flagged as risky, not easy wins:

- `test/server/coerce.test.js` (9) — the `toBoolean` helper from §1.1,
  including an explicit assertion that `Boolean("false") === true` (the
  bug) while `toBoolean("false") === false` (the fix).
- `test/server/auth.middleware.test.js` (20) — token rejection paths
  (missing, malformed, wrong secret, expired, deleted user), the
  `userId`→`email` fallback, `requireAdmin` across all four provider
  encodings, and `requireGameOwner` including the admin override and the
  fail-closed-on-DB-error path. Contains a named regression guard for the
  §1.1 privilege escalation.
- `test/server/slug.test.js` (25) — 11 slug cases, plus a
  client/server-equivalence check (they're separate modules; if they ever
  diverge, every game link 404s), idempotency, and a test documenting the
  known punctuation-collision behaviour.
- `test/client/api.test.ts` (9) — `ApiClient` token persistence and
  header injection, the `{success, data}` / `{success, error}` response
  contract, status-code fallback, network-failure handling, and URL/query
  construction.

Note: two of the auth tests originally asserted the *buggy* behaviour
(that's how §1.1 was confirmed). They were rewritten to assert the fix
once it landed.

### CI

`.github/workflows/ci.yml` — there was no CI at all. Runs lint →
type-check → test+coverage → build on `main`/`develop` and PRs, with a
separate non-blocking `npm audit --omit=dev` job. Node comes from
`.nvmrc` so CI, Docker, and local stay in sync.

New scripts: `check`, `lint`, `lint:fix`, `format`, `format:check`,
`test`, `test:watch`, `test:coverage`, and `verify` (lint + check + test).

### Suggested next tests

Ordered by risk covered per unit of effort:

1. `pickCalculator.calculatePicks` — winner determination, and the tie
   case (currently both picks are marked **incorrect**; most pools treat
   a tie as a push — worth confirming that's intended).
2. `POST /api/picks` — the kickoff cutoff and the survivor
   already-picked-that-team rule. Highest-value business logic in the app
   and completely untested.
3. `_dynamoScan` pagination, once §2.1 is fixed — a >1 MB fixture is the
   only way to keep that regression from returning.
4. `scheduler.isGameDay` / `isActiveGameTime` with a frozen clock across
   timezone boundaries (§2.7).
5. Supertest coverage of the `requireAdmin` routes, so §1.1 can't recur
   at the HTTP layer.

---

## 7. Dependency health

`npm audit` reports **67 vulnerabilities (3 critical, 28 high)** — and
that's *after* the Astro upgrade. Notable:

- **`jws` — "Improperly Verifies HMAC Signature"** (high). Reached via
  `jsonwebtoken`. Directly relevant to auth; triage first.
- `tar` — arbitrary file write via hardlink traversal (critical)
- `shell-quote`, `fast-xml-parser` (critical)
- `path-to-regexp` ReDoS, `body-parser` (high) — both cleared by the
  Express 5 migration
- `axios` DoS via missing size check (high) — used by `espnApi`

Most are transitive dev-tool dependencies, but the `jws`, `axios`, and
Express-family ones sit in the request path. Recommend `npm audit fix`
first, then triage the remainder against the CI audit job.

---

## Summary of changes on this branch

**Security:** privilege escalation via string booleans · committed
production secrets scrubbed · hardcoded emergency JWT secret replaced
with per-process random · secret values no longer logged (3 sites) ·
path traversal in `/logos`

**Correctness:** 4 `ReferenceError`s · error middleware ordering · 15
empty catch blocks now rethrow real failures · `Object.hasOwn` ·
stray empty template literal

**Upgrade:** Astro 5 → 7, Node 18 → 22, multi-stage Dockerfile,
dependency split corrected, TypeScript pinned at the 6.x ceiling

**Tooling:** ESLint 10 flat config (0 errors) · Prettier · Vitest with
63 passing tests · GitHub Actions CI · `.nvmrc`

**Cleanup:** `createGameSlug` deduplicated from 4 copies to 2 tested
modules · `Dockerfile.backup` and a dangling tracked symlink removed

Verified: `npm run build`, `npx astro check` (0 errors), `npx vitest run`
(63/63), `npx eslint .` (0 errors), and a live boot test confirming SSR
serves and the traversal fix holds.

**Not verified by me:** App Runner `nodejs22` runtime availability in
your account, and behaviour against real DynamoDB (the §1.1 fix is
covered by unit tests against both encodings, but not against a live
table).
