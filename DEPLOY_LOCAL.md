# EurasiaStockIntake: deploying on your local network
The whole app (website, API, MongoDB and photo/signature storage on disk) runs on one server in your network with Docker Compose. It's designed to sit next to **EurasiaCPIS** on the same server.

## 1. Requirements
- A Linux, Windows or macOS server with **Docker** and **Docker Compose v2**.
- A fixed IP on your network. The examples below use `192.168.1.50`, the same server as CPIS.
- CPIS already uses port **80**, so this app uses a different port (default **8080**).

## 2. Configure
```bash
cp local.env.example .env
```
Edit `.env`:

| Key | Meaning |
|---|---|
| `PUBLIC_URL` | How users open the app, e.g. `http://192.168.1.50:8080`. It must match `HTTP_PORT`. |
| `HTTP_PORT` | Port on the server (default 8080). Don't use 80, because CPIS uses it. |
| `JWT_SECRET` | A long random string, e.g. from `openssl rand -hex 32` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | The first admin login, created on first start |
| `DB_NAME` | MongoDB database name |
| `CPIS_BASE_URL` | The CPIS API address: CPIS's `PUBLIC_URL` + `/api`, e.g. `http://192.168.1.50/api` |
| `CPIS_API_KEY` | The key for this system from CPIS → **Systems & Settings** |
| `CPIS_SOURCE_SYSTEM` | The system code shown in CPIS for stock movements (default `EURASIA_INTAKE`) |
| `CPIS_SITE_ID` | The CPIS warehouse site (default `MAIN-WAREHOUSE`) |

Use the server's LAN IP in `CPIS_BASE_URL`, not `localhost`. Inside a container, `localhost` means the container itself.
If CPIS is only published on the server's localhost, use `http://host.docker.internal/api` instead.

## 3. Start
```bash
docker compose up -d --build
```
Open `PUBLIC_URL` in a browser and sign in with the admin account.
- Photos and signatures are stored on the server disk, in the Docker volume `uploads`. They are compressed in the browser before upload.
- The database is stored in the volume `mongo_data`. It's a separate MongoDB from CPIS's.
- Stop: `docker compose down` (your data is kept). After code changes, update with `docker compose up -d --build`.
- Check the CPIS connection:
  ```bash
  docker compose exec backend python -c "import os,requests;print(requests.get(os.environ['CPIS_BASE_URL']+'/products',headers={'X-API-Key':os.environ['CPIS_API_KEY']},params={'limit':1}).status_code)"
  ```
  It should print `200`.

## 4. Copy data from the online version (optional, one time)
The online version must be published with the latest code, which includes the admin export endpoint.
The local server only needs internet access while this runs.
```bash
docker compose exec backend python scripts/migrate_from_online.py \
  --source https://YOUR-ONLINE-INTAKE-URL --email ONLINE_ADMIN_EMAIL --password 'ONLINE_ADMIN_PASSWORD'
docker compose restart backend
```
This copies everything: receivals (with photos and signatures), suppliers, locations, statuses, staff PINs, purchase orders, price history, supplier pack configs and codes, the To Order list, min stock levels, credit notes, settings and users. Local collections are replaced.
After copying, sign in with your **online** admin account, because users are copied too.
Run the CPIS migration first, so the products and packs that POs refer to exist locally.

You can also do this from the browser: online **Admin → Backup → Download full backup**, then local **Admin → Backup → Restore from backup**.

## 5. Using it with CPIS and other devices
- Users on phones, tablets or PCs open `PUBLIC_URL`, e.g. `http://192.168.1.50:8080`.
- Closing a PO posts goods receipts to `CPIS_BASE_URL` (`/stock/receipts`). Return credit notes post stock movements there.
- The pricing API for other systems: `http://192.168.1.50:8080/api/pricing/...`, using the same `X-API-Key` as CPIS. See the **API Guide** page inside the app.

## 6. Backups
```bash
docker compose exec mongo mongodump --archive=/data/db/backup.archive
docker run --rm -v eurasia-intake_uploads:/u -v $PWD:/b alpine tar czf /b/uploads-backup.tgz -C /u .
```
To restore:
```bash
docker compose exec mongo mongorestore --drop --archive=/data/db/backup.archive
docker run --rm -v eurasia-intake_uploads:/u -v $PWD:/b alpine tar xzf /b/uploads-backup.tgz -C /u
```
On Windows PowerShell, use `${PWD}` instead of `$PWD`.
