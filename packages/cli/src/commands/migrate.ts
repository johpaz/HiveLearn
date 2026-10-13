/**
 * Migrate Command — Re-seed idempotente del almacenamiento HiveDB
 *
 * HiveLearn ya no usa SQLite: el motor es @johpaz/hive-db (colecciones de
 * documentos + índice semántico). No hay DDL ni migraciones de schema —
 * este comando fuerza el bootstrap idempotente (índices + seed), útil cuando:
 * - Se actualizó el paquete pero el seed no se aplicó
 * - Se agregaron nuevas tools/models/providers al seed
 */

import * as fs from "node:fs";
import { getDbPath } from "@hivelearn/core"

export async function migrate(): Promise<void> {
  console.log("\n🔄 Aplicando bootstrap de HiveDB (HiveLearn)...\n");

  const dbPath = getDbPath();

  if (!fs.existsSync(dbPath)) {
    console.log("⚠️  No se encontró base de datos existente.");
    console.log("   Ejecuta 'hivelearn start' para crear una nueva.\n");
    return;
  }

  try {
    const { initializeDatabase, getDb, initHiveLearnStorage } = await import("@hivelearn/core");

    console.log("📐 Inicializando HiveDB...");
    await initializeDatabase();
    console.log("   ✅ HiveDB lista");

    const db = getDb();
    const count = async (name: string) => db.collection(name).count();

    const before = {
      models: await count("models"),
      providers: await count("providers"),
      agents: await count("hl_agents"),
      searchIndex: await count("hl_search_index"),
    };

    console.log("\n🌱 Aplicando seed e índices (idempotente)...");
    await initHiveLearnStorage();

    const after = {
      models: await count("models"),
      providers: await count("providers"),
      agents: await count("hl_agents"),
      searchIndex: await count("hl_search_index"),
    };

    console.log("\n📊 Resumen de cambios:");
    const rows: Array<{ name: string; before: number; after: number }> = [
      { name: "Models", before: before.models, after: after.models },
      { name: "Providers", before: before.providers, after: after.providers },
      { name: "Agentes hl_*", before: before.agents, after: after.agents },
      { name: "Índice de búsqueda", before: before.searchIndex, after: after.searchIndex },
    ];

    let hadChanges = false;
    for (const r of rows) {
      const diff = r.after - r.before;
      if (diff > 0) {
        console.log(`   ✅ +${diff} ${r.name.toLowerCase()}`);
        hadChanges = true;
      }
    }

    if (!hadChanges) {
      console.log("   ✅ Todo actualizado, sin cambios nuevos");
    }

    console.log("\n✅ Bootstrap completado.\n");
  } catch (err) {
    console.error(`\n❌ Error durante el bootstrap: ${(err as Error).message}`);
    console.error("   💡 Ejecuta 'hivelearn doctor' para más diagnóstico.\n");
    process.exit(1);
  }
}
