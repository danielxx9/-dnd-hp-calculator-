# D&D 5e HP Calculator & Monster Builder — Ultimate Edition

20 DM tools in one page: hit dice math, effective HP with resistances, CR reverse-engineering, PC builder, probability curves, statblocks, encounter and initiative tracking, Monte Carlo simulation, and XP/level tracking. Fully client-side, works offline, persists state in `localStorage`.

**Live URL:** <https://dnd-hp-calculator.pages.dev> <!-- TODO: replace after first deploy -->

---

## Features

- **🧮 Calculator** — hit-dice expression parser (e.g. `8d10+24`), batch entry, min/max/avg breakdown.
- **🐉 Creature Builder** — size-based auto dice, Con score → mod, flat bonus, one-click build.
- **🛡️ Effective HP** — resistances/immunities/vulnerabilities, legendary resistances, regen, temp HP.
- **🔍 Reverse Engineer** — target CR → suggested HD/Con combinations with tiers.
- **🧝 PC Builder** — 2014 & 2024 rules, multiclass, Tough / Hill Dwarf / Draconic, level-by-level breakdown.
- **📊 Probability** — exact distribution histogram, single roll, 1000-roll simulation, mean & σ.
- **📜 Statblock** — generator with Markdown + JSON export.
- **⚖️ Compare** — up to 4 expressions side-by-side with durability %.
- **🧬 Templates** — Half-Dragon, Skeleton, Zombie, Vampire, custom transforms.
- **🏰 Encounter** — party/monster builder, XP thresholds, group multiplier, difficulty bar, action economy, multi-creature HP tracker.
- **⚔️ Combat** — DPR, AoE, crit, save DC, attack bonus, healing calculators.
- **🎲 Monster** — random monster generator, ability-score roller by CR, skill proficiency, lair & legendary impact.
- **💀 PC Tools** — death save tracker, conditions, hit-dice recovery, exhaustion, spell slots, temp HP stack.
- **🎯 CR Calc** — full DMG p.274 CR calculator (defensive + offensive + special traits).
- **🎯 Concentration** — success chance with War Caster / Resilient / multi-hit.
- **📅 Day Budget** — multi-encounter adventuring day budget with resource drain visualization.
- **📊 Party Radar** — radar chart of DPR / AoE / healing / tankiness / utility / control.
- **⚡ Combat Tracker** — initiative order, HP bars, temp HP, conditions, death saves, damage log with undo.
- **🎲 Monte Carlo** — 1000+ combat simulations, win rate, casualty rate, round distribution.
- **📈 XP Tracker** — campaign XP, level-up prediction, loot/XP split calculator.
- **💰 Loot Roller** (v4) — DMG-style treasure hoard roller.
- **🎲 Random Encounter** (v4) — environment-based encounter generator with twists.
- **🐲 Lair & Legendary** (v4) — legendary/lair action block builder with Markdown export.
- **☠️ Kill Probability** (v4) — exact hit/crit/mitigation math, cumulative kill odds per round.
- **🎰 Dice Sandbox** (v5) — keep highest/lowest, exploding dice, reroll thresholds.
- **🗡️ Damage vs Target** (v5) — apply damage through temp HP & resistance, concentration DC.
- **📊 Ability Scores** (v5) — 4d6 drop lowest, 3d6, standard array, point buy table.
- **✨ Spell DC** (v5) — save DC & attack bonus with hit/save odds.
- **📖 Conditions** (v5) — searchable conditions reference (2014 + 2024 exhaustion).
- **⚖️ CR Estimator** (v5) — defensive/offensive CR averaging from HP/AC/DPR.
- **🏕️ Rest & Recovery** (v5) — short-rest HD spend, long-rest rules 2014/2024.
- **🎯 d20 Odds** (v5) — success odds with advantage/disadvantage/elven accuracy.
- **🧑 NPC Generator** (v5) — name, race, role, trait/ideal/bond/flaw/hook.
- **📚 Bestiary** (v6) — 80+ SRD creatures, send HD to calculator or load full stats.
- **🖨️ Export & Print** (v6) — Foundry VTT JSON, Roll20 JSON, Roll20 paste text, printable statblock.
- **⚙️ Settings** (v6) — HP rounding mode, backup/restore JSON, auto-save status.

