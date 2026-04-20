# Breach Playbook — GDPR data breach response

**Verze:** v1 · platnost od 2026-04-20 · maintainer: Marek (zakladatel)  
**Interní dokument** — neveřejný. Reference na `/bezpecnost` odkazuje na existenci; obsah je k dispozici v rámci enterprise due diligence na vyžádání (`bezpecnost@aidvisora.cz`).

Tento playbook **doplňuje** [`incident-runbook.md`](./incident-runbook.md), ale **nenahrazuje** ho. Jakmile je jednou aktivován breach flow, **pokračuje paralelně** s běžným provozním incidentem (musíme systém zároveň stabilizovat i notifikovat).

⚠︎ **První 30 minut jsou kritické.** Důsledně dodržuj sekci 3 (Decision tree).

---

## 1. Právní rámec (stručně)

Aidvisora je v roli:

- **zpracovatel** osobních údajů klientů, jejichž **správcem** je poradce / workspace (obsah klientských karet, komunikace, dokumenty, finanční analýzy, smlouvy),
- **správce** osobních údajů samotných poradců a jejich členů týmu (přihlašovací údaje, audit stopa, fakturace).

Relevantní články GDPR:

- **Čl. 4(12)** — definice „porušení zabezpečení osobních údajů".
- **Čl. 33** — oznámení dozorovému úřadu (ÚOOÚ) **bez zbytečného odkladu a pokud možno do 72 hodin**.
- **Čl. 34** — oznámení subjektům údajů **bez zbytečného odkladu, je-li riziko vysoké**.
- **Čl. 28(3)(f)** — závazek zpracovatele notifikovat správce bez zbytečného odkladu.

