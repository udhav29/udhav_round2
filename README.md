# ParkFlow

A working console for a multi-level city-centre parking garage: check a car in, find or check it out, and charge the right fee every time — with EV bays that stay reserved for EVs and spots that can never be double-booked.

Live pieces:
- **Landing page** — `/` — what the product is, for a visitor who isn't logged in.
- **Attendant console** — `/app` — login/register + the working dashboard (garage floor map, check-in, ticket search, checkout).
- **REST API** — `/api/*` — everything the console calls, listed below.

## Tech stack

- **Backend:** Node.js + Express
- **Database:** SQLite via `better-sqlite3` (a real, file-backed relational database — `db/parkflow.sqlite3` — with a proper schema, foreign keys, and indexes)
- **Auth:** JWT (`jsonwebtoken`) + password hashing (`bcryptjs`)
- **Frontend:** Vanilla HTML/CSS/JS single-page app served as static files by the same Express server (no build step, no framework — keeps "how do I run this" to one command)

## Setup & run

Requirements: Node.js 18+ (tested on Node 22).

```bash
git clone <this-repo-url>
cd parkflow
npm install
cp .env.example .env   # optional — sane defaults work without this
npm start
```

The server starts on **http://localhost:3000** (override with `PORT` in `.env`).

On first run, `db/db.js` automatically:
1. Creates `db/parkflow.sqlite3` and the schema (`users`, `spots`, `tickets`) if it doesn't exist.
2. Seeds the garage with 48 spots across 3 levels (6 compact, 8 standard, 2 EV per level) if the `spots` table is empty.

No separate seed step is required — just `npm start` and open the app.

To start fresh (wipe all data and re-seed spots), stop the server and delete the database file:

```bash
rm db/parkflow.sqlite3*
npm start
```

### Using the app

1. Open `http://localhost:3000/` for the landing page, or go straight to `http://localhost:3000/app`.
2. Click **Create an account** and register an attendant login (any username/password ≥ 6 characters).
3. From the dashboard you can:
   - Check a vehicle in (auto-assigns the nearest free spot of the matching type, or pick one manually).
   - Check "is an EV spot free right now?" instantly.
   - Watch the floor map update live (free = green, occupied = red, EV bays have a blue ring).
   - Search tickets by plate, filter by active/closed, sort any column, and page through results.
   - Check a vehicle out — the fee is computed automatically and the spot frees up.

## Twist features (added for this round)

- **Messy rate-card import (T4)** — `POST /api/rates/import` takes a raw, messy, free-text rate sheet (CSV rows, prose lines, mixed order, junk/comment lines all mixed together), pulls out a clean `{ firstHour, extraHour, dailyCap }` per spot type, and — only if all three types (compact/standard/ev) parse successfully — replaces the live rate card used by every checkout from then on. Unrecognized lines are reported back as `warnings` instead of breaking the import. Import it from the **Rate card** panel on the dashboard.
- **Nightly auto-close job (T2)** — `POST /api/clock` runs the "nightly job": any session still `active` with a check-in ≥ 24h ago is auto-closed, billed as of the moment the job runs, and its spot freed. No cron process needed for grading — this endpoint is that job, callable on demand. Trigger it from the **Nightly auto-close job** panel, or `curl -X POST /api/clock` directly.
- **Valet hand-off / transfer (T6)** — `POST /api/tickets/transfer/:id` moves an *open* session to a different plate. The spot and the original entry time carry over unchanged (only the plate changes), so the fee at checkout is unaffected by the hand-off. Use the **Transfer** button next to any active ticket.

## How billing works

Rates are tiered per vehicle/spot type (see `GET /api/rates` for the live values — these can change at runtime via rate-card import, see above):

| Type | First hour | Each extra hour | Daily cap |
|---|---|---|---|
| Compact | ₹20 | ₹10 | ₹120 |
| Standard | ₹30 | ₹15 | ₹150 |
| EV | ₹50 | ₹25 | ₹250 (covers charger use) |

- Part-hours always round **up** (61 minutes bills as 2 hours).
- A stay is billed as full 24-hour blocks at the daily cap, plus the tiered rate for whatever's left over (so a 26-hour EV stay is one ₹250 day-cap plus ₹75 for the remaining 2 hours = ₹325).
- The minimum billed stay is 1 hour.

## API endpoints

All endpoints except `/api/auth/register` and `/api/auth/login` require `Authorization: Bearer <token>`.

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Create an attendant account. Body: `{ username, password, full_name? }` |
| POST | `/api/auth/login` | Log in. Body: `{ username, password }`. Returns `{ token, user }` |
| GET | `/api/auth/me` | Current logged-in user |

### Spots
| Method | Path | Description |
|---|---|---|
| GET | `/api/spots` | List spots. Query: `search, type, status, page, limit, sortBy, order` |
| GET | `/api/spots/available?type=` | Free spots right now, optionally filtered by type (`compact`/`standard`/`ev`) |
| GET | `/api/spots/:id` | Single spot |

### Tickets
| Method | Path | Description |
|---|---|---|
| GET | `/api/tickets/rates` | The current rate card (kept for backward compatibility — same data as `GET /api/rates`) |
| POST | `/api/tickets/checkin` | Check a vehicle in. Body: `{ plate, vehicle_type, spot_id? }` — auto-assigns a spot if `spot_id` is omitted |
| POST | `/api/tickets/checkout/:id` | Check a vehicle out and compute the fee |
| POST | `/api/tickets/transfer/:id` | **(T6)** Valet hand-off — move an open session to a different plate. Body: `{ new_plate }`. Spot and entry time carry over |
| GET | `/api/tickets` | List/search tickets. Query: `search (plate), status, page, limit, sortBy, order` |
| GET | `/api/tickets/:id` | Single ticket |

