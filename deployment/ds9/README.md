# DS9 staging

Table Host runs as `table-host-staging.service` on port 6435 and is exposed by
the shared DS9 Nginx site at `/tablehost/`. The runtime wrapper supplies the
DS9 backend URL used by the Next.js API proxy routes.

The managed updater configuration tracks the `dev` branch from the DS9-local
bare repository at `/home/deploy/.local/share/git/table_host.git`.
