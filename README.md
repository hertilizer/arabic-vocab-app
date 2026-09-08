# دفتري — Arabic Vocab Notebook

A root-linked, searchable digitization of a handwritten Arabic vocabulary notebook.
Arabic-first: meaning is a fallback field, hidden by default. Runs entirely on your
own machine — plain HTML/JS/CSS frontend, Node/Express backend, real SQLite file
on disk. Nothing is stored on any Claude/Anthropic server.

## Setup

```bash
npm install
cp .env.example .env
# then edit .env and paste in your Anthropic API key (optional - see below)
npm start
```

Open **http://localhost:3737**.

### AI autofill (optional)

AI autofill (root, harakat, part of speech, meaning, paired forms) requires an
Anthropic API key. Get one at https://console.anthropic.com/, put it in `.env` as
`ANTHROPIC_API_KEY=sk-ant-...`, and restart the server (`npm start`).

Without a key, the app still works fully for manual entry — you just won't see the
"تعبئة تلقائية (AI)" button light up, and can use "إضافة يدوياً" instead, filling
fields yourself (or leaving them blank, which is treated as the normal "not yet
known" state).

## Data & backups

- All data lives in `vocab.db`, a SQLite file in this folder — not in git (see
  `.gitignore`), not on any server. Back it up like any file (copy it, put it in
  a synced folder, whatever you already do for local files).
- **Manual export**: the Export button in the top bar writes a full CSV of every
  entry to the export folder.
- **Auto-export safety net**: the app automatically writes a CSV every 5 words
  added, and again whenever you switch away from/close the tab if there's
  unexported work. Files go to `exports/` in this folder by default — set
  `EXPORT_DIR` in `.env` to any other path (absolute or `~/...`). Restart the
  server after changing it.

## Editing the app

It's plain files — no build step:
- `server.js` — Express entry (static files + listen)
- `server/db.js` — SQLite schema and helpers (harakat stripping, search blob)
- `server/pos-list.js` — the maintained list of Arabic grammatical terms
- `server/ai/` — Claude client, autofill, and example-sentence prompts
- `server/routes/` — API routes (config, words, AI, export)
- `public/index.html` — page shell
- `public/css/` — styles
- `public/js/` — frontend modules (`app.js` boots the rest)
- `public/img/` — shemagh background tiles

Restart the server (`Ctrl+C` then `npm start`, or use `npm run dev` for auto-reload
on save) to see backend changes. Frontend changes just need a page refresh.

## Data model

Each word is one row:

| field | meaning |
|---|---|
| `word_ar` | primary Arabic form, voweled (present tense for verbs, singular for nouns) |
| `word_ar_paired` | array of `{label, word_ar}` for other forms (ماضٍ, جمع, etc.) — never duplicates the primary |
| `root` | triliteral/quadriliteral root; blank for idioms/loanwords |
| `part_of_speech` | from the maintained list in `server/pos-list.js` |
| `meaning` | hidden by default in the UI, revealed on tap |
| `notes` | catch-all free text |
| `date_added` | set automatically |

An empty field is itself the "I don't know this yet" marker — there's no separate
status column.