## Tech Stack

- **HTML5** — semantic, accessible (WAI-ARIA tabs), W3C Nu HTML Checker clean.
- **CSS3** — custom properties for light/dark theming, mobile-first responsive, `@media print`.
- **Vanilla JavaScript (ES2020)** — IIFE, no frameworks, no bundlers, no build step.
- **Persistence:** `localStorage` (auto-save every 1.5s, 20 named slots, combat tracker, XP history).
- **Zero third-party requests:** no CDNs, no analytics, no trackers, fully self-hosted.

## Local Development

No build step is required. Serve the folder with any static server:

```bash
npx serve .
# or
python3 -m http.server 8000
```

Open <http://localhost:8000> (or the port shown). Edit any of `index.html`, `styles.css`, `script.js` and refresh.

## Site Pages

Beyond the calculator itself, the site ships a complete supporting page set, all sharing the same theme (`styles.css` + `extra.css`) and a common header/footer:

| Page | File | Purpose |
|---|---|---|
| Calculator | `index.html` | The 20-tool app itself. |
| About | `about.html` | What the tool is, feature overview, credits, contact. |
| FAQ | `faq.html` | 14 grounded Q&As on dice math, storage, share links, shortcuts. |
| Changelog | `changelog.html` | Version history: core release, v4, v5, v6 modules. |
| Privacy Policy | `privacy.html` | No-collection policy, localStorage key-by-key disclosure. |
| Terms of Use | `terms.html` | MIT code, SRD 5.1 (CC BY 4.0) credit, no-WotC-affiliation, as-is warranty. |
| Not Found | `404.html` | Themed 404 page — served automatically by Cloudflare Pages. |
| Tools Hub | `tools.html` | Directory of all 20 tools with a one-line summary each. |
| Donate | `donate.html` | Support page: Ko-fi / Buy Me a Coffee / GitHub Sponsors / PayPal cards, transparency note. |
| Tool Guides (20) | `calculator.html` … `xp-tracker.html` | One dedicated 400–500-word guide page per tool. |
| Guides Hub | `guides.html` | Library page listing the five deep-dive articles. |
| Guide: HP Calculation | `how-to-calculate-hp-dnd-5e.html` | ~2,400 words: monster hit-dice formula, PC HP, level-ups, bonus-HP feats, FAQ. |
| Guide: Effective HP | `effective-hp-dnd-5e.html` | ~2,000 words: resistance/immunity multipliers, DMG p.278 table, regeneration, legendary resistance. |
| Guide: Challenge Rating | `challenge-rating-dnd-5e.html` | ~2,000 words: DMG p.274 defensive/offensive CR math, XP by CR, reverse-engineering. |
| Guide: Encounter Building | `encounter-building-dnd-5e.html` | ~1,950 words: XP thresholds, multipliers, action economy, adventuring-day budgets. |
| Guide: Dice Probability | `dice-probability-dnd-5e.html` | ~2,100 words: hit chance, advantage math, 2d6 vs 1d12, expected rounds to kill. |
| Author Avatar | `images/author-daniel.jpg` | Author photo used in every guide's bio block — replace with your real photo. |
| SEO | `robots.txt`, `sitemap.xml` | Crawler rules and the sitemap (34 URLs). |
| Shared assets | `extra.css`, `common.js` | Page chrome styles; CSP-safe dark-mode sync for subpages. |
| Image assets | `assets/`, `favicon.ico` | OG image (1200×630), favicon set (16/32/48/180/192/512), `site.webmanifest`. |

Two files deserve a note: `extra.css` extends the theme with the site header/footer, prose, FAQ accordion, feature-grid and donation-card styles (it is loaded after `styles.css`, including on `index.html`, whose footer uses it); `common.js` is a small script for the subpages only — it re-applies the dark-mode preference stored by the calculator and highlights the current nav item. It deliberately does **not** load on `index.html`, where `script.js` already runs. Each of the 20 tools also has its own static guide page (listed on `tools.html`) sharing the same theme, header and footer — pure content, no app code, CSP-compliant.

