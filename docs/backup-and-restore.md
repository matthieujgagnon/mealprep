# Backup and restore

Every Sunday at 3 a.m. (Montreal time) the GitHub Action
[`db-backup.yml`](../.github/workflows/db-backup.yml) copies the whole Neon
database (every table, including recipe photos and flyer files), encrypts the
copy, and keeps only the encrypted file for 30 days. You can also run it any
time: **Actions → Weekly database backup → Run workflow**.

## One-time setup: the two GitHub secrets

On GitHub, open the repo's **Settings → Secrets and variables → Actions → New
repository secret** and add:

| Name | Value |
| --- | --- |
| `BACKUP_DATABASE_URL` | Neon's **direct** connection string (Neon console → Connect → turn **Connection pooling** off). It starts with `postgresql://`. |
| `BACKUP_PASSPHRASE` | A long random passphrase, e.g. from `openssl rand -base64 32`. **Also save it in a password manager.** Without it a backup can't be opened, and nobody can reset it. |

## Download a backup

1. On GitHub, open the repo's **Actions** tab and click **Weekly database backup**.
2. Click the run you want (the date is in the file name; backups older than 30 days are gone).
3. Under **Artifacts** at the bottom, click `mealprep-YYYY-MM-DD.dump.gpg`. Your browser downloads a `.zip`; unzip it to get the `.gpg` file.

## Decrypt it

You need `gpg` (on a Mac: `brew install gnupg`; on Linux it is usually already there).

4. In a terminal, in the folder with the file, run:
   ```sh
   gpg --output mealprep.dump --decrypt mealprep-YYYY-MM-DD.dump.gpg
   ```
5. Type the `BACKUP_PASSPHRASE` when asked. A wrong passphrase gives an error and no file.

## Restore into a new Neon branch

You need `pg_restore` at the same Postgres version as Neon, or newer (Neon console → project → the Postgres version shown on the dashboard; `pg_restore --version` shows yours).

6. In the Neon console, create a **new branch** (Branches → Create branch). It starts as a copy of the current data, so also make a **new empty database** in it: open the branch → **Databases → New database**, name it `mealprep_restored`.
7. Copy that database's **direct** connection string (Connect → Connection pooling off, pick the new branch and database).
8. Restore into it:
   ```sh
   pg_restore --no-owner --no-privileges --exit-on-error \
     --dbname "PASTE_THE_CONNECTION_STRING_HERE" mealprep.dump
   ```
9. Check it: `psql "PASTE_THE_CONNECTION_STRING_HERE" -c 'select count(*) from "Recipe"'`.
10. To go live on the restored copy, set Render's `DATABASE_URL` to that connection string and redeploy. The migration history is restored too, so the app starts normally.

## Restore into a local database

You need PostgreSQL installed locally (the same or a newer version than Neon's).

6. Make an empty database: `createdb mealprep_restored`
7. Restore into it:
   ```sh
   pg_restore --no-owner --no-privileges --exit-on-error --dbname mealprep_restored mealprep.dump
   ```
   If your local Postgres needs a user and password, use a full address instead:
   `--dbname "postgresql://USER:PASSWORD@localhost:5432/mealprep_restored"`.
8. Point `server/.env` at it: `DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/mealprep_restored"`.
9. Delete `mealprep.dump` when you're done: it is the unencrypted data.

## Check that backups really restore

`scripts/backup-roundtrip.sh` does the whole cycle on a local database (dump, encrypt, decrypt, restore into a scratch database, compare row counts for every table):

```sh
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/mealprep_dev" scripts/backup-roundtrip.sh
```

It refuses to run against anything that isn't on `localhost`.

## Good to know

- **Storage:** GitHub's free plan gives 500 MB for artifacts. Weekly backups kept 30 days means up to 5 exist at once, so each should stay under about 100 MB. The run's summary shows the size and warns above 100 MB.
- **Failures:** if a backup fails, GitHub emails the person who last edited the workflow's schedule. Look at the run's log; it never contains the connection string, the passphrase or any data.
- **Quiet repos:** GitHub switches off scheduled workflows in a public repo after 60 days without activity. Re-enable it from the Actions tab if that happens.
