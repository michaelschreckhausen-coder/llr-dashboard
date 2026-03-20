# LinkedIn Lead Radar — Dashboard

## Setup in 3 Schritten

### 1. Supabase Migration ausführen
Gehe in Supabase → SQL Editor und führe `supabase_migration_002.sql` aus.

### 2. Auf Vercel deployen
```bash
# Option A: Via Vercel CLI
npm install -g vercel
cd llr-dashboard
npm install
vercel --prod

# Option B: Via GitHub
# 1. Repo auf GitHub pushen
# 2. vercel.com → "Import Project" → GitHub Repo auswählen
# 3. Framework: Vite → Deploy
```

### 3. Chrome Extension updaten
In der Extension werden Kommentare jetzt automatisch in der DB gespeichert
wenn du auf "Kommentar generieren" klickst.

## Features
- 📊 Dashboard mit Statistiken & Aktivitäts-Charts
- 👥 Lead-Management (Hinzufügen, Status, Notizen)  
- 💬 Gespeicherte Kommentare verwalten
- ⚙️ Ton-Profil & Spracheinstellungen
