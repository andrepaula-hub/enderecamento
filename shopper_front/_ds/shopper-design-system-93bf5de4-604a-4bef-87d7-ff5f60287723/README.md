# Shopper Design System

Design system for **Shopper.com.br** — Brazil's leading scheduled-grocery-restocking service. Built from the "Lojas 2023.1" Figma file.

## Who is Shopper?

> *"Um mundo onde os produtos essenciais cheguem na sua casa com a mesma facilidade que a água chega na torneira."*

Shopper is a Brazilian online supermarket focused on **scheduled monthly restocking** at lower prices. The service runs as native iOS / Android apps plus a responsive web site (desktop + mobile).

### Product surfaces

The system covers **4 sub-brands** under the Shopper umbrella. Each has its own accent color while sharing the navy / green brand core.

| Sub-brand | Accent | What it is |
|---|---|---|
| **Shopper Compra Programada** | Royal blue `#225CB3` | Monthly scheduled restocking — the flagship. 5–10% cheaper, flexible monthly. |
| **Shopper Programada Fresh** | Lime green `#85CE2B` | Weekly fresh: produce, dairy, meat. |
| **Shopper Compra Única** | Orange `#F59C00` | One-off grocery order. |
| **Shopper Now** | Red `#9E1028` | Fast / on-demand delivery. |
| **pet.shopper** | Pink `#F2749E` | Pet products store. |

Plus a **Mini-mercado** (in-building totem/kiosk) experience.

### Platforms

- **Native app (iOS / Android)** — 375 px design reference. Most frames in the file target mobile.
- **Web desktop** — landing page, storefront, checkout (1920 / 1280 / 768 / 601 breakpoints).

## Brand DNA in one sentence

Calm trustworthy navy backdrop, confident Shopper-green CTAs and pill-shaped primaries, warm real-food photography, Lato/Raleway type — practical, friendly, "sem firulinhas" (no frills).

## Slogan

> *"seu jeito inteligente de fazer supermercado"*

Escrito em minúsculas, fonte Raleway Light.

## Sources

- **Figma file:** `Lojas 2023.1.fig` (mounted as read-only virtual filesystem in this session). 39 pages, 497 top-level frames. See `/METADATA.md` inside the .fig for raw counts.
- Key pages explored: `/Landing-Page`, `/Tela-Inicial` (home), `/NavBar`, `/Pet-Shopper`, `/Mini-mercado`, `/Carrinho-vend-vel-app`, `/Perfil-de-cadastro`.
- **Brand statement:** provided in brief — mission, vision, values ("Obsessão pelo cliente", "Simplicidade", "Fazer mais com menos", etc.).
- **No codebase was provided.** All visuals reconstructed from Figma pseudocode + screenshots.

---

## CONTENT FUNDAMENTALS

Shopper writes in **Brazilian Portuguese**, warm and direct. The tone is **conversational-practical** — friendly like a neighbor but never cutesy.

### Voice

- **Second-person, informal** ("você", never "o senhor"). Uses contractions naturally ("né?", "tá", "da gente").
- **Clear verbs, short sentences.** "Crie sua conta", "Quero esse", "Faça sua lista", "Receba sem sair de casa".
- **Enthusiastic, not hype.** Real benefits, concrete numbers: "Economize de 5 a 10%", "+10.000 produtos", "1.700 produtos".
- **Problem-first framing.** Product values like *"SENSO DE URGÊNCIA: Problema percebido é problema entendido"* show up in copy — acknowledge the friction, then solve.
- **"Nosso" / "a gente" language** for shared ownership with the customer.

### Casing

- **Sentence case for headlines** with periods: *"Seu supermercado online. Compre sem sair de casa."*, *"Tudo o que você precisa, a Shopper tem."*
- **UPPERCASE** used sparingly for value props on landing: *"PRATICIDADE"*, *"AUTONOMIA"*, *"FLEXIBILIDADE"*, *"ECONOMIA"*.
- **Lowercase wordmarks**: `shopper`, `pet.shopper`, `compra programada`.
- **Buttons:** sentence case, sometimes stripped of caps — *"Crie sua conta"*, *"Quero esse"*, *"Adicionar"*, *"Finalizar compra"* (occasionally ALL CAPS for primary cart CTAs).

