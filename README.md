# Barbell Warm-ups

A one-page calculator for barbell warm-up sets (squat, press, deadlift). Enter the work weight in kg to get a table of warm-up sets: total weight, weight per side, and reps.

## How the warm-ups are built

- Every weight is a multiple of 2.5 kg (the smallest plate is 1.25 kg). The bar is 20 kg.
- The empty bar comes first: 2 × 5.
- The last warm-up is a single about 7.5% below the work weight, rounded to the nearest 2.5 kg and never above 95% of it.
- Earlier sets are planned backwards from the last warm-up in equal jumps of about 17.5% of the work weight.
- The first weighted set is × 5, the next is × 3 (plus one more triple when there are enough sets), and the rest are singles.

Per-lift settings live in `LIFTS` at the top of `app.js`.

## Deployment

`.github/workflows/deploy.yml` publishes the site to GitHub Pages on every push to `main`. One-time setup: in the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.

## Running locally

Open `index.html` in a browser. There is no build step.
