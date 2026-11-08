# EurasiaStockIntake: setting it up on a local Windows server

The app runs as 3 Docker containers: **mongo** (the database), **backend** (the API) and **frontend** (the web app plus a proxy that passes `/api` to the backend).
Photos and signatures are stored on the local disk, in the Docker volume `eurasia_uploads`. They don't use any cloud storage.
The app talks to CPIS through a shared Docker network.

## 1. What you need first
- Windows 10/11 or Windows Server with **Docker Desktop** (WSL2 backend). It must be running.
- This project folder. Use "Save to GitHub" and clone it, or download the code.

## 2. Configure
Open PowerShell in `deploy\windows` and run:
```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\start.ps1
```
The first run creates `deploy\local.env` and opens it in Notepad. Fill in these settings:

| Key | What to set |
|---|---|
| `JWT_SECRET` | any long random string |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | the first admin login. It's only created when the database is empty. |
| `CPIS_BASE_URL` | the CPIS address **as seen from inside Docker**, e.g. `http://<cpis-backend-container-name>:<port>/api` |
| `CPIS_API_KEY` | your CPIS API key |
| `CPIS_SITE_ID` | your CPIS site, `MAIN-WAREHOUSE` by default |

`deploy\.env` holds `APP_PORT` (default `8080`) and `CPIS_NETWORK` (default `cpis_shared`).

## 3. Connect CPIS (it runs in Docker on the same machine)
`start.ps1` creates the shared network `cpis_shared` if it's missing. Then attach your CPIS backend container to it:
```powershell
docker network connect cpis_shared <cpis-backend-container-name>
```
To make this permanent, add the following to the CPIS `docker-compose.yml`:
```yaml
services:
  backend:            # the CPIS API service
    networks: [default, cpis_shared]
networks:
  cpis_shared:
    external: true
```
Then set `CPIS_BASE_URL=http://<that-service-or-container-name>:<internal-port>/api`.

If CPIS only publishes a port on the host and you'd rather not share a network, you can use
`CPIS_BASE_URL=http://host.docker.internal:<published-port>/api` instead.

Test the connection:
```powershell
docker compose exec backend python -c "import os,requests;print(requests.get(os.environ['CPIS_BASE_URL']+'/products',headers={'X-API-Key':os.environ['CPIS_API_KEY']},params={'limit':1}).status_code)"
```
You should see `200`.

## 4. Start and stop
- Start or update: `.\start.ps1`, then open `http://localhost:8080`. Other PCs on the network use `http://<server-ip>:8080`.
- Stop: `.\stop.ps1`
- Logs: `docker compose logs -f backend` (run it from the `deploy` folder)
- Containers restart on their own when Docker Desktop starts. Turn on "Start Docker Desktop when you sign in".

## 5. Move your existing data from the current (cloud) app
1. In the **current live app**, sign in as admin and go to **Admin → Backup → Download full backup**. You get one zip with every record, photo and signature.
2. In the **local app**, sign in with the admin from `local.env` and go to **Admin → Backup → Restore from backup**, then choose the zip and type `RESTORE`.
3. Sign in again. Your user accounts and staff PINs now come from the backup.

## 6. Routine local backups
```powershell
.\backup.ps1                                   # writes deploy\backups\<timestamp>\
.\restore.ps1 -Folder ..\backups\20260601-1200
```
Schedule `backup.ps1` in Windows Task Scheduler (daily) and copy `deploy\backups` to another drive.

## 7. Notes
- MongoDB is only reachable from the server itself, at `127.0.0.1:27018`, for tools like Compass.
- If you serve the app on a separate domain or over HTTPS through another proxy, point that proxy at `http://<server>:8080`.
