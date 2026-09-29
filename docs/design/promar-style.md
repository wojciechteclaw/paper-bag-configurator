# Visual style reference: promarjarocin.pl

Client request: style the configurator UI after the client's reference manufacturer, https://www.promarjarocin.pl/.
Only **style** (fonts, colours, radii, spacing feel) is taken over — no logos, images, icons or text content.

Researched 2026-09-29 from:

- Homepage: `https://www.promarjarocin.pl/`
- Product page: `https://www.promarjarocin.pl/torby-klockowe/` (body class `page-template-new_template-oferta-pl`, `elementor-page-1010`)
- Theme stylesheet (all brand rules live here): `https://www.promarjarocin.pl/wp-content/themes/promarjarocin/assets/css/style.min.css` — a Foundation 6 build plus theme rules. Rule references below quote selectors from that file unless noted.
- Elementor CSS: `.../wp-content/uploads/elementor/css/post-1010.css` (page layout only, no brand colours) and `post-1909.css` (Elementor default kit: Roboto / Roboto Slab and `#6EC1E4` / `#61CE70` globals — **defaults, not used by the visible theme**, ignored).
- Inline `#wp-custom-css` on the product page: `h2 { font-size: 2.0rem !important }`, `h3 { font-size: 1.2375rem !important }` (≥ 40em), `.top-bar-nav>.menu>li>a { padding: 2rem 1.0rem !important }`.

## Fonts

Loaded from **Google Fonts** by the theme stylesheet's first line:

```css
@import url("https://fonts.googleapis.com/css?family=Open+Sans:300,400,600,700|Raleway:400,500,600,700&subset=latin-ext");
```

| Role | Family / weight / size | Source rule |
|---|---|---|
| Body text | Open Sans 400, line-height 1.5, colour `#222`, antialiased | `body{font-family:"Open Sans", sans-serif;font-weight:normal;line-height:1.5;color:#222}` |
| Paragraphs | line-height 1.6; SEO text 15 px | `p{line-height:1.6}`, `.tekst_seo p{font-size:15px}` (custom CSS) |
| Headings h1–h6 | Open Sans **bold**, colour `#323f52` (navy), line-height 1.4; h2 2.0rem, h3 1.2375rem on desktop | `h1,…,h6{font-family:"Open Sans";font-weight:bold}`, `h1,…,h5{color:#323f52}`, custom CSS |
| Display / section titles | **Raleway** 600–700, often `uppercase` | `.page-title{font-family:"Raleway";font-size:2.5rem;font-weight:700;text-transform:uppercase}`, `.section-title{font-family:"Raleway";color:#00ad4a;font-size:1.225rem;font-weight:600}`, `body.home .section-title{…color:#464646;font-weight:700;uppercase}` |
| Main navigation | Open Sans 600, 0.875rem, `uppercase`, `#222`; active / hover `#00ad4a` | `.top-bar-nav>.menu>li>a{color:#222;font-size:0.875rem;font-weight:600;text-transform:uppercase}`, `…li.active>a,…:hover>a{color:#00ad4a}` |
| Buttons (outlined CTA) | Raleway 600, 0.875rem, `uppercase`, padding 0.5rem 0.875rem | `.blog__item__footer .button{font-family:"Raleway";border:#00ad4a 2px solid;color:#00ad4a;font-size:0.875rem;padding:0.5rem 0.875rem;font-weight:600;text-transform:uppercase}` |
| Form labels | 0.875rem, 400, `#222` | `label{font-size:0.875rem;line-height:1.8;color:#222}` |

## Colours

