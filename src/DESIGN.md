# Design System Document

## 1. Overview & Creative North Star: "The Architectural Ledger"

This design system is a digital translation of the precision and functional clarity found in high-end printed agendas and architectural documentation. Moving beyond generic "app" interfaces, this system treats digital space as a physical canvas where information is organized with clinical intentionality.

**The Creative North Star: Architectural Ledger.**
We eschew the standard rounded, "bubbly" UI of modern web apps in favor of a strictly rectilinear, high-contrast editorial aesthetic. We honor the heritage of the printed form—specifically its use of table-like structures and bold color-coded alerts—while elevating it through sophisticated tonal layering. We achieve a "premium" feel not through shadows or gradients, but through the perfect management of white space, razor-sharp edges (`0px` radius), and a surgical use of high-contrast red for critical focus.

---

## 2. Colors

The palette is rooted in a spectrum of sophisticated neutrals that mimic the varied textures of paper and stone, punctuated by a singular, authoritative high-contrast red.

### Neutral Foundation
*   **Background (`#f9f9f9`):** Our primary "canvas."
*   **Surface Tiers:** Use `surface_container_low` (`#f2f4f4`) for large sectioning and `surface_container_highest` (`#dde4e5`) for header backgrounds to replicate the shaded headers of a physical form.
*   **On-Surface (`#2d3435`):** Our primary ink color. Deep, but not a pure black, to maintain an editorial softness.

### The Red Accent (Tertiary)
*   **Tertiary (`#ba1e1e`):** Reserved exclusively for high-priority alerts, urgent agenda items, or specific label warnings (as seen in the printed reference).
*   **Tertiary Container (`#fd5046`):** Used for background fills of urgent status chips where high visibility is required.

### Signature Rules
*   **The "No-Line" Rule:** Explicitly prohibit `1px` solid borders for general sectioning. Boundaries must be defined through background color shifts. For instance, a table body should be `surface_container_lowest` (#ffffff) sitting inside a `surface_container` (#ebeeef) frame.
*   **The "Glass & Gradient" Rule:** To provide "soul" to our functional layout, use **Glassmorphism** for floating action menus or navigation overlays. Utilize `surface` at 80% opacity with a `20px` backdrop-blur to allow the structural grid beneath to bleed through.
*   **Signature Textures:** Use a subtle vertical gradient from `primary` (#5d5e61) to `primary_dim` (#515255) for primary action buttons to give them a "machined" metallic feel.

---

## 3. Typography

The system utilizes **Public Sans**, a geometric sans-serif that balances the authority of a typeface like Helvetica with the legibility required for dense data scheduling.

*   **Display & Headline (Editorial Impact):** Large-scale typography (`display-lg` to `headline-sm`) should be used sparingly, primarily for agenda titles or date headers. It communicates the "Header" of the form.
*   **Titles (The Structural Anchor):** `title-lg` and `title-md` are used for table category headers. Use all-caps with increased letter spacing to mimic the "REUNIONES DE CONGREGACIÓN" style of the reference form.
*   **Body & Label (Functional Clarity):** `body-md` is our standard workhorse for agenda entries. `label-sm` is reserved for metadata and "helper" text.

---

## 4. Elevation & Depth: Tonal Layering

We reject the traditional "drop shadow" approach. Instead, we convey hierarchy through the **Layering Principle**.

*   **Tonal Stacking:** Depth is achieved by "stacking" surface-container tiers. A white `surface_container_lowest` card should be placed on a `surface_container_low` background to create a soft, natural lift.
*   **Ambient Shadows:** If a floating element (like a modal) is required, use an extra-diffused shadow: `box-shadow: 0 10px 40px rgba(45, 52, 53, 0.06)`. This mimics natural light rather than digital "glow."
*   **The "Ghost Border" Fallback:** If a border is required for accessibility in table cells, use the `outline_variant` token at **15% opacity**. High-contrast, 100% opaque borders are strictly forbidden.

---

## 5. Components

### Cards & Tables
Forbid the use of divider lines. Instead, use the **Spacing Scale** (specifically `spacing.px` or `spacing.1`) to create "micro-gutters" between cells, allowing the background color to act as a natural border.

### Input Fields
*   **Shape:** Strictly `0px` border radius.
*   **State:** Default state uses `outline_variant`. On focus, the bottom border thickens to `2px` using `primary`.
*   **Error:** Use `tertiary` (#ba1e1e) for label text and a `surface_container` fill.

### Buttons
*   **Primary:** Rectangular, `primary` fill, `on_primary` text. Use for "Save Agenda" or "Confirm."
*   **Secondary:** Ghost-style with a `primary` border at 20% opacity.
*   **Tertiary/Alert:** `tertiary` text on a transparent background for destructive or urgent actions.

### Agenda Chips
Used for "AM/PM" or "Status" indicators. They should be square-edged. 
*   **Action Chips:** `surface_container_high` background with `body-sm` text.
*   **Warning Chips:** `tertiary_container` background with `on_tertiary_container` text.

### Progress Indicators
Instead of circular loaders, use a thin `2px` horizontal bar at the top of the container using a gradient of `primary` to `primary_container`.

---

## 6. Do's and Don'ts

### Do
*   **DO** use strict horizontal and vertical alignment. Every element should feel like it belongs to an invisible grid cell.
*   **DO** use `tertiary` (Red) selectively. It should only appear on less than 5% of the total screen real estate to maintain its psychological impact.
*   **DO** use white space (`spacing.10` to `spacing.16`) to separate major agenda sections instead of horizontal rules.

### Don't
*   **DON'T** use rounded corners (`0px` is the law).
*   **DON'T** use multi-colored iconography. Icons should be monochromatic using `on_surface_variant`.
*   **DON'T** use standard grey borders to separate list items. Use tonal shifts (`surface` to `surface_container_low`).
*   **DON'T** use "floating" elements unless they are truly temporary (modals/tooltips). The layout should feel "grounded" and structural.
