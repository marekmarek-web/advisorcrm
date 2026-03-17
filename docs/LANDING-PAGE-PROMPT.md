# Aidvisora – prompt pro hlavní stránku (Gemini)

Tento dokument shrnuje, co Aidvisora je, co umí a v čem je výjimečná. Slouží jako vstupní prompt pro generování/vybudování hlavní (landing) stránky. Aktuálně máme jen přihlašovací stránku a dashboard; hlavní stránka má představit produkt a přivést návštěvníky k registraci nebo přihlášení.

---

## Co je Aidvisora

**Aidvisora** je **CRM pro finanční poradce v České republice**. Cílí na poradenské firmy a samostatné poradce, kteří pracují s klienty v oblastech **hypotéky, investice a pojištění**. Aplikace je navržená jako **multi-tenant** (jedna „firma“ = jeden tenant), s rolemi Admin, Manager, Advisor, Viewer a **klientským portálem** pro koncové klienty.

---

## Co Aidvisora umí (funkce)

### Pro poradce (portál / dashboard)

- **Kontakty a domácnosti** – evidence klientů, firem (IČO/DIČ), domácností a vztahů mezi nimi. Timeline aktivit: hovory, e-maily, schůzky, poznámky a přílohy.
- **Pipeline (obchody)** – Kanban board i list. Stavy příležitostí (Lead, Kvalifikace, Nabídka, Vyjednávání, Uzavřeno). Typy: Hypotéka, Investice, Pojištění. Pravděpodobnost a úkoly podle stavu.
- **Úkoly a kalendář** – události na klienta/případ, „schůzky dnes“, úkoly k splnění. Propojení s kalendářem a rezervacemi.
- **Meeting notes (záznamy z jednání)** – strukturované zápisy dle šablon (hypo, investice, pojištění), povinné položky, verze a archivace. Export „Client summary“ do PDF.
- **Dokumenty** – nahrávání na klienta/případ, audit (kdo nahrál/stáhl/smazal), vyhledávání dle názvu/tagu.
- **Smlouvy a review** – nahrávání smluv, fronta na kontrolu (review), propojení s AI asistentem (např. extrakce dat ze smlouvy, doporučené akce).
- **Produkce (KPI)** – přehled produkce po segmentech a partnerech (pojistné, roční ekvivalent), grafy, export do CSV. Období: měsíc, kvartál, rok.
- **Kalkulačky** – hypotéka, investice, penze, životní pojištění (v portálu).
- **Analýzy** – finanční analýzy na klienta (např. fáze 1), přehled analýz a detail.
- **Mindmap** – vizualizace vztahů klientů a domácností, navigace na kontakty/případy.
- **Tým** – přehled členů týmu (team overview), kalendář týmu, AI shrnutí týmu (team summary) za období.
- **Zprávy (messenger)** – komunikace poradce s klienty (konverzace, přílohy). Klient má vlastní zobrazení zpráv v klientském portálu.
- **Import** – CSV/XLS import kontaktů, šablona, mapování sloupců, detekce duplicit (e-mail/telefon) a merge.
- **GDPR a compliance** – účely zpracování, souhlasy, export osobních dat (JSON + PDF), workflow výmaz. Záznam z jednání dle IDD, audit log, compliance balíček (ZIP). Příprava na AML/eIDAS (Phase 2).

### Pro klienty (klientský portál / Client Zone)

- **Klientský dashboard** – přehled: smlouvy, dokumenty, platební instrukce. Odkazy na sekce Smlouvy, Dokumenty, Zprávy, Profil.
- **Smlouvy** – seznam smluv přiřazených klientovi.
- **Dokumenty** – dokumenty ke stažení.
- **Zprávy** – chat/konverzace s poradcem (stejný systém jako v portálu poradce, pohled klienta).
- **Profil** – údaje klienta, odhlášení od notifikací, export vlastních dat (GDPR).
- **Rezervace / odkaz na kalendář** – poradce může sdílet odkaz na rezervaci (např. `/portal/calendar`).

### AI a automatizace