Dozorovým úřadem pro ČR je **Úřad pro ochranu osobních údajů (ÚOOÚ)**, Pplk. Sochora 27, Praha 7 · [uoou.gov.cz](https://uoou.gov.cz).

## 2. Co je „breach"

GDPR čl. 4 odst. 12:

> porušení zabezpečení, které vede k náhodnému nebo protiprávnímu **zničení, ztrátě, změně, neoprávněnému poskytnutí nebo zpřístupnění** přenášených, uložených nebo jinak zpracovávaných osobních údajů.

**Typické scénáře v Aidvisoře:**

| Scénář | Breach? |
|---|---|
| RLS policy díra — workspace A vidí data workspace B | **ANO** (neoprávněné zpřístupnění) |
| Únik signed URL do dokumentu klienta mimo určeného příjemce | **ANO** |
| Útočník získal přihlašovací údaje poradce (phishing) a přistoupil do workspace | **ANO** |
| DB backup s osobními údaji přístupný neoprávněnou osobou | **ANO** |
| Smazání dat bez možnosti obnovy (i nechtěně) | **ANO** (ztráta) |
| Service-role klíč v public repu, aktivně zneužit | **ANO** |
| Service-role klíč náhodou v logu, ale detekováno dřív než zneužit a rotováno | **Pravděpodobně NE** (nebyla ztráta důvěrnosti, musí být dokumentováno) |
| Uživatel hlásí, že „e-mail přišel pozdě" | **NE** (provozní incident) |
| Vercel měl 5 min výpadek | **NE** (dostupnost, ne důvěrnost/integrita) |

Pokud máš pochybnost → **traktuj jako breach**, notifikace lze do 72 h zúžit / odvolat. Opačně nelze.

## 3. Decision tree (prvních 30 min)

```
                    ┌─ INDIKACE BREACH ─┐
                    │ (report, alert,   │
                    │  vlastní zjištění)│
                    └─────────┬─────────┘
                              ▼
             ┌────────────────────────────────┐
             │ 1. ZACHYŤ ČAS „ZJIŠTĚNO" (t0)  │
             │    — od něj běží 72h lhůta.    │
             └────────────────────────────────┘
                              ▼
             ┌────────────────────────────────┐
             │ 2. ZASTAV ŠÍŘENÍ                │
             │    — rotace klíčů, revoke      │
             │      sessions, stažení URL,    │
             │      pauza webhookem atd.      │
             └────────────────────────────────┘
                              ▼
             ┌────────────────────────────────┐
             │ 3. OSOBNÍ ÚDAJE DOTČENY?       │
             └───────┬────────────────────────┘
                     │
              ┌──────┴──────┐
              NE           ANO
              │             │
              ▼             ▼
        incident flow   ┌─────────────────────────────┐
        (runbook)       │ 4. DOTČENI ZÁKAZNÍCI        │
                        │    (workspace, poradci)?    │
                        │  • ano → notifikace čl. 28  │
                        │  • ano + high risk k subj.  │
                        │    údajů → + čl. 33 a 34    │
                        └──────────────┬──────────────┘
                                       ▼
                        ┌─────────────────────────────┐
                        │ 5. RISK ASSESSMENT          │
                        │    (sekce 5 tohoto dokum.)  │
                        └──────────────┬──────────────┘
                                       ▼
                        ┌─────────────────────────────┐
                        │ 6. NOTIFIKACE               │
                        │    • ÚOOÚ do 72h (čl. 33)   │
                        │    • zákazníci bez odkladu  │
                        │      (čl. 28)               │
                        │    • subjekty údajů, je-li  │
                        │      vysoké riziko (čl. 34) │
                        └──────────────┬──────────────┘
                                       ▼
                        ┌─────────────────────────────┐
                        │ 7. DOKUMENTACE + REVIEW     │
                        │    (sekce 9)                │
                        └─────────────────────────────┘
```

## 4. Forensic collection — nesmažu, nezahladím

**Dřív, než něco mažeš** (klíč, session, log), pořiď záznam:

- **Screenshot / export** stavu aplikace (Supabase auth log, Sentry, Stripe).
- **Kopie relevantních log řádků** (před rotací / retencí) — ulož do privátního incident repu nebo šifrovaného úložiště. NEUKLÁDEJ do běžných pracovních lokalit, kde data mohou expirovat.
- **Uprav hashe / identifikátory** před interní prezentací, neopouštěj osobní údaje dál.
- **Zkopíruj audit log** dotčeného workspace (SELECT do CSV): `billing_audit_log`, `audit_events` (až bude centralizovaný), `auth.audit_log_entries` v Supabase.
- **U Stripe**: export `events` kolem času incidentu (CLI `stripe events list --limit 100 --type ...`).

Retence forenzních dat: **minimálně 5 let** nebo do uzavření regulatorní kontroly, cokoliv je delší.

## 5. Risk assessment — high risk nebo ne?

Notifikace subjektům údajů (čl. 34) je povinná **jen při „pravděpodobně vysokém riziku"**. Matice:

| Dotčená data | Rozsah | Okolnosti | Risk | Povinnost čl. 34 |
|---|---|---|---|---|
| E-maily (samotné) | <100 | žádná známá exploitace | LOW | ne |
| E-maily + jména | <100 | nemáme důkaz exploitace | MEDIUM | zvážit |
| Finanční data klienta (smlouvy, portfolio) | jakýkoliv | ANO | **HIGH** | **ANO** |
| Rodná čísla / OP | jakýkoliv | — | **HIGH** | **ANO** |
| Dokumenty (bankovní výpisy, potvrzení) | jakýkoliv | — | **HIGH** | **ANO** |
| Přihlašovací údaje | jakýkoliv | — | **HIGH** | **ANO** (+ vynucená změna hesla) |
| Interní audit log | <1000 řádků | bez PII | LOW | ne |

Rozhodnutí HIGH/LOW dokumentuj v incident ticketu včetně odůvodnění. Pokud váháš → **zvaž konzultaci s právníkem** před odesláním notifikace.

## 6. Notifikace — jak a komu

### 6.1 Zákazníkům (poradcům / workspace) — čl. 28(3)(f)

**Bez zbytečného odkladu** po zjištění, **nejpozději do 48 hodin**. E-mail odeslat na notifikační e-mail workspace (`tenants.notification_email`) nebo na `support@aidvisora.cz`-registrovaný účet admina.

**Šablona:**

```
Předmět: [Aidvisora · důležité] Oznámení o incidentu týkajícím se vašeho workspace

Vážený/á {{admin_jmeno}},

v roli zpracovatele osobních údajů Vám v souladu s čl. 28 odst. 3 písm. f) GDPR
oznamujeme, že dne {{datum}} v čase {{cas}} jsme zjistili incident s dopadem na
Vás/Váš workspace {{workspace_nazev}}.

Co se stalo:
{{věcný, neutrálně formulovaný popis — bez spekulací}}

Co jsme udělali:
• {{kontejnmentová opatření — rotace klíčů, revoke sessions, …}}
• {{forenzní zajištění}}

Jaká data byla dotčena:
{{kategorie dat; rozsah kvantifikujte, když jde}}

Jaké riziko pro Vás / Vaše klienty vidíme:
{{high / medium / low + odůvodnění}}

Doporučená opatření z Vaší strany:
• {{např. změna hesla, prověření nedávné aktivity, komunikace klientům}}

Pokud je dotčen subjekt údajů (Váš klient) s vysokým rizikem, jsme připraveni
Vám pomoci s komunikací a poskytnout věcné podklady.

Plánujeme {{oznámili jsme / oznámíme do 72h}} ÚOOÚ, pokud splňuje podmínky
čl. 33 GDPR.

Budeme Vás průběžně informovat. Kontakt: bezpecnost@aidvisora.cz.

Za Aidvisora s.r.o.
{{jméno}}
```

Neslibuj nic, co neumíš plnit („nikdy se to nestane znovu"). Neshazuj na 3. stranu bez jistoty.

### 6.2 ÚOOÚ — čl. 33 (do 72h)

Formulář: **[uoou.gov.cz → Oznámení porušení zabezpečení](https://uoou.gov.cz/oznamovani-poruseni-zabezpeceni-osobnich-udaju/d-53127)**.

Obsah musí zahrnovat:

- a) **popis povahy porušení** vč. kategorií a přibližných počtů dotčených osob a záznamů,
- b) **kontaktní údaje** pověřence / kontaktní osoby (_bezpecnost@aidvisora.cz_),
- c) **pravděpodobné důsledky** porušení,
- d) **opatření přijatá nebo navrhovaná** k nápravě a zmírnění.

