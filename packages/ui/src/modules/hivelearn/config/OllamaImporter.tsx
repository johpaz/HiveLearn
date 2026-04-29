import { useState } from "react";
import { apiClient } from "@/lib/api";
import { Cloud, Download, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface OllamaImporterProps {
  onImportComplete?: (count: number) => void;
}

export function OllamaImporter({ onImportComplete }: OllamaImporterProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imported: number; models: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await apiClient<{ ok: boolean; imported: number; models: string[] }>(
        "/api/providers/ollama/import",
        {
          method: "POST",
          showError: false,
        }
      );
      setResult({ imported: data.imported, models: data.models });
      onImportComplete?.(data.imported);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al importar modelos");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-hive-cyan/10">
          <Cloud className="h-5 w-5 text-hive-cyan" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">Importar Modelos</h3>
          <p className="text-xs text-muted-foreground">
            Escanea e importa modelos desde Ollama local
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-secondary/30 p-6 space-y-4">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-lg bg-hive-cyan/10">
            <Cloud className="h-6 w-6 text-hive-cyan" />
          </div>
          <div className="flex-1">
            <h4 className="font-medium text-foreground mb-1">Ollama Local</h4>
            <p className="text-sm text-muted-foreground mb-4">
              Importa automáticamente los modelos instalados en tu instancia local de Ollama.
              Los modelos se agregarán a la base de datos y estarán disponibles para seleccionar.
            </p>

            <button
              onClick={handleImport}
              disabled={loading}
              className="px-4 py-2.5 rounded-lg bg-hive-cyan text-primary-foreground text-sm font-medium hover:bg-hive-cyan/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Escaneando...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Importar Modelos
                </>
              )}
            </button>
          </div>
        </div>

        {result && (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-4 space-y-3">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">{result.imported} modelos importados</span>
            </div>
            {result.models.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {result.models.slice(0, 10).map((model, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 rounded text-xs font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                  >
                    {model}
                  </span>
                ))}
                {result.models.length > 10 && (
                  <span className="text-xs text-muted-foreground">
                    +{result.models.length - 10} más
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
            <div>
              <div className="font-medium text-destructive mb-1">Error de conexión</div>
              <div className="text-sm text-muted-foreground">{error}</div>
              <div className="text-xs text-muted-foreground mt-2">
                Asegúrate de que Ollama esté corriendo en <code className="px-1.5 py-0.5 rounded bg-muted font-mono">localhost:11434</code>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-secondary/30 p-4">
        <h4 className="text-sm font-medium text-foreground mb-2">¿Cómo funciona?</h4>
        <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
          <li>Asegúrate de tener Ollama instalado y corriendo</li>
          <li>Haz clic en "Importar Modelos"</li>
          <li>Los modelos detectados se agregarán automáticamente</li>
          <li>Selecciona el provider "Ollama (Local)" y el modelo importado</li>
        </ol>
      </div>
    </div>
  );
}
