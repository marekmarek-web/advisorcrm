import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  FileText,
  Headset,
  Lock,
  Mail,
  Server,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  LEGAL_ADDRESS_LINE,
  LEGAL_COMPANY_NAME,
  LEGAL_DIC_PENDING_NOTE,
  LEGAL_EFFECTIVE_CS,
  LEGAL_ICO,
  LEGAL_SECURITY_EMAIL,
  LEGAL_SUPPORT_EMAIL,
} from "@/app/legal/legal-meta";
import { LegalSubprocessorsTable } from "@/app/legal/LegalSubprocessorsTable";

export const metadata: Metadata = {
  title: "Bezpečnost a ochrana dat | Aidvisora",
  description:
    "Přehled bezpečnostních opatření platformy Aidvisora — data v EU, řízení přístupu, izolace workspaců, audit stopa, AI governance a seznam subdodavatelů. Poctivý stav podle reality k datu účinnosti.",
  alternates: { canonical: "/bezpecnost" },
  robots: { index: true, follow: true },
};

type StatusKind = "live" | "soon" | "roadmap";

function StatusBadge({ status }: { status: StatusKind }) {
  const label =
    status === "live" ? "Dostupné" : status === "soon" ? "V přípravě" : "Roadmap";
  const Icon =
    status === "live" ? CheckCircle2 : status === "soon" ? Clock : AlertTriangle;
  const palette =
    status === "live"
      ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
      : status === "soon"
        ? "bg-amber-500/10 text-amber-200 border-amber-500/20"
        : "bg-slate-500/10 text-slate-300 border-slate-500/20";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${palette}`}
    >
      <Icon size={12} aria-hidden /> {label}
    </span>
  );
}

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-8">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-300">
        {eyebrow}
      </p>
      <h2 className="font-jakarta text-2xl font-bold text-white md:text-3xl">{title}</h2>
      {subtitle ? (
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-400 md:text-base">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

function TopicCard({
  icon: Icon,
  title,
  status,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
  title: string;
  status: StatusKind;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 md:p-7">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-indigo-300">
            <Icon size={20} aria-hidden />
          </span>
          <h3 className="font-jakarta text-lg font-bold text-white">{title}</h3>
        </div>
        <StatusBadge status={status} />
      </header>
      <div className="space-y-2 text-sm leading-relaxed text-slate-300">{children}</div>
    </article>
  );
}

export default function BezpecnostPage() {
  return (
    <main className="relative min-h-screen bg-[#0a0f29] text-slate-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-gradient-to-b from-indigo-500/10 via-transparent to-transparent" />

      <div className="relative mx-auto max-w-5xl px-5 pb-24 pt-16 sm:px-6 md:pt-20">
        <header className="mb-14 md:mb-20">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300">
            <ShieldCheck size={14} className="text-emerald-400" aria-hidden />
            Bezpečnost · přehled
          </div>
          <h1 className="font-jakarta text-3xl font-bold leading-tight text-white md:text-5xl">
            Jak chráníme data klientů vašich poradců.
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-relaxed text-slate-400 md:text-lg">
            Tento přehled shrnuje, co v Aidvisoře platí <strong className="text-white">dnes</strong> a co je{" "}
            <strong className="text-white">v přípravě před ostrým launchem</strong>. Neuvádíme nic, co bychom
            neprováděli, a u položek v přípravě to výslovně označujeme. Formální bezpečnostní whitepaper ve
            verzi PDF pro due diligence zveřejníme společně se startem pilotního provozu.
          </p>
          <p className="mt-3 text-xs text-slate-500">
            Platnost přehledu ke dni {LEGAL_EFFECTIVE_CS}. Průběžně aktualizujeme.
          </p>
        </header>

        {/* --- 1. DATA A JEJICH UMÍSTĚNÍ --- */}
        <section id="data" className="mb-16 scroll-mt-20">
          <SectionHeading
            eyebrow="1 · Data a jejich umístění"
            title="Data v EU, šifrovaný přenos i úložiště."
            subtitle="Databázi, autentizaci a úložiště dokumentů provozujeme u Supabase v regionu EU. Aplikační vrstva běží na Vercelu s evropskými edge uzly. Přenos dat je šifrován TLS; úložiště na úrovni poskytovatele standardně AES-256."
          />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <TopicCard icon={Database} title="PostgreSQL v EU regionu" status="live">
              <p>
                Produkční databáze hostovaná u Supabase v EU regionu. Zabezpečený přístup přes omezené role;
                service-role klíče jsou drženy v šifrovaných environmentových proměnných platformy.
              </p>
            </TopicCard>
            <TopicCard icon={FileText} title="Úložiště dokumentů" status="live">
              <p>
                Objektové úložiště Supabase Storage s privátními buckety. Soubory jsou přístupné výhradně přes
                krátkodobé podepsané URL vázané na konkrétní workspace.
              </p>
            </TopicCard>
            <TopicCard icon={Lock} title="Šifrování přenosu (TLS)" status="live">
              <p>
                Veškerá komunikace mezi prohlížečem, API a službami probíhá po TLS 1.2+. HTTP redirect na HTTPS
                je vynucen na úrovni hostingu.
              </p>
            </TopicCard>
            <TopicCard icon={Lock} title="Column-level šifrování citlivých údajů" status="soon">
              <p>
                Pro čísla OP a rodná čísla doplňujeme aplikační šifrování (pgcrypto / Supabase Vault) před
                ostrým spouštěním. Do té doby jsou tyto sloupce prakticky nepoužívány v produkčních záznamech;
                stav a rozsah dokumentujeme v rámci due diligence.
              </p>
            </TopicCard>
          </div>
        </section>

        {/* --- 2. IDENTITA A PŘÍSTUP --- */}
        <section id="identita" className="mb-16 scroll-mt-20">
          <SectionHeading
            eyebrow="2 · Identita a přístup"
            title="Každý uživatel ověřený, každá akce dohledatelná."
          />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <TopicCard icon={Users} title="Autentizace a role" status="live">
              <p>
                E-mail a heslo, OAuth (Google) a magic-link přihlášení. Role Manažer / Poradce / Asistent
                oddělují přístup k datům a funkcím na úrovni workspace.
              </p>
            </TopicCard>
            <TopicCard icon={ShieldCheck} title="Dvoufaktorová autentizace (TOTP)" status="soon">
              <p>
                Zapínáme pro portál poradce jako povinnou před veřejným launchem. U klientského portálu
                zpřístupníme jako volitelnou.
              </p>
            </TopicCard>
            <TopicCard icon={Clock} title="Správa relací a zařízení" status="live">
              <p>
                Aktivní relace lze prohlížet a ukončit (globální odhlášení). E-mail verifikace a rate-limiting
                na přihlášení a reset hesla brání zneužití.
              </p>
            </TopicCard>
            <TopicCard icon={Users} title="Admin impersonation" status="soon">
              <p>
                Zástup zákaznickou podporou bude časově omezený, auditovaný a s viditelným bannerem v cílovém
                workspace. Politiku připravujeme v podobě interního runbooku.
              </p>
            </TopicCard>
          </div>
        </section>

        {/* --- 3. IZOLACE NÁJEMCŮ --- */}
        <section id="izolace" className="mb-16 scroll-mt-20">
          <SectionHeading
            eyebrow="3 · Izolace workspaců (multi-tenant)"
            title="Data jednoho poradce nikdy nevidí jiný poradce."
            subtitle="Každý workspace má oddělený datový prostor v rámci databáze. Bezpečnost je vynucována na úrovni databáze (Row Level Security) a na úrovni úložiště dokumentů."
          />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <TopicCard icon={Database} title="Row Level Security v DB" status="live">
              <p>
                Citlivé tabulky jsou chráněné politikami RLS vázanými na identitu a workspace. Service-role
                volání mají na serveru explicitní workspace scoping.
              </p>
            </TopicCard>
            <TopicCard icon={ShieldCheck} title="Nezávislý RLS audit + test" status="soon">
              <p>
                Průběžně provádíme auditní pokrytí všech tabulek s PII a finančními daty a automatizovaný test
                izolace nájemců (A → B). Kompletní rozsah dokončíme před ostrým spouštěním; výstup je k dispozici
                pro enterprise due diligence.
              </p>
            </TopicCard>
            <TopicCard icon={FileText} title="Podepsané URL pro dokumenty" status="live">
              <p>
                Stahování a náhled dokumentů probíhá výhradně přes krátkodobě platné podepsané URL vázané na
                workspace a uživatele. Veřejně dostupné URL k dokumentům nevystavujeme.
              </p>
            </TopicCard>
            <TopicCard icon={Lock} title="Audit stopa přístupu k dokumentům" status="soon">
              <p>
                Záznam generování podepsaných URL a exportů rozšiřujeme o jednotný audit log, který bude
                součástí přehledu pro enterprise kupující.
              </p>
            </TopicCard>
          </div>
        </section>

        {/* --- 4. AUDIT, MONITORING, ZÁLOHY --- */}
        <section id="audit" className="mb-16 scroll-mt-20">
          <SectionHeading
            eyebrow="4 · Audit, monitoring a obnova"
            title="Když se něco stane, víme co, kdy a kdo."
          />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <TopicCard icon={FileText} title="Audit log citlivých akcí" status="soon">
              <p>
                Centrální tabulka <code className="rounded bg-white/10 px-1 text-xs">audit_events</code> pro
                přihlášení, změnu oprávnění, přístup k dokumentům, export a impersonation. Zavádíme postupně
                napříč aplikací s cílem plného pokrytí k launchi.
              </p>
            </TopicCard>
            <TopicCard icon={Server} title="Monitoring chyb a výkonu" status="live">
              <p>
                Chyby a regresní incidenty zaznamenáváme v Sentry s upozorněním v reálném čase. Sledujeme
                dostupnost klíčových částí aplikace.
              </p>
            </TopicCard>
            <TopicCard icon={Clock} title="Zálohy a Point-in-Time Recovery" status="live">
              <p>
                Využíváme PITR u databázového poskytovatele v rozsahu 7–14 dní dle plánu. Obnovu dat umíme
                zacílit na konkrétní časový bod.
              </p>
            </TopicCard>
            <TopicCard icon={ShieldCheck} title="Pravidelný restore drill" status="soon">
              <p>
                Ověření obnovy do oddělené instance zavádíme jako měsíční kontrolní běh a dokumentujeme jeho
                výsledek; stav je k dispozici v rámci enterprise due diligence.
              </p>
            </TopicCard>
            <TopicCard icon={AlertTriangle} title="Incident response runbook" status="live">
              <p>
                Interní runbook s klasifikací incidentů (P0–P3), reakčními lhůtami, rollback postupy pro
                aplikaci, databázi i platební bránu a šablonami komunikace. Dostupný pro enterprise due
                diligence na vyžádání (
                <a
                  href={`mailto:${LEGAL_SECURITY_EMAIL}?subject=Security%20%E2%80%93%20runbook`}
                  className="text-indigo-300 underline underline-offset-4"
                >
                  {LEGAL_SECURITY_EMAIL}
                </a>
                ).
              </p>
            </TopicCard>
            <TopicCard icon={ShieldCheck} title="Breach playbook (GDPR čl. 33 a 34)" status="live">
              <p>
                Samostatný playbook pro porušení zabezpečení osobních údajů — decision tree, 72h notifikační
                lhůta ÚOOÚ, šablony pro zákazníky i subjekty údajů, forenzní sběr a credential rotace.
                Dostupný na vyžádání v rámci due diligence.
              </p>
            </TopicCard>
            <TopicCard icon={FileText} title="Sentry alerty a monitoring playbook" status="live">
              <p>
                Katalog produkčních alertů (5xx spike, webhook failure, auth burst, LLM cost anomaly, DB
                saturation) s mapováním na konkrétní kroky v runbooku. Průběžně rozšiřujeme s růstem
                aplikace.
              </p>
            </TopicCard>
            <TopicCard icon={Headset} title="Veřejná status stránka" status="soon">
              <p>
                Veřejnou statuspage s historií incidentů a plánovaných údržeb otevřeme spolu se začátkem
                placeného provozu. Do té doby o incidentech informujeme dotčené workspace adminy e-mailem.
              </p>
            </TopicCard>
          </div>
        </section>

        {/* --- 5. AI GOVERNANCE --- */}
        <section id="ai" className="mb-16 scroll-mt-20">
          <SectionHeading
            eyebrow="5 · AI governance"
            title="AI navrhuje, poradce rozhoduje."
            subtitle="AI v Aidvisoře neposkytuje doporučení finančního produktu klientovi. Slouží jako pomůcka pro poradce při extrakci dat a draftech. Finální odpovědnost vždy nese poradce."
          />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <TopicCard icon={ShieldCheck} title="Human-in-the-loop" status="live">
              <p>
                U AI návrhů směřujících ke klientovi (e-maily, zpráva, úprava klientské karty) je požadováno
                potvrzení poradce. V aplikaci je k AI výstupům zobrazeno upozornění, že jde o pomocný podklad.
              </p>
            </TopicCard>
            <TopicCard icon={FileText} title="Evidence AI akcí" status="soon">
              <p>
                Zaznamenáváme model, spotřebu tokenů, náklady a identifikaci uživatele a workspace.{" "}
                Rozšiřování audit logu napříč všemi AI trasami dokončujeme před ostrým spouštěním.
              </p>
            </TopicCard>
            <TopicCard icon={Lock} title="Rozpočty a limity" status="live">
              <p>
                Každý workspace má měsíční limit na interní AI náklady a ochranné limity proti runaway použití.
                Limit je viditelný v nastavení.
              </p>
            </TopicCard>
            <TopicCard icon={AlertTriangle} title="Obrana proti prompt injection" status="soon">
              <p>
                Rozdělení rolí system / user, sanitizace uploadovaných PDF před předáním modelu a izolace
                technických instrukcí od klientských vstupů. Rozsah testů rozšiřujeme průběžně.
              </p>
            </TopicCard>
          </div>
        </section>

        {/* --- 6. DODAVATELÉ / SUBPROCESSORS --- */}
        <section id="subdodavatele" className="mb-16 scroll-mt-20">
          <SectionHeading
            eyebrow="6 · Subdodavatelé"
            title="S kým a proč zpracováváme data."
            subtitle="Úplný a právně závazný přehled je součástí Zpracovatelské smlouvy (DPA) a Zásad zpracování osobních údajů. Níže je orientační souhrn."
          />
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 md:p-7">
            {/* LegalSubprocessorsTable interně používá prose styly z legal stránek; obalíme jej prose-invert, aby seděl na tmavé pozadí. */}
            <div className="prose prose-invert prose-sm max-w-none prose-th:text-white prose-td:text-slate-300 prose-h2:text-white">
              <LegalSubprocessorsTable />
            </div>
            <p className="mt-4 text-xs text-slate-500">
              Potřebujete-li aktualizovaný nebo kompletní seznam pro due diligence, vyžádejte si jej e-mailem
              na{" "}
              <a
                href={`mailto:${LEGAL_SUPPORT_EMAIL}?subject=Security%20%E2%80%93%20subdodavatel%C3%A9`}
                className="text-indigo-300 underline underline-offset-4"
              >
                {LEGAL_SUPPORT_EMAIL}
              </a>
              .
            </p>
          </div>
        </section>

        {/* --- 7. PRÁVNÍ DOKUMENTY --- */}
        <section id="dokumenty" className="mb-16 scroll-mt-20">
          <SectionHeading
            eyebrow="7 · Dokumenty ke stažení"
            title="Právní a smluvní rámec."
          />
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[
              { href: "/terms", title: "Obchodní podmínky (VOP)", hint: "Práva a povinnosti poskytování služby." },
              { href: "/privacy", title: "Zásady zpracování osobních údajů", hint: "Informace dle GDPR, retenční doby, práva subjektů údajů." },
              { href: "/legal/zpracovatelska-smlouva", title: "Zpracovatelská smlouva (DPA)", hint: "Rámec pro zákazníky jako správce údajů klientů." },
              { href: "/legal/ai-disclaimer", title: "AI režim a disclaimer", hint: "Jak funguje AI v Aidvisoře, meze použití a odpovědnosti." },
            ].map((doc) => (
              <li key={doc.href}>
                <Link
                  href={doc.href}
                  className="group flex h-full items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-white/20 hover:bg-white/[0.06]"
                >
                  <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-indigo-300">
                    <FileText size={18} aria-hidden />
                  </span>
                  <span>
                    <span className="block font-jakarta text-base font-bold text-white group-hover:underline">
                      {doc.title}
                    </span>
                    <span className="mt-1 block text-sm text-slate-400">{doc.hint}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-xs text-slate-500">
            Security whitepaper ve formátu PDF pro enterprise due diligence připravujeme. Vyžádat si jej lze
            na{" "}
            <a
              href={`mailto:${LEGAL_SUPPORT_EMAIL}?subject=Security%20whitepaper`}
              className="text-indigo-300 underline underline-offset-4"
            >
              {LEGAL_SUPPORT_EMAIL}
            </a>
            .
          </p>
        </section>

        {/* --- 8. KONTAKT PRO BEZPEČNOSTNÍ HLÁŠENÍ --- */}
        <section id="kontakt" className="mb-16 scroll-mt-20">
          <SectionHeading
            eyebrow="8 · Hlášení bezpečnostních incidentů a zranitelností"
            title="Nahlaste nám to — a my se ozveme."
            subtitle="Zodpovědné hlášení (coordinated disclosure) vítáme. Neprovádějte DoS testy, útoky na ostatní uživatele ani exfiltraci cizích dat. Standardně odpovídáme do 72 hodin."
          />
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 md:p-7">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-8">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-indigo-300">
                  <Mail size={18} aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-bold text-white">Bezpečnostní kontakt</p>
                  <a
                    href={`mailto:${LEGAL_SECURITY_EMAIL}?subject=Security%20report`}
                    className="text-sm text-indigo-300 underline underline-offset-4"
                  >
                    {LEGAL_SECURITY_EMAIL}
                  </a>
                  <p className="mt-1 text-xs text-slate-500">
                    Dedikovaný kanál pro bezpečnostní hlášení (oddělený od běžné podpory). Odpovídáme do 72 h.
                  </p>
                </div>
              </div>
              <div className="flex-1 text-sm text-slate-300">
                <p className="mb-2 font-semibold text-white">Co nám v hlášení prosím uveďte</p>
                <ul className="list-disc space-y-1 pl-5 text-slate-400">
                  <li>Popis problému, dopad a kroky reprodukce.</li>
                  <li>URL, čas a prohlížeč / prostředí, kde se chování projevilo.</li>
                  <li>Případný proof-of-concept bez zásahu do cizích dat.</li>
                  <li>Kontaktní údaje, pokud si přejete zpětnou vazbu.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* --- 9. IDENTIFIKACE SPOLEČNOSTI --- */}
        <section id="spolecnost" className="mb-4 scroll-mt-20">
          <SectionHeading eyebrow="9 · Poskytovatel služby" title="Kdo za Aidvisorou stojí." />
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-sm text-slate-300 md:p-7">
            <p className="text-base font-semibold text-white">{LEGAL_COMPANY_NAME}</p>
            <p className="mt-1 text-slate-400">{LEGAL_ADDRESS_LINE}</p>
            <p className="mt-2 text-slate-500">
              IČO: {LEGAL_ICO}. {LEGAL_DIC_PENDING_NOTE}
            </p>
            <p className="mt-3 text-slate-400">
              Jurisdikce sporů: obecný soud podle sídla poskytovatele, není-li v individuální smlouvě stanoveno
              jinak.
            </p>
          </div>
        </section>

        <footer className="mt-10 border-t border-white/10 pt-6 text-xs text-slate-500">
          <p>
            Tento přehled je informativní shrnutí; právně závazné jsou texty v{" "}
            <Link href="/terms" className="text-slate-300 underline underline-offset-4">
              VOP
            </Link>
            ,{" "}
            <Link href="/privacy" className="text-slate-300 underline underline-offset-4">
              Zásadách zpracování
            </Link>{" "}
            a{" "}
            <Link href="/legal/zpracovatelska-smlouva" className="text-slate-300 underline underline-offset-4">
              DPA
            </Link>
            . Stav&nbsp;položek&nbsp;průběžně&nbsp;aktualizujeme.
          </p>
        </footer>
      </div>
    </main>
  );
}