**Fázovitá notifikace je přípustná** — pokud za 72h nemáš všechny informace, podej oznámení s tím, co víš, a doplň později (čl. 33 odst. 4).

**Šablona úvodu oznámení ÚOOÚ:**

```
Správa / zpracování: Aidvisora s.r.o., IČO 05474434, se sídlem
Vraňany 6, 277 07 Mlčechvosty.

Role v rámci GDPR: {{správce pro údaje poradců/fakturaci
/ zpracovatel pro údaje klientů poradců}}.

Datum a čas zjištění: {{ISO datum + čas CET}}.
Datum a čas vzniku (odhad, pokud jiné): {{…}}.

Povaha porušení: {{ztráta / neoprávněný přístup / neoprávněné zveřejnění / …}}.
Kategorie dotčených osob: {{poradci / jejich klienti / oba}}.
Kategorie dotčených údajů: {{identifikační / kontaktní / finanční / …}}.
Přibližný počet dotčených osob: {{…}} (upřesníme dodatečně).
Přibližný počet dotčených záznamů: {{…}}.

Pravděpodobné důsledky: {{…}}.
Opatření přijatá: {{…}}.
Opatření navrhovaná: {{…}}.

Oznámili jsme / oznámíme dotčené osoby v souladu s čl. 34 GDPR:
{{ano — plánovaný termín / ne — odůvodnění}}.

Pověřenec / kontakt: bezpecnost@aidvisora.cz.
```

### 6.3 Subjektům údajů — čl. 34 (při vysokém riziku)

Kdy:

- vysoké riziko dle sekce 5 (zejm. finanční/zdravotní údaje, úniky dokumentů, přihlašovací údaje),
- nebo to výslovně uloží ÚOOÚ.

Výjimky dle čl. 34 odst. 3:

- údaje byly **dostatečně šifrovány** (přístup bez klíče nebyl možný),
- byla přijata **následná opatření** znemožňující vznik rizika,
- notifikace by vyžadovala **neúměrné úsilí** (pak nahradit veřejným oznámením).

Pokud jdeš notifikovat **přímo**: zvol kanál, kterým subjekt běžně s vámi komunikuje. U klientů poradců **neobcházej poradce** — naopak s ním spolupracuj, pokud situace umožňuje.

**Šablona subjektu údajů (v modifikované lidské verzi, CZ):**

```
Předmět: [Aidvisora] Důležité oznámení týkající se Vašich osobních údajů

Vážená paní / Vážený pane,

v platformě Aidvisora, kterou pro svou poradenskou činnost používá
{{jméno poradce / společnosti}}, došlo dne {{datum}} k bezpečnostnímu
incidentu, při kterém mohlo dojít k neoprávněnému přístupu k Vašim
osobním údajům. Tento dopis je zasílán v souladu s čl. 34 GDPR.

Dotčené údaje: {{seznam}}
Možné riziko pro Vás: {{popis — např. phishing se znalostí finančního
produktu, zneužití ke kontaktování, …}}

Jak jsme reagovali: {{popis opatření}}.
Co doporučujeme Vám: {{např. nikdy neklikat na podezřelé odkazy
napodobující Vašeho poradce, změnit heslo, …}}.

Kontakt pro dotazy: bezpecnost@aidvisora.cz, alternativně přímo
Váš poradce {{jméno}}.

S omluvou za vzniklé znepokojení,
Aidvisora s.r.o.
```

## 7. Lhůty — shrnutí

