#!/usr/bin/env node
// Despliegue MANUAL del frontend (solo emergencias).
//
// El camino normal es hacer merge a main: GitHub Actions publica deploy/
// (.github/workflows/deploy-pages.yml). Este script existe por si Actions no
// esta disponible, y se niega a desplegar si lo que hay en disco no es
// exactamente lo que esta en origin/main. Asi nunca vuelve a salir a produccion
// algo que no esta en git (ni algo viejo que pise lo que esta en vivo).
import { execFileSync, spawnSync } from "node:child_process";

const run = (cmd, args) =>
  execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const fail = (msg) => {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
};

try {
  run("git", ["fetch", "origin", "main"]);
} catch {
  fail("No pude hacer `git fetch origin main`. Revisa tu conexion.");
}

const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
if (branch !== "main") fail(`Estas en la rama "${branch}". Cambia a main antes de desplegar.`);

const dirty = run("git", ["status", "--porcelain", "--", "deploy"]);
if (dirty) {
  fail(
    "Hay cambios sin commit en deploy/:\n" +
      dirty +
      "\n\nHaz commit y push (por PR) y deja que GitHub Actions despliegue. " +
      "Desplegar desde el disco es justo lo que pisa lo que esta en vivo."
  );
}

const local = run("git", ["rev-parse", "HEAD"]);
const remote = run("git", ["rev-parse", "origin/main"]);
if (local !== remote) {
  fail(
    "Tu main local no coincide con origin/main.\n" +
      `  local:  ${local.slice(0, 7)}\n  origin: ${remote.slice(0, 7)}\n` +
      "Corre `git pull origin main` (o sube tus commits) y vuelve a intentar."
  );
}

console.log(`✔ deploy/ limpio y igual a origin/main (${local.slice(0, 7)}). Desplegando…`);

const res = spawnSync(
  "npx",
  [
    "wrangler",
    "pages",
    "deploy",
    "deploy/",
    "--project-name",
    "exilium-battlepass",
    "--branch",
    "main",
    "--commit-hash",
    local,
  ],
  { stdio: "inherit", shell: process.platform === "win32" }
);
process.exit(res.status ?? 1);
