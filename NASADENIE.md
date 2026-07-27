# Nasadenie Hradiská.sk — runbook

> Ako je web nasadený naostro a ako ho spravovať.
> Frontend beží na **Verceli**, backend (Strapi) na **Hetzneri**.
> Vznik: 2026-07-27.

---

## 1. Architektúra

```
Prehliadač ──https──►  Vercel (frontend, statický Vite build)
                         │  webdesignforhradiskask.vercel.app
                         │  rewrite /strapi/*  ──http proxy──►  Hetzner
                         ▼
                Hetzner CX23  ·  188.245.47.29
                   nginx :80  ──►  Strapi :1337 (systemd služba)
                   SQLite (.tmp/data.db)  +  public/uploads (4,8 GB)
```

**Prečo proxy cez `/strapi`:** frontend aj API sú tak na **rovnakej doméne** (Vercel) → žiadne CORS, žiadny HTTPS cert na backende. Prehliadač komunikuje len s Vercelom cez https; Vercel na pozadí prepošle na Hetzner cez http (server-to-server, bezpečné).

---

## 2. Prístupy, adresy, kľúče

| Vec | Hodnota |
|---|---|
| Živý web | https://webdesignforhradiskask.vercel.app |
| Admin panel | http://188.245.47.29/admin |
| Backend API (priamo) | http://188.245.47.29/api/... |
| Server (Hetzner) | CX23, Ubuntu 24.04, **188.245.47.29**, lokácia Nürnberg |
| SSH prihlásenie | `ssh -i ~/.ssh/hetzner_hradiska root@188.245.47.29` |
| Git — frontend | github.com/minothegreat881/hradiska_frontend (vetva `main`) |
| Git — backend | github.com/minothegreat881/hradiska_backend (vetva `master`) |
| Vercel projekt | `webdesignforhradiskask` (team `milanhrabkovsky-7010s-projects`) |

**Tajomstvá (nie sú v gite):**
- `hradiska-strapi/.env` — APP_KEYS, JWT/salt, STRAPI_TOKEN, SMTP heslo, VAPID kľúče (rovnaké aj na serveri v `/opt/hradiska/.env`).
- `hradiska-strapi/.hcloud-token` — Hetzner Cloud API token.
- `~/.ssh/hetzner_hradiska` (+ `.pub`) — SSH kľúč k serveru.

---

## 3. Backend — Hetzner (ako vznikol)

### 3.1 Server (cez Hetzner Cloud API)
- Typ **CX23** (2 vCPU / 4 GB / 40 GB, x86), Ubuntu 24.04, Nürnberg.
- Vytvorené cez REST API (`https://api.hetzner.cloud/v1/servers`) s pridaným SSH kľúčom `hradiska-deploy`.
- Cena ~€6,75/mes (účtované po hodinách — server sa dá kedykoľvek zmazať).

### 3.2 Základný softvér
```bash
apt-get update && apt-get install -y git nginx build-essential ufw curl
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -   # Node 22
apt-get install -y nodejs
ufw allow OpenSSH && ufw allow 80/tcp && ufw --force enable  # firewall: len 22 + 80
```

### 3.3 Nasadenie Strapi
```bash
cd /opt
git clone https://github.com/minothegreat881/hradiska_backend.git hradiska
cd hradiska
npm ci
# .env sa prenesie z lokálu (má tajomstvá zhodné s data.db):
#   scp -i ~/.ssh/hetzner_hradiska <lokal>/.env root@188.245.47.29:/opt/hradiska/.env
# v .env je HOST=127.0.0.1 (počúva len lokálne, nginx proxuje), sqlite
NODE_ENV=production npm run build     # build admin panelu
```

### 3.4 Dáta (DB + obrázky)
```bash
# DB (28 MB) — obsahuje 364 článkov (v tabuľke 728 riadkov = draft+publish)
scp -i ~/.ssh/hetzner_hradiska <lokal>/.tmp/data.db root@188.245.47.29:/opt/hradiska/.tmp/data.db

# uploads (4,8 GB, 28 589 súborov) — tar-stream cez ssh (rýchlejšie než scp po súboroch):
tar -cf - -C <lokal>/public/uploads . | ssh -i ~/.ssh/hetzner_hradiska root@188.245.47.29 \
    "cd /opt/hradiska/public/uploads && tar -xf -"
```
> ⚠️ **Dôležité:** `data.db` a `public/uploads` sú **gitignored** — do gitu NEidú, prenášajú sa ručne.

### 3.5 systemd služba + nginx
**`/etc/systemd/system/hradiska.service`:**
```ini
[Unit]
Description=Hradiska Strapi backend
After=network.target
[Service]
Type=simple
User=root
WorkingDirectory=/opt/hradiska
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
StandardOutput=append:/var/log/hradiska.log
StandardError=append:/var/log/hradiska.log
[Install]
WantedBy=multi-user.target
```
**`/etc/nginx/sites-available/hradiska`** (symlink do `sites-enabled/`, `default` zmazaný):
```nginx
server {
    listen 80 default_server;
    server_name _;
    client_max_body_size 60M;
    location / {
        proxy_pass http://127.0.0.1:1337;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```
```bash
systemctl daemon-reload && systemctl enable hradiska && systemctl restart hradiska
nginx -t && systemctl reload nginx
```

---

## 4. Frontend — Vercel