| Co | Kdy | Komu |
|---|---|---|
| Zachytit t0 („zjištění") | okamžitě | interně |
| Containment (zastavit šíření) | **do 30 min** | interně |
| Notifikace zákazníků (čl. 28) | **bez zbytečného odkladu**, max. 48h | workspace adminům |
| Notifikace ÚOOÚ (čl. 33) | **do 72 hodin** | ÚOOÚ formulář |
| Notifikace subjektů údajů (čl. 34) | **bez zbytečného odkladu** při high risk | přímo / přes poradce |
| Post-incident review | do **5 pracovních dnů** | interně + shrnutí zákazníkům |

**Pokud 72h lhůta projde bez notifikace**, oznámení ÚOOÚ **i tak pošli** a uveď důvod zpoždění (čl. 33 odst. 1 věta druhá).

## 8. Rotace a credential hygiene (containment toolkit)

Při podezření na kompromitaci:

| Zdroj | Jak rotovat |
|---|---|
| Supabase `service_role_key` | Dashboard → Settings → API → Reset. Aktualizuj Vercel env `SUPABASE_SERVICE_ROLE_KEY`, redeploy. |
| Supabase JWT secret | Dashboard → Settings → Auth → JWT Secret → Rotate. **Pozor:** invaliduje všechny existující session, uživatelé se musí odhlásit. |
| Stripe `STRIPE_SECRET_KEY` | Dashboard → Developers → API keys → **Roll**. Starý klíč zneplatní po nastavené době (default 12h). Aktualizuj Vercel, redeploy. |
| Stripe `STRIPE_WEBHOOK_SECRET` | Dashboard → Developers → Webhooks → endpoint detail → **Roll secret**. Aktualizuj Vercel, redeploy. |
| Sentry DSN | Sentry → Settings → Client Keys → Revoke + New. |
| Vercel deploy hook / API token | Vercel → Account Settings → Tokens → Revoke + New. |
| OAuth secrets (Google) | Google Cloud Console → Credentials → Reset client secret. |
| E-mailové účty (support, bezpecnost) | Google Workspace admin → změna hesla + invalidace session. |

Dokumentuj **kdy** byla rotace provedena (UTC) a kdo. Tyto záznamy se objeví v post-mortemu a v ÚOOÚ notifikaci (sekce „opatření přijatá").

## 9. Evidence porušení (register of breaches)

GDPR čl. 33 odst. 5 vyžaduje, aby správce **dokumentoval všechna porušení**, bez ohledu na to, jestli jdou notifikovat ÚOOÚ.

Místo evidence: `docs/breach-log/` v privátním repu. Jeden MD soubor na incident:

```
docs/breach-log/YYYY-MM-DD-<slug>.md
```

Struktura:

```markdown
# Breach — <název>

- Zjištěno: YYYY-MM-DD HH:MM CET
- Zjistil/a: <jméno>
- Zdroj zjištění: <alert / user report / vlastní audit>
- Povaha: <ztráta / neoprávněný přístup / …>
- Dotčené údaje: <kategorie + kvantita>
- Role Aidvisora: <správce / zpracovatel / oba>
- Risk level: LOW / MEDIUM / HIGH
- Notifikace zákazníkům (čl. 28): <kdy, komu>
- Notifikace ÚOOÚ (čl. 33): <kdy, číslo podání>
- Notifikace subjektů (čl. 34): <kdy / nerelevantní + odůvodnění>
- Kontejnment: <popis + čas>
- Rotované credentials: <seznam>
- Root cause: <…>
- Follow-up opatření: <…>
- Post-mortem link: <…>
```

Retence tohoto logu: **minimálně 5 let** po uzavření incidentu.

## 10. Na co si dát pozor (pragmatické memo)

- **Nepiš nikdy, že „k úniku nedošlo"**, dokud nemáš důkaz — lepší je „nemáme indikaci úniku, ale …".
- **Nepředávej dotčeným subjektům údajů zbytečné technické detaily** — vytváří to podklad pro imitaci útoku.
- **Vždy mluv o tom v 1. osobě jednotné** (Aidvisora), ne v množném — jasnější odpovědnost.
- **Pokud něco nevíš, napiš to.** „V tuto chvíli nedokážeme potvrdit …, budeme Vás informovat do XX." je lepší než spekulace.
- **Právník ti může pomoct _před_ notifikací** — zejména s formulacemi subjektům. Neřeš jazyk sám v panice.

## 11. Review tohoto playbooku

- **Ročně** (duben) + po každém skutečném breach eventu.
- Po jakékoliv změně GDPR / zákona o zpracování osobních údajů / relevantní judikatury ÚOOÚ.

---

_Dotazy na tento playbook: [`bezpecnost@aidvisora.cz`](mailto:bezpecnost@aidvisora.cz)._
