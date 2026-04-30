// Paquete principal de Hive — instala el CLI con todas sus dependencias
const MAIN_PACKAGE = "@johpaz/hive-agents";

export async function update(): Promise<void> {
  console.log("🔄 Actualizando Hive...\n");

  // Detectar tipo de instalación
  const { existsSync } = await import("node:fs");
  const isGitRepo = existsSync(".git") && existsSync("package.json");

  if (isGitRepo) {
    await updateFromGitRepo();
  } else {
    await updateFromGlobalPackage();
  }
}

/**
 * Actualiza desde el repositorio local (git pull + build)
 */
async function updateFromGitRepo(): Promise<void> {
  const { execSync } = await import("child_process");

  // Mostrar versión actual
  try {
    const currentVersion = execSync("bun packages/cli/src/index.ts --version", { encoding: "utf-8" }).trim();
    console.log(`Versión actual: ${currentVersion}`);
  } catch {
    console.log("Versión actual: desconocida");
  }

  console.log("\n📥 Obteniendo cambios del repositorio...");

  try {
    // Verificar que git está disponible
    try {
      execSync("git --version", { encoding: "utf-8" });
    } catch {
      console.log("\n❌ git no está instalado. Instala git o usa: bun install -g @johpaz/hive-agents@latest");
      return;
    }

    // Git pull
    console.log("   Ejecutando git pull...");
    const pullResult = execSync("git pull --rebase", { encoding: "utf-8", stdio: "pipe" });
    if (pullResult.includes("Already up to date")) {
      console.log("   ✅ Ya estás en la última versión");
    } else {
      console.log("   ✅ Cambios obtenidos");

      // Instalar dependencias
      console.log("\n📦 Instalando dependencias...");
      execSync("bun install", { encoding: "utf-8", stdio: "inherit" });

      // Build
      console.log("\n🔨 Construyendo el proyecto...");
      execSync("bun run build", { encoding: "utf-8", stdio: "inherit" });
    }

    // Verificar nueva versión
    try {
      const newVersion = execSync("bun packages/cli/src/index.ts --version", { encoding: "utf-8" }).trim();
      console.log(`\n✅ Hive actualizado: ${newVersion}`);
    } catch {
      console.log("\n✅ Hive actualizado");
    }

    // Aplicar actualizaciones de BD
    await applyDatabaseUpdates();

    console.log("\n   Ejecuta 'hive doctor' para validar el entorno.\n");
  } catch (e) {
    console.log(`\n❌ Error durante la actualización: ${(e as Error).message}`);
    console.log(`   Intenta manualmente: git pull && bun install && bun run build\n`);
  }
}

/**
 * Actualiza desde paquete global (bun install -g)
 */
async function updateFromGlobalPackage(): Promise<void> {
  // Mostrar versión actual antes de actualizar
  try {
    const { execSync } = await import("child_process");
    const currentVersion = execSync("hive --version", { encoding: "utf-8" }).trim();
    console.log(`Versión actual: ${currentVersion}`);
  } catch {
    console.log("Versión actual: desconocida");
  }

  // Detectar gestor de paquetes disponible
  const { execSync } = await import("child_process");
  let packageManager: "bun" | "npm" = "npm";
  try {
    execSync("bun --version", { encoding: "utf-8", stdio: "pipe" });
    packageManager = "bun";
  } catch {
    // bun no disponible, usar npm
  }

  const installCmd = packageManager === "bun"
    ? ["bun", "install", "-g", `${MAIN_PACKAGE}@latest`]
    : ["npm", "install", "-g", `${MAIN_PACKAGE}@latest`];

  console.log(`\nDescargando ${MAIN_PACKAGE}@latest (via ${packageManager})...`);

  try {
    const proc = Bun.spawn(installCmd, {
      stdout: "inherit",
      stderr: "inherit",
    });
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      console.log(`\n⚠️  Error durante la actualización (exit code ${exitCode})`);
      console.log(`   Intenta manualmente: ${installCmd.join(" ")}\n`);
      return;
    }

    console.log(`\n✅ Hive actualizado correctamente.`);

    // ──────────────────────────────────────────────
    // Re-seed de la base de datos existente
    // ──────────────────────────────────────────────
    await applyDatabaseUpdates();

    console.log(`\n   Ejecuta 'hive --version' para verificar la nueva versión.`);
    console.log(`   Ejecuta 'hive doctor' para validar el entorno.\n`);
  } catch (e) {
    console.log(`\n⚠️  No se pudo actualizar: ${(e as Error).message}`);
    console.log(`   Intenta manualmente: bun install -g ${MAIN_PACKAGE}@latest\n`);
  }
}

/**
 * Aplica actualizaciones de schema y seed a la BD existente.
 * Se ejecuta después de una actualización del paquete.
 */
async function applyDatabaseUpdates(): Promise<void> {
  const { existsSync } = await import("node:fs");
  const { getHiveDir, initializeDatabase, getDb } = await import("@johpaz/hivelearn-core");
  const path = await import("node:path");

  const dbPath = path.join(getHiveDir(), "data", "hive.db");

  if (!existsSync(dbPath)) {
    console.log(`   ℹ️  No se encontró base de datos existente. Se creará en el próximo 'hive start'.`);
    return;
  }

  console.log(`\n🔄 Verificando base de datos...`);

  try {
    // Initialize database
    initializeDatabase();
    console.log(`   ✅ Schema verificado`);

    const db = getDb();

    // HiveLearn Core no usa SEED_DATA como Hive Agents
    // Las tablas y datos se crean dinámicamente
    console.log(`   ✅ Base de datos lista`);

    // Verificar si el gateway está corriendo para sugerir reload
    const hiveDir = getHiveDir();
    const pidFile = path.join(hiveDir, "gateway.pid");
    if (existsSync(pidFile)) {
      console.log(`\n   💡 El gateway está corriendo. Ejecuta 'hive reload' para aplicar cambios.`);
    }
  } catch (err) {
    console.log(`   ⚠️  No se pudo verificar la base de datos: ${(err as Error).message}`);
    console.log(`   💡 Ejecuta 'hive start' para inicializar la base de datos.`);
  }
}
