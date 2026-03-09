# Compliance – mapování na regulace (ČR)

## GDPR

- **Správce:** poradenská firma (tenant). **Zpracovatel:** provozovatel aplikace (Advisor CRM). DPA šablona v `/legal/DPA_template.md`. DPIA šablona v `/legal/DPIA_template.md`.
- **Funkce:** evidence účelů (processing_purposes), souhlasy (consents), retence (retention_months). Export osobních dat klienta (JSON + PDF). Workflow žádosti o výmaz (evidence + výmaz/anonymizace).

## Distribuce pojištění (IDD)

- Povinný „záznam z jednání“: meeting_notes s povinnými položkami (čas, účastníci, obsah, doména, doporučení, další kroky). Verze a archivace. Export „compliance balíčku“ pro klienta (ZIP: PDF summary + logy + seznam dokumentů).

## Spotřebitelský úvěr / hypotéky

- U modelací a meeting note evidence „co bylo prezentováno“ (timestamp, verze). Disclaimery jako šablona textu připojená k exportu.

## AML

- AMLChecklist entita: kdo/kdy provedl identifikaci nebo kontrolu dokladů. Audit záznamů.

## eIDAS

- MVP bez integrace podpisu. Datový model připraven: SignatureRequest, EvidencePackage (Phase 2).

## DORA

- Incident log (incident_logs) + jednoduché UI. Dokumentace backup/restore v SECURITY.md.