### 4.1 Proxy na backend — `vercel.json`
```json
{ "rewrites": [ { "source": "/strapi/:path*", "destination": "http://188.245.47.29/:path*" } ] }
```
Toto prepošle `webdesignforhradiskask.vercel.app/strapi/*` na Hetzner.

### 4.2 Adresa backendu v kóde
Vo všetkých klientoch je:
```ts
const STRAPI_URL = import.meta.env.PROD ? '/strapi' : (import.meta.env.VITE_STRAPI_URL || 'http://localhost:1337');
```
- **Produkcia (Vercel build):** `/strapi` (same-origin proxy → Hetzner).
- **Vývoj (`npm run dev`):** `http://localhost:1337`.
> Preto sa **nemusí** riešiť `VITE_STRAPI_URL` v nastaveniach Vercelu — v produkcii sa ignoruje a natvrdo sa použije `/strapi`.

### 4.3 Auto-deploy
Vercel je napojený na GitHub repo `hradiska_frontend`. **Každý `git push` na `main` spustí redeploy** (production). Framework: Vite, output `dist/`.

---

## 5. Bežné operácie (runbook)

### Aktualizovať FRONTEND
```bash
# lokálne priprav zmenu, over build:
cd <frontend>; npm run build
git add -A && git commit -m "..."; git push origin main   # → Vercel sám redeployne
```

### Aktualizovať BACKEND (kód)
```bash
ssh -i ~/.ssh/hetzner_hradiska root@188.245.47.29
cd /opt/hradiska
git pull
npm ci                       # ak sa menili závislosti
NODE_ENV=production npm run build
systemctl restart hradiska
```
> Po zmene **schémy** (nové content-typy/polia) je build + reštart povinný; tabuľky/stĺpce pribudnú automaticky (additívne).

### Reštart / stav / logy
```bash
systemctl restart hradiska
systemctl status hradiska
tail -f /var/log/hradiska.log
```

### Záloha DB (pravidelne odporúčané)
```bash
ssh -i ~/.ssh/hetzner_hradiska root@188.245.47.29 \
  "cp /opt/hradiska/.tmp/data.db /root/data.db.bak-\$(date +%F-%H%M)"
# stiahnuť k sebe:
scp -i ~/.ssh/hetzner_hradiska root@188.245.47.29:/root/data.db.bak-* .
```

### Doplniť nové obrázky (uploads)
Rovnaký tar-stream ako pri prvom prenose (prepíše len zmenené/nové):
```bash
tar -cf - -C <lokal>/public/uploads . | ssh -i ~/.ssh/hetzner_hradiska root@188.245.47.29 \
    "cd /opt/hradiska/public/uploads && tar -xf -"
```

### Zmazať server (zastaviť účtovanie)
Hetzner konzola → projekt Default → server `hradiska-backend` → Delete. (Alebo cez API `DELETE /v1/servers/155835776`.) **Pred tým si stiahni DB + uploads!**

---

## 6. Pasce, na ktoré sme narazili (a riešenia)

| Problém | Príčina | Riešenie |
|---|---|---|
| Vercel build padal `Could not resolve ./index.css` | `src/index.css` bol gitignored (auto-generovaný) → na čistom clone chýbal | `index.css` vyňatý z `.gitignore` a **zakomitovaný** |
| Web bez štýlov po odstránení importu | `index.css` obsahuje štýly, ktoré `globals.css` nemá | import v `main.tsx` ostáva, súbor je v gite |
| Frontend ukazoval na starý Cloudflare tunel | `VITE_STRAPI_URL` na Vercli = dočasná `*.trycloudflare.com` | v produkcii natvrdo `/strapi` (viď 4.2) |
| scp 28 589 súborov by bolo pomalé | per-file SSH overhead | **tar-stream cez ssh** (jeden tok) |
| Strapi „gross" cena v API iná | DPH/IPv4 | riadiť sa cenou na stránke pri vytváraní servera |
| Build stále ERROR na Vercli | pozri build logy | `vercel` MCP / dashboard → deployment → Build Logs |

---

## 7. Náklady a bezpečnosť

- **Hetzner CX23:** ~€6,75/mes (po hodinách). Účtovanie beží, kým server existuje.
- **Vercel:** frontend je statický build — zvyčajne v rámci free/hobby.
- Firewall na serveri: otvorené len **22 (SSH)** a **80 (HTTP)**. Strapi (1337) počúva len na `127.0.0.1`.
- **Neverejné súbory:** `.env`, `.hcloud-token`, SSH privátny kľúč — nikdy do gitu (sú v `.gitignore`).
- Odporúčané: zapnúť **2FA na Hetzner účte**; pri väčšej prevádzke rotovať STRAPI_TOKEN a Hetzner API token.

---

## 8. Voliteľné ďalšie kroky

- **Vlastná doména** (`hradiska.sk`) na Vercli: Project → Settings → Domains → pridať doménu + DNS. Proxy `/strapi` funguje aj vtedy bez zmeny.
- **HTTPS priamo na backend** (ak by si chcel `api.hradiska.sk` namiesto proxy): pridať A-záznam na `188.245.47.29`, na serveri `certbot --nginx`, a `VITE_STRAPI_URL` prepnúť na tú doménu.
- **Postgres** namiesto SQLite (pri raste prevádzky) — Strapi to podporuje cez `DATABASE_CLIENT`.
- Dokončiť tlačidlo **♥ „obľúbené"** na článku (jediný nedorobený frontend kúsok profilu).
