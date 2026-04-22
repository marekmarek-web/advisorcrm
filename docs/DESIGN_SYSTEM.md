# Design System — Portal

Single source of truth for portal (and client zone) UI. If a screen looks different from this doc, the screen is wrong.

---

## 1. Tokens

All colors, radii, spacing, shadows and typography come from CSS variables defined in `apps/web/src/styles/aidvisora-theme.css`.

### Colors (text / surfaces)

Use the `--wp-*` tokens via Tailwind arbitrary value syntax:

- `text-[color:var(--wp-text)]` — primary text
- `text-[color:var(--wp-text-secondary)]` — secondary text
- `text-[color:var(--wp-text-tertiary)]` — tertiary / hints
- `bg-[color:var(--wp-surface-card)]` — cards, panels, modal panels
- `bg-[color:var(--wp-main-scroll-bg)]` — page background, empty states
- `bg-[color:var(--wp-surface-muted)]` — toolbars, chips, quiet containers
- `border-[color:var(--wp-surface-card-border)]` — card / input borders
- `bg-[color:var(--wp-primary)]` / `hover:bg-[color:var(--wp-primary-hover)]` — CTA buttons

Forbidden in `apps/web/src/app/portal/**` and `apps/web/src/app/client/**`:

- `bg-slate-*`, `text-slate-*`, `border-slate-*`
- Hex literals in `className` (`#f8fafc`, `#1a1c2e`, `#f4f5f8`, `rgba(15,23,42,...)`)
- `hsl(var(--primary))` shadcn vars (shadcn layer is isolated)

Allowed exceptions: `bg-slate-900` used intentionally for dark chrome hero sections (team shell card, message composer) — these are visual identity, not generic surfaces.

### Radius

| Token | Value | Usage |
|---|---|---|
| `--wp-radius-xs` | 4px | badges, tags |
| `--wp-radius-sm` | 8px | pill buttons |
| `--wp-radius` | 10px | small controls |
| `--wp-radius-lg` | 20px | — |
| `--wp-radius-modal` | 20px | modal panels |
| `--wp-radius-card` | 24px | cards, panels, sections (**default**) |
| `--wp-radius-xl` | 30px | — |
| `--wp-radius-2xl` | 32px | hero cards |

Use `rounded-[var(--wp-radius-card)]` instead of `rounded-[24px]` / `rounded-[28px]`.

### Spacing

Tailwind scale (`p-4 sm:p-6 md:p-8`, `gap-2/3/4/6/8`, `space-y-4/6`). Avoid arbitrary values like `p-[17px]`.

### Typography

- Headings: `font-black tracking-tight`
- Uppercase labels: `text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]`
- Body: `text-sm font-medium`

---

## 2. Page Shell

Every portal page starts with `PortalPageShell` (`apps/web/src/app/components/layout/PortalPageShell.tsx`):

```tsx
<PortalPageShell
  title="Kampaně"
  description="Správa e-mailových kampaní"
  actions={<CreateActionButton onClick={…}>Nová kampaň</CreateActionButton>}
  maxWidth="standard"
>
  {content}
</PortalPageShell>
```

`maxWidth` scale:

| Value | px | Pages |
|---|---|---|
| `standard` | 1200 | setup, production, analyses, business-plan, contracts/review |
| `wide` | 1400 | today, business-plan (multi-column) |
| `full` | 1600 | email-campaigns, team-overview |

Do not re-implement a page shell. If `PortalPageShell` is missing a slot you need, extend it there.

---

## 3. Cards

Use `SectionCard` (`apps/web/src/app/components/ui/primitives/SectionCard.tsx`):

```tsx
<SectionCard padding="md">
  <SectionCardHeader title="Přehled" actions={<Button>Filtr</Button>} />
  …
</SectionCard>
```

- Default: `rounded-[var(--wp-radius-card)] bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] shadow-sm`
- Tones: `default`, `muted`, `inset`
- Paddings: `sm` (16px), `md` (20/28px responsive), `lg` (32px)

---

## 4. Modals

Single path: `BaseModal` (`apps/web/src/app/components/BaseModal.tsx`).

Variants:

- Default desktop-centered with `maxWidth` prop (`sm` / `md` / `lg` / `xl` / `2xl`)
- `mobileVariant="sheet"` — bottom sheet on mobile
- `mobileVariant="fullScreen"` — edge-to-edge on mobile
- `fullScreen` prop — edge-to-edge on **all** breakpoints

z-index convention:

- Toasts: `z-[500]`
- Overlays on top of modals (contextual overlays in chat): `z-[400-450]`
- BaseModal: `z-modal` (CSS var, ≈`z-[110]`)
- Sticky headers: `z-30`

Destructive dialogs: use `useConfirm()` hook, not a hand-rolled `fixed inset-0 z-[100]` overlay.

Exceptions (legacy, custom fade/scale animation — do not block PRs):

- `portal/calculators/_components/*/*ContactModal.tsx` — custom fade+scale transition
- `portal/today/DashboardEditable.tsx` customize panel — hero gradient design

---

## 5. Forms

Shared primitives in `apps/web/src/app/components/ui/primitives/`:

- `<Input />` — text inputs, `inputSize="md" | "lg"`
- `<Textarea />`
- `<Select />`
- `<FieldLabel required hint="…">Jméno</FieldLabel>`

All share `min-h-[44px]`, `rounded-xl`, tokenized border + focus ring.

Do not write new `className="w-full px-4 py-3 bg-slate-50 border …"` strings. Use the primitives.

---

## 6. Buttons

| When | Component |
|---|---|
| Primary action (page header, form submit) | `<CreateActionButton>` |
| Generic button (secondary, destructive, ghost) | `<Button>` |
| Primary-styled button with custom shape | `clsx(portalPrimaryButtonClassName, "…")` |
| Icon-only toolbar action | `<Button variant="ghost" size="icon">` |

Minimum touch target: `min-h-[44px]` (mobile) / `min-h-[40px]` (desktop toolbar).

Forbidden: `<button className="bg-indigo-600 …">`. Always go through the button primitives or `portalPrimaryButtonClassName`.

---

## 7. Decision tree

```
Need a page?                         → PortalPageShell
Need a modal?                        → BaseModal
Need to confirm a destructive act?   → useConfirm()
Need a card / panel?                 → SectionCard
Need a text input?                   → <Input />
Need a primary button?               → <CreateActionButton />
Need a color?                        → var(--wp-*)
Need a radius?                       → var(--wp-radius-card) or --wp-radius-modal
```

If none of these fit, talk to the design owner before inventing a new primitive.

---

## 8. Review checklist

Before merging any portal PR:

- [ ] No `bg-slate-*`, `text-slate-*`, `border-slate-*` in `apps/web/src/app/portal/**`
- [ ] No hex color literals in `className`
- [ ] No `fixed inset-0 z-[100]` ad-hoc overlays
- [ ] `rounded-[24px]` replaced with `rounded-[var(--wp-radius-card)]`
- [ ] Page uses `PortalPageShell`
- [ ] Forms use `<Input />` / `<Textarea />` / `<Select />`