### Examples from the file

- Hero: *"Seu supermercado online. Compre sem sair de casa."*
- Section title: *"Escolha o modelo que mais combina com você."*
- Value: *"Tudo pronto em poucos cliques."*
- FAQ: *"Como funciona a Shopper?"*, *"A Shopper cobra frete ou taxa de entrega?"*
- Promo: *"Economize de 5 a 10% com Compras Programadas"*
- Pet: *"Conheça os melhores produtos com os melhores preços para o seu pet"*

### Emoji / unicode

- **Emoji: no.** Not used in UI anywhere in the file. Occasionally a 🛒 icon appears as a shape (not the emoji glyph).
- **Units / currency:** `R$` with non-breaking space then number — `R$ 53,90`. Brazilian decimal comma is mandatory.
- **Special characters:** `—` em-dash is used naturally, `+` prefix for counts (`+10.000`, `+55 11 3661-1712`).

---

## VISUAL FOUNDATIONS

### Color vibe

Navy `#002D62` is the **primary surface color** — headers, footers, footer, dark hero blocks. Shopper-green `#0DAB77` is the **action color** — every primary CTA, the logo leaf, the search-submit pill, "adicionar" buttons. The combination is the single most recognizable thing about the brand.

A pale cream-green `#E8F3D8` appears as a soft hero wash, often paired with a **subtle repeating geometric pattern** (interlocking arches / scales — see `assets/imagery/` `434e9fb2cc32.png`) laid at low contrast behind product photography.

Imagery is **warm, bright, studio-lit food photography** — real products, vivid packaging, no illustrations of products. Pet imagery skews pastel-pink. Testimonial / "behind the scenes" photos are warm-toned (kitchen lighting).

### Type

Two families — per brandbook 2021:

| Família | Uso | Pesos |
|---|---|---|
| **Lato** | Textos institucionais e de sistema (UI) | Light 300 / Regular 400 / Bold 700 / Black 900 |
| **Raleway** | Conteúdo, AO e campanhas (display/marketing) | Light 300 / Medium 500 / Bold 700 / Black 900 |
| **Inter** | Numéricos tabulares (status bar iOS, preços) | Regular 400 / Bold 700 |

**No serifs, no display faces.** Type is dense on mobile product cards (10–14 px captions, 14–16 px body, 20–24 px section titles, 40 px hero).

> ⚠️ **Correção vs. Figma:** o arquivo "Lojas 2023.1" usava Montserrat como fonte primária. O brandbook oficial (2021) especifica **Lato** para UI e **Raleway** para campanhas. O design system foi atualizado para seguir o brandbook.

### Backgrounds

- **Solid** white cards on grey page.
- **Navy blocks** full-bleed for promo / "sobre nós" bands.
- **Soft-green wash** `#E8F3D8` for hero zones, occasionally with mix-blend-mode exclusion revealing a subtle arch pattern.
- **No gradients.** Flat solids throughout. (A couple of navy→deeper-navy radials exist on promo cards but are rare.)
- **Full-bleed real photography** with a dark-overlay + white text for lifestyle callouts.

### Radii

Capsule-forward: search bars, buttons, chips are **pill-shaped (999 px)**. Cards are `8 px`. Product thumbnails have `8–12 px` rounding. The navy CTA on `Lojas` uses an `18.5 px` radius → near-capsule.

### Shadows / borders

- **Shadows are light**, navy-tinted: `0 6px 16px rgba(0,45,98,.10)`. Cards prefer **1 px `#E2E2E2` border** over heavy drop-shadow.
- **Dividers** are hairline `#E2E2E2`, sometimes `#F4F4F4`.
- Buttons have **no shadow**; emphasis is color only.

### Buttons & states

- **Primary:** filled Shopper-green pill, white Lato Bold 14 px label, 40–44 px tall.
- **Secondary outline:** 1 px navy border, white fill, navy label, pill shape (e.g. "Lojas", "Fazer Login").
- **Ghost / text:** green text, no border.
- **Hover:** darken fill by ~6% (`#07A776`), no scale.
- **Press:** slightly darker (`#2DA77A`), subtle `scale(0.98)`. No bounce.
- **Disabled:** 40% opacity, same shape.

