# shubhamdey — personal site

Static single page. No build step, no dependencies, no framework.
Open `index.html` and it works.

```
index.html          all content + the analytics snippet
css/style.css       design tokens at the top — palette lives in one :root block
js/main.js          spring physics, drag strip, accordion, scroll-spy
assets/             portrait + CV PDF
```

## Run locally

```bash
python3 -m http.server 4321 --directory personal-site
```

## Analytics

The site ships with **GoatCounter**: free, no cookies, so no consent banner.
It reports page views, **referrers** (where visitors came from), countries,
browsers and screen sizes.

Active. Dashboard: <https://shubhamdey.goatcounter.com>

Prefer Google Analytics? Delete that block and paste a GA4 snippet in its
place — nothing else depends on it.

Note: no analytics tool identifies individual people. You get country, referrer,
browser and device — not names.

## Deploy to GitHub Pages

Repo must be named exactly `Neoeconomist.github.io`, public.

```bash
git init && git add -A && git commit -m "Personal site"
git branch -M main
git remote add origin https://github.com/Neoeconomist/Neoeconomist.github.io.git
git push -u origin main
```

Then Settings → Pages → Source: `main` / root.
Live at <https://neoeconomist.github.io>.

## Adding shubhamdey.com later

1. Add a file `CNAME` at the repo root containing one line: `shubhamdey.com`
2. At the registrar, point apex `A` records at
   `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`,
   and `CNAME` `www` → `neoeconomist.github.io`
3. Settings → Pages → Custom domain, then tick **Enforce HTTPS**

Then update the four absolute URLs in `index.html` (canonical, `og:url`,
`og:image`, and the two in the JSON-LD block) plus `<loc>` in `sitemap.xml`
and the `Sitemap:` line in `robots.txt`. Those are the only places the
hostname is hard-coded — everything else is relative.

## Editing

**Cookery photos.** Four, in `assets/kitchen/`, pre-cropped to 4:5 at 700×875.
To add another, copy a `<figure class="shot">` block and point it at a new
file — the drag strip re-measures itself, so no JS to touch. To prepare an
image (HEIC included, which browsers other than Safari cannot render):

```bash
sips -s format jpeg -s formatOptions 80 --resampleWidth 700 in.heic --out out.jpg
sips -c 875 700 out.jpg      # centre-crop to 4:5
```

For a landscape source use `--resampleHeight 875` instead, or the crop will
have nothing to work with.

**Add a paper.** Copy any `<article class="card" data-paper>` block. The expand
behaviour attaches automatically; no JS to touch.

**Palette.** The `:root` block at the top of `css/style.css`. Four warm grounds
— `--ivory` `#FAF9F5`, `--cloud` `#F0EEE6`, `--warm` `#F3E7D3`, `--deep`
`#E9E5D9` — with `--clay` `#BE5D3C` as the only accent. Sections pick a ground
with a `tint-*` class, so re-ordering the colour rhythm means swapping one
class in `index.html`. Dark mode mirrors every token as warm browns, never
pure black.

**The mark.** One SVG symbol (`#mk`, defined once at the top of the body) is
the site's only ornament — it punctuates each section label, sits in empty
photo slots, and signs the footer. `.mark` sizes it in `em`, so it scales with
whatever text it sits beside.

**Type.** One family throughout, and deliberately no webfont — the stack starts
at `-apple-system`, so it renders as real SF Pro on Apple hardware with Apple's
own optical sizing and tracking tables, and falls back to Segoe UI / Roboto
elsewhere.

## Motion

One `Spring` class, parameterised as Apple frames it — `response` (seconds to
target) and `damping` (`1.0` = critically damped, no overshoot). Every
animation starts from the current on-screen value, so anything moving can be
grabbed and reversed mid-flight.

The Cookery strip is the fully gestural piece: pointer capture, 1:1 tracking
that respects the grab offset, ~10px hysteresis before committing to a
horizontal drag, progressive rubber-band resistance past the edges, and on
release it projects the flick forward (`project()`, the exponential-decay form
Apple ships — not `v²/2a`), snaps to the nearest card to that projection, and
hands the finger's velocity to the spring so there is no seam between dragging
and animating.

Section headers are **scroll-linked** rather than triggered (`[data-scrub]`):
each one scales from 0.94 to 1.0 as it rises into view, holds, then scales on
to 1.10 while fading and lifting away as it leaves the top. Because it tracks
scroll position rather than firing once, it runs in reverse when you scroll
back up.

Two things that matter in that code. Positions are measured **with the
transform cleared** and cached — reading `getBoundingClientRect()` while a
scale is applied feeds the element's own transform back into its progress and
oscillates. And the leave window is sized from the element's own height
(`start + h * 0.8`) rather than a fixed distance, or tall headers vanish while
still on screen.

`prefers-reduced-motion`, `prefers-reduced-transparency` and
`prefers-contrast: more` all have real fallback paths; reduced motion drops
the scrub entirely rather than degrading it.
