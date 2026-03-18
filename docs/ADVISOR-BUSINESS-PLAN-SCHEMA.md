# Business plán poradce – datový návrh

Tento dokument popisuje existující schéma a mapování metrik na zdrojové entity. Klientský datový model (contacts, contracts, opportunities, …) zůstává zdrojem dat; business plán pouze agreguje a cílí.

## Existující tabulky

### advisor_business_plans

- **id**, tenant_id, user_id, period_type (`month` | `quarter` | `year`), year, period_number (1–12 měsíc, 1–4 kvartál, 0 rok), title, status (`active` | `archived`), created_at, updated_at.
- Unikátní: (tenant_id, user_id, period_type, year, period_number).

### advisor_business_plan_targets

- **id**, plan_id (FK → advisor_business_plans), metric_type (text), target_value, unit (`count` | `czk` | `pct`), created_at, updated_at.

## Mapování metrik na zdrojové entity

Metriky pro cíle a pozdější výpočet plnění vycházejí z těchto tabulek:

| Metrika (příklady) | Zdroj | Poznámka |
|--------------------|--------|----------|
| Počet nových klientů | `contacts` (created_at v období) | Filtrovat dle tenant_id, případně lead_source. |
| Počet schůzek | `events` (event_type = schuzka), `meeting_notes` | Filtrovat dle období (start_at, meeting_at), přiřazení dle assigned_to / created_by. |
| Počet follow-upů / úkolů | `tasks` (completed_at v období nebo created) | assigned_to pro poradce. |
| Počet doporučení | `contacts.referral_contact_id` | Počet kontaktů s vyplněným referral v období. |
| Počet rozpracovaných obchodů | `opportunities` (closed_at IS NULL) | stage_id, assigned_to. |
| Počet uzavřených obchodů | `opportunities` (closed_at v období, closed_as = 'won') | assigned_to. |
| Objem hypoték / investic | `contracts` (segment HYPO, INV, DIP, DPS) | premium_amount / premium_annual, created_at nebo start_date v období. |
| Servisní aktivita | `contacts` (last_service_date, next_service_due), `contact_coverage` | Počet servisních událostí nebo klientů obsloužených. |
| Retence / reaktivace | `contacts` (lifecycle_stage změny) | Eventuálně activity_log nebo historie. |
| Produkce / provize | `contracts`, eventuálně budoucí tabulka provizí | Pokud bude v systému. |

- **Automatické metriky:** počty a součty z výše uvedených tabulek dle období a přiřazení (user_id / assigned_to).
- **Ručně nastavované:** cíle v `advisor_business_plan_targets` (target_value, metric_type, unit).

## Oddělení od klientského modelu

- **Klientský model:** contacts, contracts, opportunities, tasks, events, meeting_notes, financial_analyses — zdroj dat.
- **Poradenský model:** advisor_business_plans, advisor_business_plan_targets — pouze cíle a později (volitelně) snapshoty plnění. Žádná duplikace klientských údajů; plnění se vždy počítá z výše uvedených zdrojů.

## Budoucí rozšíření (návrh)

- **advisor_business_plan_progress** nebo **advisor_metrics_snapshots:** periodické ukládání vypočtených hodnot (period_key, metric_type, value, computed_at) pro zobrazení plnění a trendů. Naplňování jobem nebo on-demand při otevření modulu.
- **metric_type** v targets by měl odpovídat klíčům používaným v agregacích (např. `new_clients`, `meetings`, `closed_deals`, `production_volume`).

## Odkazy

- [SOURCES-OF-TRUTH.md](./SOURCES-OF-TRUTH.md) — zdroje pravdy pro klientská data
- `packages/db/src/schema/advisor-business-plan.ts` — definice tabulek
- `team_goals` — týmové cíle (tenant-level); business plán je na úrovni poradce (user_id).
