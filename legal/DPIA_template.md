# Šablona DPIA (Posouzení dopadu na ochranu osobních údajů)

**Pro:** Zavedení / provoz aplikace Advisor CRM (zpracování OÚ klientů poradenských firem).

**Kroky:**

1. **Popis zpracování** – Které OÚ (jméno, kontakt, historie schůzek, dokumenty, poznámky) se zpracovávají, účel (poskytování poradenských služeb, compliance), kategorie subjektů (klienti poradců), příjemci (poradci v tenantovi, technické subjekty: Supabase, Vercel).

2. **Nutnost a proporcionalita** – Zpracování nutné k plnění smlouvy a právních povinností (IDD, úvěry). Omezení na potřebné minimum (např. neukládat nadbytečné citlivé údaje).

3. **Rizika pro práva subjektů** – Neoprávněný přístup (mitigace: RBAC, MFA, audit log), únik dat (TLS, šifrování at-rest), nedostupnost (zálohy, SLA).

4. **Opatření** – Technická: šifrování, přístup podle rolí, audit log. Organizační: DPA se zpracovatelem, školení, retenční politika. Práva subjektů: export, výmaz, evidence souhlasů.

5. **Závěr** – Rizika po přijetí opatření přijatelná / nepřijatelná. Doporučení: pravidelné přezkoumání (např. ročně), aktualizace při změně funkcí.

*Šablona k vyplnění správcem (poradenskou firmou). Před použitím konzultace s právníkem / DPO.*