## SEO Layer (built in)

Every page ships with the full on-page SEO stack, no plugins or external services needed:

- **Per-page uniqueness** — unique `<title>`, meta description and `<link rel="canonical">` on all 28 indexed pages.
- **Open Graph + Twitter Cards** — every page carries `og:url`, `og:image` (1200×630 branded card at `assets/og-image.png`), `og:site_name`, `og:locale`, and `twitter:card` / `twitter:title` / `twitter:description` / `twitter:image`.
- **JSON-LD structured data** — `WebApplication` + `WebSite` on the home page (with `featureList` of all 20 tools and a free `Offer`), `ItemList` of all 20 tool guides on `tools.html`, `BreadcrumbList` + `WebPage` on every guide and content page, `AboutPage` on `about.html`, and a 14-question `FAQPage` on `faq.html`.
- **Icons & PWA-lite** — file-based favicon set (`favicon.ico` 16/32/48, PNG 16/32, `apple-touch-icon.png` 180, Android Chrome 192/512) plus `assets/site.webmanifest` with theme colors.
- **Crawlability** — permissive `robots.txt` (only `/404.html` disallowed) with a sitemap reference, and a 28-URL sitemap covering every indexable page.
- **Internal linking** — every page links to the hub and to sibling tool pages ("Related tools" sections), so crawlers can reach all 28 URLs from any page.

## Before You Deploy — replace these placeholders

| Placeholder | Where | Replace with |
|---|---|---|
| `[YOUR NAME]` | `LICENSE`, `README.md`, footer fineprint on every page | Your name or handle |
| `YOUR_BMC_USERNAME` | `donate.html` | Your Buy Me a Coffee username |
| `YOUR_KOFI_USERNAME` | `donate.html` | Your Ko-fi username |
| `YOUR_GITHUB_USERNAME` | `donate.html` | Your GitHub username (Sponsors) |
| `YOUR_PAYPAL_USERNAME` | `donate.html` | Your PayPal.me username |

If you do not use a platform, simply delete that feature-card block from `donate.html`. After deploying on a custom domain, also replace `dnd-hp-calculator.pages.dev` in `robots.txt`, `sitemap.xml`, `site.webmanifest` (start_url) and the canonical/OG tags — a search-and-replace across `*.html` covers it.

## Cloudflare Pages Deployment

### Option A — Git integration (recommended)

1. Push this folder to a GitHub repository (default branch `main`).
2. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**.
3. Pick the repository and use these build settings:

   | Setting | Value |
   |---|---|
   | Production branch | `main` |
   | Build command | `exit 0` |
   | Build output directory | *(blank)* |
   | Framework preset | None |

4. Click **Save and Deploy**. First deploy completes in under a minute.
5. Your site goes live at `https://<project-name>.pages.dev`.

### Option B — Direct upload

Drag-and-drop the entire folder contents into **Workers & Pages → Create → Pages → Upload assets**.

### Option C — Wrangler CLI

```bash
npm install -g wrangler   # or: npx wrangler
wrangler login
./deploy.sh
# or directly:
npx wrangler pages deploy . --project-name=dnd-hp-calculator --branch=main
```

### Option D — GitHub Actions (CI/CD)

Add repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, then push to `main`. The workflow in `.github/workflows/deploy.yml` deploys automatically. You can also trigger it manually from the Actions tab.

## Custom Domain

1. In Cloudflare Pages → **Custom domains → Set up a custom domain**.
2. Enter your domain (e.g. `dnd.example.com`).
3. Cloudflare auto-provisions the DNS CNAME if the domain is on Cloudflare; otherwise add a CNAME pointing to `<project-name>.pages.dev`.
4. HTTPS is provisioned automatically.

## Security Headers

`_headers` ships a strict Content-Security-Policy, frame-ancestors `none`, nosniff, no-referrer downgrade, and disabled camera/microphone/geolocation permissions. Static assets under `/assets/` get a 1-year immutable cache; everything else is cached for 1 hour.

## License

MIT © 2025 [YOUR NAME] <!-- TODO: replace [YOUR NAME] with your real name in LICENSE, README, and wrangler.toml if needed -->