| Token idea | Value | Where on the site |
|---|---|---|
| Brand green (primary) | `#00ad4a` | links `a{color:#00ad4a}`, solid `.button{background-color:#00ad4a;color:#fff}`, nav active, section titles, footer title underline `.footer .widgettitle:after{height:0.1875rem;background-color:#00ad4a}` (113 occurrences) |
| Green hover | `#00933f` (button), `#009540` (link) | `.button:hover{background-color:#00933f}`, `a:hover{color:#009540}` |
| Green dark | `#005725` | `.button.hollow:hover{border-color:#005725;color:#005725}` |
| Navy (headings, secondary hover) | `#323f52` | `h1…h5{color:#323f52}`, `.blog__item__footer .button:hover{background-color:#323f52;border-color:#323f52;color:#fff}`, `.pagination li.current{background:#323f52}` |
| Text | `#222` | `body{color:#222}`; also the dark top contact bar `.header-contact{background-color:#222}` |
| Secondary text | `#464646` | `body.home .section-title`, `.top-bar-nav .submenu{background-color:#464646}` |
| Light section background | `#f2f3f3` | `.home2`, `.posts`, `.gallery{background-color:#f2f3f3}` |
| Page / header background | `#fff` | `body{background:#fff}`, `.top-bar{background-color:#fff}` |
| Control border | `#cacaca`; focus `#8a8a8a` + `box-shadow:0 0 5px #cacaca` | Foundation `input`/`select{border:1px solid #cacaca}`, `select:focus{border:1px solid #8a8a8a}` |
| Disabled field | `#e6e6e6` | `input:disabled{background-color:#e6e6e6}` |
| Error | `#cc4b37` | `.form-error{color:#cc4b37}`, `.is-invalid-label` |
| Warning | `#ffae00` / dark `#805700` | Foundation callout/label palette |
| Footer | `#222` / `#141314`, text `#a3a3a3` | `.footer__menu`, `.footer__info` |

## Shape, depth, spacing

- **Radius:** essentially square — `.button{border-radius:0}`, `select{border-radius:0}`; cards 5 px (`.faq__item{border-radius:5px}`); round only for icon buttons (`.slider-photo .slick-arrow{border-radius:50%}`).
- **Shadows:** very soft — sticky header `box-shadow:0 0 2px 1px rgba(0,0,0,0.16)`; cards `box-shadow:0 0 70px rgba(0,0,0,0.05)`.
- **Borders:** 2 px green outlines on CTAs, 1 px light grey (`#cacaca`, `#e6e6e6`, `#f2f2f2`) elsewhere.
- **Transitions:** `0.2s–0.4s ease` on colour / background.
- **Spacing feel:** airy; sections `padding: 3.125rem 0`, nav links `padding: 2rem 1rem`, content max-width 1140–1200 px. Uppercase, semibold labels for navigation and CTAs; large navy headings.

## How it is applied in the configurator (`src/index.css`, `src/dieline/dieline.css`)

Fonts: the same Google families (Open Sans 400/600/700 for text, Raleway 600/700 for the title, step names, headings and buttons) via `<link>` + `preconnect` in `index.html`, with `system-ui, 'Segoe UI', Roboto, sans-serif` as fallback.

Design tokens on `:root` (see `src/index.css`):

| Token | Value | Note |
|---|---|---|
| `--brand` | `#00ad4a` | decorative only (title underline, progress fills, selected-card marker) — 2.97:1 on white is below AA for text |
| `--accent` | `#007f37` | **accessible derivative** of the brand green used for text, outlines, focus ring and filled buttons (5.13:1 with white) |
| `--accent-hover` | `#005725` | site's dark green (`.button.hollow:hover`), 8.79:1 |
| `--heading` | `#323f52` | navy headings; also the hover fill of outlined buttons, as on the site (10.67:1) |
| `--text` | `#222` | body text (15.9:1) |
| `--muted` | `#5f6670` | secondary text; the site's greys `#8a8a8a` / `#cacaca` fail AA, so a darker cool grey is used (≥ 5.2:1 on `#f2f3f3`) |
| `--bg` / `--surface-muted` | `#f2f3f3` | page background / muted panels |
| `--surface` | `#fff` | panels, header, controls |
| `--border` / `--border-strong` | `#e1e4e6` / `#7d848b` | dividers / form-control outlines (≥ 3:1 for control boundaries) |
| `--error` | `#cc4b37` | site error colour (4.54:1) |
| `--warning` / `--warning-bg` | `#805700` / `#fff4d6` | (5.84:1) |
| `--radius-control` / `--radius-card` | `0` / `5px` | square controls, 5 px cards as on the site |
| `--shadow-header` / `--shadow-card` / `--shadow-overlay` | see file | site's header shadow and very soft card shadow |

The 3D scene background (`src/renderer/camera.ts`) moved from `#eeeeec` to the site's neutral light grey `#f2f3f3`; paper colours are unchanged. Dieline line colours (cut red, crease blue, …) are production semantics and stay unchanged; only the dieline chrome (buttons, panels, focus) uses the tokens.