- **AI asistent v portálu** – chat s kontextem z CRM (urgentní úkoly, smlouvy čekající na review, klienti vyžadující pozornost). Navrhované akce: otevřít review smlouvy, přejít na klienta, úkoly. Možnost nahrát smlouvu (PDF) – asistent extrahuje údaje a doporučí další kroky.
- **Dashboard summary (AI)** – shrnutí „dnes“ pro poradce (priorita úkolů, smlouvy, klienti).
- **Team summary (AI)** – shrnutí týmu za zvolené období (aktivita, metriky).
- **Import kontaktů přes asistenta** – upload CSV/Excel, mapování sloupců, náhled a import s dopomocí AI.

---

## V čem je Aidvisora výjimečná

1. **CRM šitá na míru finančním poradcům v ČR** – domácnosti, typy obchodů (hypo/investice/pojištění), meeting notes se šablonami a compliance (IDD, záznam z jednání, audit).
2. **Dva světy v jedné aplikaci** – plnohodnotný portál pro poradce (kontakty, pipeline, kalendář, úkoly, dokumenty, smlouvy, produkce, tým, mindmap, kalkulačky, analýzy) **a** klientský portál pro koncové klienty (přehled, smlouvy, dokumenty, zprávy s poradcem, profil).
3. **AI asistent přímo v CRM** – ne jen chat, ale kontext z úkolů, smluv a klientů; navrhované akce a podpora při review smluv a importu kontaktů; AI shrnutí dashboardu a týmu.
4. **Compliance a bezpečnost od začátku** – multi-tenant izolace, RBAC (Admin, Manager, Advisor, Viewer), MFA (TOTP), audit log, GDPR (účely, souhlasy, export, výmaz), příprava na regulace (IDD, spotřebitelský úvěr, AML, eIDAS).
5. **Produkce a přehledy** – produkce po segmentech a partnerech, týmový přehled a kalendář, finanční analýzy na klienta.
6. **Komunikace poradce–klient** – zprávy (messenger) mezi poradcem a klientem; klient vše vidí v jednom klientském dashboardu včetně chatů.
7. **Moderní stack a nasazení** – Next.js (App Router), TypeScript, Tailwind, shadcn/ui, Supabase (Postgres, Auth, Storage), Vercel; responzivní a mobile-first dle pravidel projektu.

---

## Co má hlavní stránka splňovat (návod pro Gemini)

- **Účel:** Představit Aidvisoru jako CRM pro finanční poradce v ČR a přivést návštěvníka k přihlášení nebo registraci. Nyní existuje jen přihlašovací stránka a po přihlášení dashboard (resp. přesměrování na `/portal/today`).
- **Cílová skupina:** Finanční poradci, poradenské firmy, případně klienti (sekundárně – dozvědět se, že mají k dispozici klientský portál).
- **Hlavní sdělení:** Jedna platforma pro práci s klienty (kontakty, pipeline, schůzky, dokumenty, smlouvy, produkce) **a** pro klienty (přehled, smlouvy, dokumenty, chat s poradcem). S důrazem na compliance, AI asistenta a český kontext.
- **Tón:** Profesionální, důvěryhodný, srozumitelný. Žádný „generic AI slajdový“ vzhled – viz designová pravidla projektu (responsive, mobile-first, konzistentní breakpointy).
- **CTA:** Přihlásit se / Otevřít portál; případně „Pro klienty“ odkaz na klientské přihlášení, pokud je oddělené.
- **Sekce, které může hlavní stránka obsahovat (inspirace):**  
  - Hero s názvem a krátkým popisem (CRM pro finanční poradce v ČR).  
  - Pro koho (poradci vs. klienti).  
  - Klíčové funkce (kontakty a domácnosti, pipeline, kalendář a úkoly, meeting notes, dokumenty a smlouvy, produkce, tým, klientský portál, zprávy s poradcem).  
  - AI asistent (kontext z CRM, review smluv, shrnutí dne/týmu).  
  - Compliance a bezpečnost (GDPR, audit, multi-tenant, role).  
  - CTA k přihlášení / registraci.  
  - Patička (právní odkazy, kontakt – podle toho, co v projektu existuje).

---

## Technické poznámky pro implementaci

- Přihlašovací stránka je na kořenové route (`/`), komponenta `LandingLoginPage`. Po přihlášení uživatel jde na `/portal` (resp. `/portal/today`). Klienti s rolí `Client` mohou být směrováni na `/client`.
- Názvy cest v aplikaci: `/portal/*` (portál poradce), `/client/*` (klientský portál). Hlavní stránka by měla být atraktivní landing před tím, než uživatel klikne na „Přihlásit se“ nebo „Otevřít portál“.
