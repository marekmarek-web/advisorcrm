# Vercel: build se nespustil + AI asistent

## Když po pushi na GitHub **Vercel vůbec nespustí build**

Zkontroluj v [vercel.com](https://vercel.com) u projektu (např. `advisorcrm-web`):

1. **Settings → Git**
   - Je připojený **správný repozitář** (`marekmarek-web/advisorcrm` nebo jaký používáte)?
   - **Production Branch** = větev, do které pushujete (typicky `main`).

2. **Settings → General → Root Directory**
   - Musí být **`apps/web`** (monorepo).  
   - Pokud je prázdné, Vercel buildí z kořene repa a často to **nepozná Next.js** nebo nainstaluje špatně workspace `db`.
   - Když Vercel hlásí, že **Production deployment má jiné nastavení než Project Settings**, po úpravě nastavení udělej **Redeploy** z aktuálního commitu, ať se to srovná.

3. **Deployments**
   - Vidíš vůbec záznam po pushi?  
   - **Ne** → GitHub integrace / oprávnění aplikace Vercel u org/repo (Settings → Git → Reconnect).
   - **Ano, ale „Skipped“** → **Settings → Git → Ignored Build Step** musí být vypnutý nebo skript nesmí ukončit kód `0` při „skip“ omylem.

4. **Ruční deploy**
   - **Deployments → … → Redeploy** (nebo **Create Deployment** z aktuálního commitu) – ověříš, že build projde, i když webhook zlobí.

5. **Build log**
   - Pokud build **začne a spadne**, otevři log – chyba je tam přesná (TypeScript, chybějící modul, env při buildu apod.).

**Očekávané nastavení buildu** (už je v `apps/web/vercel.json`):

- Install: z kořene monorepa `pnpm install`
- Build v `apps/web`: `pnpm build` → `next build`

---

## AI asistent (chat v panelu) – co musí běžet na serveru

Endpoint: **`POST /api/ai/assistant/chat`**

1. **`OPENAI_API_KEY`**  
   - V **Vercel → Settings → Environment Variables** pro **Production** (a případně Preview).  
   - Bez něj API vrátí „fallback“ odpověď a varování (aplikace nespadne, ale **opravdová AI neodpoví**).

2. **Volitelně `OPENAI_MODEL`**  
   - Pokud není, použije se výchozí model z kódu (`openai.ts`).

3. **Přihlášení a kdo může psát asistentovi**  
   - Musíš být **přihlášený** (Supabase session). Middleware u `/api/ai/*` doplní hlavičku `x-user-id`.  
   - Stačí mít **členství ve workspace** (řádek v `memberships` u tenantu) – **nevyžadujeme** zvlášť oprávnění typu `documents:read`. Asistent má být dostupný **všem registrovaným uživatelům firmy**.  
   - Omezení podle **zaplaceného plánu** nebo jemnějších rolí můžeme doplnit později v kódu.

4. **Proměnné `OPENAI_PROMPT_*_ID`**  
   - Ty jsou pro **konkrétní funkce** (shrnutí klienta, tým, …), **ne** pro základní chat v postranním panelu.  
   - Chat používá **Responses API** s textovým promptem + kontext z DB.

5. **Review smluv (upload + seznam)** – endpointy pod `/api/contracts/*` vyžadují jen **členství ve workspace** (stejně jako asistent), ne zvlášť `documents:read` / `documents:write`.  
   Při chybě uploadu může odpověď obsahovat pole **`code`** (`STORAGE_*`, `DB_INSERT_REVIEW`, `CONTRACT_UPLOAD_UNHANDLED`) – v UI se zobrazí za textem chyby pro rychlejší diagnostiku.  
   **Chyba `DB_INSERT_REVIEW`:** na produkční databázi (stejná jako `DATABASE_URL` na Vercelu) v Supabase → **SQL Editor** spusť skript **`docs/supabase-patch-contract_upload_reviews.sql`** (doplní / vytvoří tabulku `contract_upload_reviews`).

---

## Rychlý test po deployi

- Otevři produkci → přihlas se → **AI asistent** → napiš krátkou zprávu.  
- V **DevTools → Network** u `assistant/chat`: status **200** a v JSON je smysluplná `message` (ne jen fallback text).  
- Pokud ve `warnings` uvidíš zmínku o **OPENAI_API_KEY**, dopln klíč na Vercelu a **Redeploy**.
