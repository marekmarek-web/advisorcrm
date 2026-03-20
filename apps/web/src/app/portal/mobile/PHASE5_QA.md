# Phase 5 QA Matrix

## Functional matrix

- [ ] Contact AI bundle generates unified contract (`summary/recommendations/actions/confidence/warnings`).
- [ ] Contact AI bundle shows partial output when one generation fails.
- [ ] AI action creation blocks on `DUPLICATE_CONFLICT` and allows explicit override retry.
- [ ] Idempotency guard blocks immediate duplicate submits on same action key.
- [ ] Team follow-up execution includes source-surface metadata and remains role-safe.
- [ ] Client assistant endpoint rejects non-client role.
- [ ] Client assistant endpoint enforces rate limit (`429` + `Retry-After`).
- [ ] Client AI panel supports message send, response render, fallback actions.
- [ ] Contract apply result includes bridge suggestions and renders CTA links.

## Regression smoke

- [ ] Existing AI generation actions still return legacy `GenResult`.
- [ ] Existing AI action menu still creates task/meeting/deal/service action in happy path.
- [ ] Team summary feedback still submits successfully.
- [ ] Contract review approve/reject/apply flow unchanged except bridge augmentation.
- [ ] Mobile shells render with no layout regressions for AI cards on <= 390px width.

## Staged beta rollout

1. Internal advisors (`mobile_ui_v1_beta` enabled):
   - monitor duplicate-conflict ratio and idempotency-conflict ratio.
2. Selected client beta cohort:
   - monitor client-assistant requests, success rate, fallback rate.
3. Wider beta:
   - adoption target: >= 25% weekly active usage on at least one AI entry point.
   - error budget: <= 2% 5xx on AI endpoints, <= 5% fallback responses.

## Metrics to monitor

- Endpoint success rate:
  - `/api/ai/assistant/chat`
  - `/api/ai/client-assistant/chat`
- Conflict signals:
  - `ai_automation_conflict` audit events.
- Execution signals:
  - `ai_automation_execute` audit events.
- UX adoption:
  - number of created entities from AI actions per day.
