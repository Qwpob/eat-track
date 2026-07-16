# 🍽️ Eat Track

Jurnal alimentar personal: scrii ce ai mâncat în limbaj natural, iar aplicația
recunoaște alimentele, calculează macronutrienții și îți arată progresul zilnic
față de obiective. Poți nota și greutatea în fiecare zi.

Backend în **Python standard library** (fără pip installs), frontend static
(HTML/CSS/JS vanilla) — la fel ca proiectul LOL_stats.

## Ce poți face

- **Adaugi mese scriind natural**, ex: `azi am mâncat 200g salam, 100g cașcaval, 250g pâine și 2 ouă`
- **Vezi macronutrienții**: calorii, proteine, carbohidrați, grăsimi, fibre
- **Progres spre obiectiv** cu bare pentru fiecare macronutrient
- **Mesele zilei** listate, cu ștergere
- **Greutate zilnică** salvată per zi
- **Istoric** pe ultimele 30 de zile (click pe o zi ca s-o deschizi)

## Rulare

```powershell
cd Eat_Track
python server/server.py
```

Deschide http://localhost:5000

Datele se salvează în `data/eattrack.json` (creat automat).

## Cum funcționează recunoașterea

Implicit folosește un **parser local** peste un tabel nutrițional
(`server/food_db.py`, valori per 100 g). Recunoaște cantități în grame, kg, ml,
linguri, felii și bucăți, ignoră cuvinte de umplutură („azi am mâncat”, „și”).

### Căutare online (OpenFoodFacts)

Pentru alimente care nu sunt în tabelul local, aplicația caută automat în baza
de date **OpenFoodFacts** — varianta românească (`ro.openfoodfacts.org`), care
prioritizează produsele vândute în România și cele mai populare rezultate
(gratuit, fără cheie API). Rezultatele sunt marcate cu eticheta `online` în
previzualizare. Funcția e activă implicit; o poți dezactiva (mod complet
offline) cu:

```
EATTRACK_ONLINE_LOOKUP=0
```

Notă: OpenFoodFacts conține mai ales produse de brand, așa că pentru alimente
generice rezultatul poate fi un produs ambalat apropiat.

### Adăugare alimente noi

Editează `server/food_db.py` și adaugă o intrare în `FOODS`:

```python
"nume aliment": (calorii, proteine, carbo, grasimi, fibre),  # per 100 g
```

### (Opțional) parser AI mai flexibil

Poți conecta un model LLM compatibil OpenAI. Ai două variante:

**A. Ollama — local, gratuit, fără cheie API** (recomandat pentru confidențialitate)

1. Instalează Ollama și pornește-l.
2. Descarcă un model, ex: `ollama pull llama3.1`
3. În `Eat_Track/.env`:

```
EATTRACK_LLM_URL=http://localhost:11434/v1/chat/completions
EATTRACK_LLM_MODEL=llama3.1
```

**B. Cloud (OpenAI / Groq etc.) — necesită cheie API**

```
EATTRACK_LLM_API_KEY=sk-...
# optional:
EATTRACK_LLM_URL=https://api.openai.com/v1/chat/completions
EATTRACK_LLM_MODEL=gpt-4o-mini
```

Dacă un endpoint AI e configurat, aplicația îl încearcă mai întâi: modelul
identifică alimentele și le atașează valorile nutriționale per 100 g din
cunoștințele lui despre baze de date internaționale (deci recunoaște și
alimente care nu sunt în tabel). Dacă un aliment nu are valori, se caută în
tabelul local, apoi în OpenFoodFacts. La orice eroare se revine la parserul
local. Badge-ul din antet arată motorul activ (`local`, `online` sau `AI`).

### (Opțional) citirea etichetelor nutriționale din poze

Poți fotografia tabelul cu valori nutriționale de pe ambalaj, iar un model AI
cu „vedere" (vision) extrage valorile per 100 g. Necesită un model multimodal:

- **Ollama:** `ollama pull llama3.2-vision`
- În `Eat_Track/.env` (pe lângă `EATTRACK_LLM_URL`):

```
EATTRACK_VISION_MODEL=llama3.2-vision
```

Când e configurat, în pagina **Mese** apare cardul „Scanează eticheta 📷":
alegi/faci o poză, AI-ul citește valorile per 100 g, completezi gramajul și
adaugi produsul la mese. Fără un model vision configurat, cardul rămâne ascuns.

## API

| Metodă | Rută | Descriere |
| --- | --- | --- |
| GET | `/api/config` | motorul activ + data curentă |
| GET | `/api/day?date=YYYY-MM-DD` | mesele, greutatea și totalurile zilei |
| GET | `/api/history?limit=30` | rezumat pe zile |
| GET | `/api/goals` | obiectivele curente |
| POST | `/api/parse` | analizează text fără să salveze |
| POST | `/api/meals` | adaugă o masă |
| DELETE | `/api/meals?date=..&id=..` | șterge o masă |
| POST | `/api/weight` | salvează greutatea zilei |
| POST | `/api/goals` | actualizează obiectivele |
