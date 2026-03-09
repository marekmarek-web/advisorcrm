# Instrukce pro Supabase AI Agent (GPT mini styl)

Použití v **Supabase Dashboard** u vestavěného **AI Assistant** (panel v SQL Editoru / databázi).

---

## 1. Zapnutí AI Assistant v Supabase

1. V **Supabase Dashboard** otevři svůj projekt.
2. Jdi do **Project Settings** (ikona ozubeného kolečka) → **Integrations** nebo **API**.
3. Najdi sekci **OpenAI** / **AI Assistant** a zadej svůj **OpenAI API klíč**  
   (vytvoříš na [platform.openai.com → API keys](https://platform.openai.com/account/api-keys)).
4. Ulož nastavení. AI Assistant pak funguje v SQL Editoru a jinde v dashboardu (např. zkratka **Ctrl+J** nebo **Cmd+J** pro otevření panelu).

*Pozn.: Konkrétní model (např. GPT-4o-mini) Supabase obvykle vybírá sám; pokud je v nastavení pole pro model, zvol `gpt-4o-mini` pro levnější a rychlejší odpovědi.*

---

## 2. Instrukce pro asistenta („GPT mini“ styl)

Níže je blok instrukcí, který můžeš **vložit na začátek chatu** s AI Assistantem nebo použít jako trvalý kontext. Asistent pak odpovídá stručně a přímo, bez zbytečného textu.

---

### Text instrukcí (zkopíruj a vlož do AI Assistant)

```
Jsi Supabase AI asistent v režimu „GPT mini“:

- Odpovídej stručně a přímo. Žádné dlouhé úvody ani opakování zadání.
- SQL piš kompletní a spustitelné. Bez vysvětlování, pokud o to nepožádám.
- U návrhů schémat, RLS, funkcí nebo triggerů: nejdřív krátký návrh (1–2 věty), pak kód.
- U chyb: přímo opravený kód nebo konkrétní změna, ne obecné rady.
- Pokud stačí ano/ne nebo jedno slovo, odpověz jen tím.
- Jazyk: čeština, pokud píšu česky; technické termíny (SQL, názvy tabulek) nech v angličtině.
- Kontext: mám Supabase (Postgres), používám tento projekt; ber v potaz aktuální stránku/databázi v dashboardu.
```

---

### Jak to použít

- **Jednorázově:** Na začátku konverzace v AI Assistantu napiš třeba:  
  „Platí pro tento chat: [vlož výše uvedený blok instrukcí]. Teď mi pomoz s …“
- **Pravidelně:** Při každém novém chatu vlož první zprávu ve tvaru:  
  „Instrukce: [blok]. Úkol: [tvůj úkol].“
- Pokud má Supabase pole pro **„Custom instructions“** nebo **„System prompt“**, vlož tam ten blok natrvalo.

---

## 3. Shrnutí

| Kde | Co |
|-----|-----|
| **Supabase Dashboard** | Project Settings → OpenAI / AI → zadat API klíč |
| **Model** | Pokud je výběr modelu, zvol `gpt-4o-mini` pro „mini“ režim |
| **Chat** | Na začátek chatu vložit blok instrukcí výše |

Tím dostaneš chování podobné „GPT mini“: krátké, přesné odpovědi a SQL bez zbytečného textu.
