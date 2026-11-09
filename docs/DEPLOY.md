# Despliegue del frontend (Cloudflare Pages) — runbook

> **Regla de oro:** lo que está en `main` es lo que se publica. **Nunca** se despliega `deploy/`
> desde un disco con archivos sin commit, ni con `wrangler pages deploy` suelto.

## Datos del proyecto
- Pages: `exilium-battlepass` (direct upload; `git push` **no** despliega solo) — cuenta Cloudflare
  `Mitzumitzukyhs`, `CLOUDFLARE_ACCOUNT_ID = 6948ea17abd29d39d063842010bbb5b8`.
- Dominios: `www.guild-exilium.com`, `guild-exilium.com`, `exilium-battlepass.pages.dev`.
- API / Worker: `exilium-blizzard` en `https://api.guild-exilium.com` (**el frontend no debe usar
  `*.workers.dev` de ese Worker; esa URL esta desactivada**).
- Ultimo deploy verificado en produccion: `20dcfe85` (10-ago-2026 base + `main` `8efe7cb`, 9-nov-2026).

## Flujo normal
1. Rama nueva -> cambios -> Pull Request a `main` (usa la plantilla del PR).
2. Revision y merge en GitHub.
3. El workflow `Deploy Exilium Frontend (Pages)` publica solo si pasan estos candados:
   - no hay referencias a `exilium-blizzard...workers.dev`;
   - existen los archivos criticos (ruleta 3D, assets de la ruleta, banner, Liga RBG);
   - el token de Cloudflare tiene acceso al proyecto Pages;
   - despues del deploy, la ruleta en produccion es la 3D (`three.min.js`) y usa `api.guild-exilium.com`.

### Secretos de GitHub (Settings > Secrets and variables > Actions)
| Secreto | Valor |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | ID de la cuenta dueña de `exilium-battlepass` |
| `CLOUDFLARE_PAGES_API_TOKEN` | Token **solo Pages**: Cloudflare > My Profile > API Tokens > Create Token > Custom > `Account > Cloudflare Pages > Edit` (solo esa cuenta) |
| `CLOUDFLARE_API_TOKEN` | Lo usa el workflow del Worker; Pages cae a este solo si falta el de Pages |

Nunca pegues tokens en chats, issues ni commits.

## Emergencia (Actions caido o sin secreto)
Desde tu PC, en la carpeta del repo clonado:
```powershell
git checkout main
git pull origin main
npm run deploy:front
```
El script se niega a desplegar si no estas en `main`, si `deploy/` tiene cambios sin commit o si tu
`main` local no es igual a `origin/main`. Si pide login: `npx wrangler login` con la cuenta
**Mitzumitzukyhs** (no crear un proyecto nuevo si pregunta).

## Reversion (rollback)
- Cloudflare > Workers & Pages > `exilium-battlepass` > Deployments > elegir el deploy bueno >
  *Rollback to this deployment*. Los deploys viejos se conservan: **no los borres**.
- Revertir tambien en git (`Revert` del PR en GitHub) para que `main` coincida con produccion.
- Despues de revertir, **no** vuelvas a desplegar desde disco.

## Checklist despues de publicar
- [ ] `www.guild-exilium.com/sala-pandacoins-standalone.html`: ruleta 3D, mesa conecta, ticker de ganadores.
- [ ] `www.guild-exilium.com`: banner "Nace el movimiento #Exilium" en el Salon de la Fama.
- [ ] `www.guild-exilium.com/liga-rbg.html` y `/armario.html` cargan.
- [ ] `www.guild-exilium.com/admin` (con login) carga.

## Que paso el 9-nov-2026 (para no repetirlo)
1. Se desplego desde un clon limpio de GitHub, pero la ruleta 3D, la Liga RBG, `armario` y el admin
   nuevo **solo existian en la PC del dueño / en el deploy del 10-ago, sin commit**. El deploy de
   Pages reemplaza *todo*, asi que esos archivos desaparecieron de produccion.
2. Ademas la ruleta del repo apuntaba al host `workers.dev` del Worker (desactivado) y se quedaba
   en "Conectando con la mesa…".
3. Se recupero todo desde el deploy `1a072343` de Cloudflare y se commiteo (PR #7). Se agregaron los
   candados de CI de arriba.

**Lecciones:** todo lo que va a produccion debe estar en git; no desplegar desde el disco; no borrar
deploys viejos; guardar copia del trabajo antes de reorganizar carpetas.

## Pendientes conocidos
- **El Worker desplegado va por delante de `worker/` del repo** (`/api/casino/maintenance` y
  `/api/casino/view` no estan en el codigo del repo). Hay que traer ese codigo a git; hasta entonces,
  **no redesplegar el Worker desde GitHub**. El workflow `deploy-worker.yml` falla desde septiembre
  por credenciales.
- Proteger `main` (Settings > Branches > "Require a pull request before merging").
- Algunos medios del Salon de la Fama guardados en KV apuntan al host `workers.dev` viejo
  (`entry_video_url`, `video_url`); hay que volver a subirlos desde el admin.
