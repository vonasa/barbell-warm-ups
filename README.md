# Barbell Warm-ups

A one-page calculator for barbell warm-up sets (squat, press, deadlift). Enter the work weight in kg to get a table of warm-up sets: total weight, weight per side with the plates that make it, and reps.

## Plates

Every weight comes from the plates you own, declared in `PLATES` at the top of `app.js`:

| Plate | Count |
| --- | --- |
| 25 kg | 2 |
| 20 kg | 2 |
| 10 kg | 4 |
| 5 kg | 4 |
| 2.5 kg | 4 |
| 1.25 kg | 4 |
| 0.5 kg | 2 |

Only matched pairs count, so an odd plate is ignored. Two rules decide which plates make a given weight:

- The 25s stay in the rack until the total goes **above 117.5 kg**. Below that the bar loads from the 20s down (70 kg is 20+5 a side, not a lone 25); above it the 25s come out, so 120 kg is 25+20+5.
- Warm-ups only use the pairs from 1.25 kg up. There is no point loading a 0.5 for a warm-up, so those sets sit on a plain 2.5 kg grid: 67 totals (20, 22.5, 25, 27.5, …) up to 185 kg. The work weight uses every plate, giving 134 totals — the same grid with a 1 kg offset from the 0.5 pair (20, 21, 22.5, 23.5, …) — up to **186 kg**, which is 83 kg per side.

## How the warm-ups are built

- Every weight is rounded **up**: the work weight onto the nearest total the full inventory can build, every warm-up onto the 2.5 kg grid. A work weight above 186 kg is capped at 186 kg with a note.
- Squat and press start with the empty bar: 2 × 5.
- The last warm-up is a single about 7.5% below the work weight and never above 95% of it. When nothing on the grid fits below that, the warm-ups are skipped altogether and only the first sets remain.
- Earlier sets are planned backwards from the last warm-up in equal jumps of about 17.5% of the work weight, each rounded up onto a loadable weight.
- The first weighted set is × 5, the next is × 3 (plus one more triple when there are enough sets), and the rest are singles.

Deadlifts come third in the session, so they get less warm-up, and they are never pulled with an empty bar. They use the same ladder with three changes: a single opening set of 5 at 40 kg (one 10 kg plate per side), calculated weights of 44 kg or less dropped, and × 3 then × 2 on the first two weights that remain before the singles.

Plates live in `PLATES` and per-lift settings in `LIFTS`, both at the top of `app.js`.

## Deployment

`.github/workflows/deploy.yml` publishes the site to GitHub Pages on every push to `main`. One-time setup: in the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.

## Running locally

Open `index.html` in a browser. There is no build step.