### Animation

- Transitions are **short and purposeful**: 120–200 ms, `cubic-bezier(.2,.8,.2,1)` standard ease.
- Fades + mild translate on page sections; no bounces, no parallax, no particle effects.
- Loading states use a single **Shopper-green spinner** or skeleton grey bars.

### Layout

- Mobile grid: 375 px reference, 16 px outer padding, 8 px card gap.
- Desktop: 1918 px landing, centered 1200 px content column, 128 px top navy bar.
- Product grid is 2-up on mobile, 4-up on desktop, with tight rhythm.
- **Fixed navy cart footer on mobile** — "0 - R$ 0,00 | FINALIZAR COMPRA" split bar.
- Tab bar (5-up) at bottom of app: Compras, Pesquisa, Carrinho, Datas, Conta.

### Transparency / blur

- Almost none. Surfaces are opaque. Modals dim the background with a `rgba(0,45,98,.4)` overlay, no blur.

### Imagery color cast

Warm, saturated, studio-lit. Pet imagery is pink-tinted. Hero imagery features realistic food + packaging laid flat on a muted green wash. Minimal post-processing, no duotones, no grain.

---

## ICONOGRAPHY

Shopper uses **custom stroke-outline icons** in the Figma file — thin-to-medium weight outlines, navy `#002D62` on light, white on dark. The set covers tab-bar essentials (house/bag, search, cart, calendar, person), product meta (truck, calendar, check, trash, plus/minus), and a handful of decorative illustrations (star for "Destaques", category-specific like a dog-collar icon for pet).

- **No icon font** was embedded. All icons are **inline SVG** in the Figma pseudo-code.
- **Style:** 1.5–2 px stroke outlines, rounded joins. A few fill-style icons for stars and states.
- **Emoji: never used.** Unicode glyphs limited to `R$`, `+`, `—`.
- **Substitution:** since we could not cleanly extract every icon, the UI kits use **Lucide** (`https://unpkg.com/lucide@latest`) — its stroke weight and style (2 px, rounded) matches Shopper's outline style within one or two px. **⚠️ Flag to the user:** if production icons exist, drop them into `assets/icons/` and update `ui_kits/*/components` to reference them.

### Illustrations

A **subtle geometric arch pattern** (`assets/imagery/bg-pattern.png`, node `434e9fb2cc32`) recurs behind hero blocks. A "shopping list / sacola" still-life, a "cooking" lifestyle shot, and category tiles (limpeza, alimentos, bebidas, higiene, pets…) were copied from the Landing Page frame.

---

## Index — what's in this folder

```
/
├── README.md                    ← you are here
├── SKILL.md                     ← agent skill manifest
├── colors_and_type.css          ← CSS variables for color + type + spacing tokens
├── fonts/                       ← Raleway variable font (.ttf). Lato + Inter via Google Fonts — see colors_and_type.css
├── assets/
│   ├── logos/                   ← shopper, programada, fresh, unica, pet.shopper (SVG)
│   ├── icons/                   ← (using Lucide CDN — see ICONOGRAPHY)
│   └── imagery/                 ← hero photos, category tiles, bg pattern
├── preview/                     ← design-system review cards (rendered in the Design System tab)
└── ui_kits/
    ├── app/                     ← mobile app recreation (Pet Shopper + Compras home)
    └── web/                     ← desktop landing + store
```

## Caveats

1. **No codebase access.** All visuals are rebuilt from Figma pseudocode + screenshots, not production React.
2. **Logos are recreated SVGs**, not the original brand logo files. They match placement / color / weight but not exact letterforms.
3. **Icons are Lucide substitutes** rather than Shopper's in-house outline set. See ICONOGRAPHY above.
4. **Fonts:** Raleway carregada localmente via `.ttf`. Lato e Inter via Google Fonts. Montserrat **removida** — não consta no brandbook oficial.
5. **Sub-brand lockups** (Fresh, Programada, Única) are approximated — the figma originals use custom letterforms we didn't try to trace.