### Rates
| Method | Path | Description |
|---|---|---|
| GET | `/api/rates` | The current (cleaned) rate card actually used for billing |
| POST | `/api/rates/import` | **(T4)** Import a messy rate card. Body: `{ raw: "<free-text rate sheet>" }`. Parses CSV-ish and prose lines, skips junk, and replaces the live rate card if all three spot types (compact/standard/ev) were found. Returns `{ rates, warnings }` |

### Clock
| Method | Path | Description |
|---|---|---|
| POST | `/api/clock` | **(T2)** Run the nightly job now — auto-closes and bills any session parked ≥ 24h |

## Project structure

```
parkflow/
├── server.js            # Express entrypoint
├── db/
│   ├── db.js             # schema + seed
│   └── parkflow.sqlite3  # created on first run (gitignored)
├── lib/
│   └── pricing.js        # fee calculation (tiers, caps, rounding) + messy rate-card parser
├── middleware/
│   └── auth.js           # JWT sign/verify
├── routes/
│   ├── auth.js
│   ├── spots.js
│   ├── tickets.js        # checkin/checkout/transfer/list
│   ├── rates.js           # rate card + messy-import (T4)
│   └── clock.js           # nightly auto-close job (T2)
└── public/               # frontend (no build step)
    ├── index.html         # landing page
    ├── app.html           # attendant console shell
    ├── css/style.css
    └── js/app.js
```

## Debugging notes

- **"address already in use" on start:** something else is already bound to port 3000 — set `PORT` in `.env` or stop the other process.
- **Login fails right after a fresh clone:** you need to register an account first — there's no default user.
- **Data looks stale after editing spots directly in the DB:** the server holds one long-lived `better-sqlite3` connection; restart `npm start` after any out-of-band DB edits.
- **A vehicle "won't check in":** the API deliberately rejects a check-in if the plate is already active, if the chosen spot is occupied, or if the spot's type doesn't match the vehicle's type (an EV must go to an EV/charger spot) — the error message in the response says which of the three it was.
- We used **SQLite** (not Postgres/MySQL) so the whole project runs with `npm install && npm start` and no external database service to stand up — appropriate for a timed hackathon submission. The schema, foreign keys, and query patterns are structured the same way they would be against Postgres.

See `REASONING.md` for the design decisions behind these choices, and `AI_LOGS.md` for the full assistant conversation used while building this.
## Twist features (added for this round)

- **Messy rate-card import (T4)** — `POST /api/rates/import` takes a raw, messy, free-text rate sheet (CSV rows, prose lines, mixed order, junk/comment lines all mixed together), pulls out a clean `{ firstHour, extraHour, dailyCap }` per spot type, and — only if all three types (compact/standard/ev) parse successfully — replaces the live rate card used by every checkout from then on. Unrecognized lines are reported back as `warnings` instead of breaking the import. Import it from the **Rate card** panel on the dashboard.
- **Nightly auto-close job (T2)** — `POST /api/clock` runs the "nightly job": any session still `active` with a check-in ≥ 24h ago is auto-closed, billed as of the moment the job runs, and its spot freed. No cron process needed for grading — this endpoint is that job, callable on demand. Trigger it from the **Nightly auto-close job** panel, or `curl -X POST /api/clock` directly.
- **Valet hand-off / transfer (T6)** — `POST /api/tickets/transfer/:id` moves an *open* session to a different plate. The spot and the original entry time carry over unchanged (only the plate changes), so the fee at checkout is unaffected by the hand-off. Use the **Transfer** button next to any active ticket.

Rates are tiered per vehicle/spot type (see `GET /api/rates` for the live values — these can change at runtime via rate-card import, see above):
### Tickets
| Method | Path | Description |
|---|---|---|
| GET | `/api/tickets/rates` | The current rate card (kept for backward compatibility — same data as `GET /api/rates`) |
| POST | `/api/tickets/checkin` | Check a vehicle in. Body: `{ plate, vehicle_type, spot_id? }` — auto-assigns a spot if `spot_id` is omitted |
| POST | `/api/tickets/checkout/:id` | Check a vehicle out and compute the fee |
| POST | `/api/tickets/transfer/:id` | **(T6)** Valet hand-off — move an open session to a different plate. Body: `{ new_plate }`. Spot and entry time carry over |
| GET | `/api/tickets` | List/search tickets. Query: `search (plate), status, page, limit, sortBy, order` |
| GET | `/api/tickets/:id` | Single ticket |

### Rates
| Method | Path | Description |
|---|---|---|
| GET | `/api/rates` | The current (cleaned) rate card actually used for billing |
| POST | `/api/rates/import` | **(T4)** Import a messy rate card. Body: `{ raw: "<free-text rate sheet>" }`. Parses CSV-ish and prose lines, skips junk, and replaces the live rate card if all three spot types (compact/standard/ev) were found. Returns `{ rates, warnings }` |

### Clock
| Method | Path | Description |
|---|---|---|
| POST | `/api/clock` | **(T2)** Run the nightly job now — auto-closes and bills any session parked ≥ 24h |

├── lib/
│   └── pricing.js        # fee calculation (tiers, caps, rounding) + messy rate-card parser
├── middleware/
│   └── auth.js           # JWT sign/verify
├── routes/
│   ├── auth.js
│   ├── spots.js
│   ├── tickets.js        # checkin/checkout/transfer/list
│   ├── rates.js           # rate card + messy-import (T4)
│   └── clock.js           # nightly auto-close job (T2)