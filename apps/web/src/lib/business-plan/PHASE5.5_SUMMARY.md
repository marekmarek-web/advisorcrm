# Fáze 5.5: Vlastní business plán poradce — shrnutí implementace

## Co bylo implementováno

- **DB:** Tabulky `advisor_business_plans` (tenantId, userId, periodType, year, periodNumber, title, status) a `advisor_business_plan_targets` (planId, metricType, targetValue, unit). Unikátní kombinace (tenantId, userId, periodType, year, periodNumber).
- **Typy a konstanty:** `types.ts` — PeriodType, BusinessPlanMetricType, PlanHealthStatus, MetricUnit, PlanPeriod, MetricProgress, PlanProgress, SlippageRecommendation, getPlanPeriod(), getCurrentPeriodNumbers(), METRIC_TYPE_LABELS, HEALTH_STATUS_LABELS.
- **Metriky:** `metrics.ts` — computeAllMetrics(tenantId, userId, periodStart, periodEnd) z CRM: new_clients, meetings, follow_ups, opportunities_open, deals_closed, volume_hypo, volume_investments, service_activities, production. Vše tenant + userId (advisorId / assignedTo / createdBy).
- **Plnění a health:** `progress.ts` — načte plán + targety, doplní actual z metrics, spočítá health (achieved, exceeded, on_track, slight_slip, significant_slip, no_data) podle elapsed vs actual/target a celkový overallHealth.
- **Doporučení při skluzu:** `recommendations.ts` — z PlanProgress vygeneruje SlippageRecommendation (title, description, gap, actionType, href), řazení: significant_slip, pak slight_slip, podle gap.
- **Server actions:** `business-plan.ts` — listBusinessPlans, getActivePlan(periodType), getPlanWithTargets(planId), getPlanProgress(planId), createBusinessPlan, updateBusinessPlan, deleteBusinessPlan, setPlanTargets, getBusinessPlanWidgetData (pro nástěnku).
- **Stránka:** `/portal/business-plan` — výběr období (měsíc/kvartál/rok), zobrazení aktivního plánu, karty metrik (cíl, skutečnost, progress bar, health), sekce Doporučené akce s CTA, formulář Nastavit/Upravit plán (cíle).
- **Widget na nástěnce:** „Plnění plánu“ — 2–3 metriky + odkaz na `/portal/business-plan`.
- **Sidebar:** Položka „Business plán“ v sekci Obchod a Byznys.
- **Empty/fallback:** Nemá plán → „Zatím nemáš nastavený business plán“, CTA „Nastavit business plán“. Plán bez cílů → „Doplnit cíle“. Metrika bez dat → „—“ a no_data. Nápověda: „Doplněním poradce u smluv se naplní osobní produkce.“

## Vstupy a metriky

- **Primární zdroje:** contracts (advisorId, startDate, segment, premiumAnnual), opportunities (assignedTo, closedAt, closedAs), events (assignedTo, startAt, eventType), tasks (assignedTo, completedAt), meetingNotes (createdBy, meetingAt), contacts (pro new_clients).
- **Pravidla:** Období dle periodType + year + periodNumber; všechny dotazy tenant-scoped a filtr na poradce (userId). Smlouvy bez advisorId se do osobního plánu nepočítají.

## Bezpečnost a izolace

- Všechny dotazy: `eq(tenantId, auth.tenantId)` a `eq(userId, auth.userId)`. V1 pouze vlastní plán; rozšíření pro Manager/Admin (čtení plánů týmu) lze doplnit později.

## Návaznosti a follow-up

- **Snapshoty:** V1 neukládá progress do DB; při každém načtení se přepočítá. Volitelně později tabulka `advisor_metrics_snapshots` a cron pro trendy.
- **Reaktivace:** Metrika reactivations v plánu volitelná; složitější definice, V1 vynechána.
- **Manažerský pohled:** Čtení plánů ostatních userId v tenantu (role Admin/Manager) — rozšíření po V1.

## Checklist (označeno po implementaci)

- [x] Audit vstupních dat pro business plán
- [x] Návrh modelu business plánu (tabulky, typy)
- [x] Definice metrik první verze
- [x] Periodicita a plánovací horizont
- [x] Výpočet plnění a health status
- [x] Doporučení při skluzu
- [x] CTA a workflow návaznost
- [x] UX implementace modulu (stránka + widget)
- [x] Empty a fallback stavy
- [x] Osobní plán vs týmový plán (scope userId)
- [x] Datová čistota a typy
- [x] Auditovatelnost, permissions a tenant izolace
