/**
 * Veröffentlichen der Konfiguration in einen Model-Atlas-Scope
 * (Plan, Abschnitt 5). Vorbild ist das Seed-Skript des data.atlas-Repos
 * (`docker/dockercompose/seed/seed.sh`).
 *
 * Der Ablauf ist mehr als ein Upload, und jeder Schritt hat einen Grund:
 *
 *  1. **Schemas sicherstellen, je Stage.** Jede Stage löst Verweise gegen ihre
 *     eigene Package-Sicht auf; ein Schema in `draft` hilft `release` nicht.
 *     Ein Schema-Transition-Weg ist nicht verlässlich, weil das
 *     Referenz-Setup `delete.after.transition: true` fährt.
 *  2. **Reihenfolge eorm → configuration → Domäne.** `configuration.ecore`
 *     verweist auf `eorm#//EntityMappings`; fehlt eorm, bleibt der Verweis
 *     unaufgelöst (dieselbe Reihenfolge wie in `setup.ts`).
 *  3. **Instanz hochladen, mit Wiederholung.** Die Stage-Package-Sicht holt
 *     asynchron auf; direkt nach dem Schema-Upload antwortet der Atlas
 *     mitunter mit 5xx („Error de-serializing incoming data").
 *  4. **Optionaler Stage-Wechsel**, weil der Data Atlas die finale Stage liest.
 */
import type { AtlasModelSource } from './atlasSource';

/** Ein Schema, das im Scope liegen muss. */
export interface RequiredSchema {
  nsUri: string;
  name: string;
  /** Inhalt der .ecore — nur nötig, wenn es fehlt. */
  content: string;
}

export interface PublishTarget {
  registry: string;
  /** Stage, in die die Instanz geschrieben wird. */
  stage: string;
  /** Stage, in die anschließend gewechselt wird — leer heißt: kein Wechsel. */
  targetStage?: string;
  objectId: string;
  objectName?: string;
}

export type PublishStepState = 'offen' | 'laeuft' | 'fertig' | 'uebersprungen' | 'fehler';

export interface PublishStep {
  /** Kurzer Text für die Fortschrittsliste. */
  label: string
  state: PublishStepState;
  detail?: string;
}

export interface PublishOptions {
  /** Wird nach jeder Zustandsänderung gerufen — für die Anzeige. */
  onProgress?: (steps: PublishStep[]) => void;
  /** Nur für Tests: Wartezeit zwischen zwei Versuchen. */
  retryDelayMs?: number;
  /** Nur für Tests: Zahl der Versuche für den Instanz-Upload. */
  maxAttempts?: number;
}

const DEFAULT_ATTEMPTS = 10;
const DEFAULT_DELAY_MS = 3000;

export class PublishError extends Error {
  constructor(
    message: string,
    public readonly steps: PublishStep[],
  ) {
    super(message);
    this.name = 'PublishError';
  }
}

const schlafe = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Führt den Ablauf aus. Wirft mit den bis dahin erreichten Schritten, damit
 * die Oberfläche zeigen kann, wo es hing.
 */
export async function publishConfiguration(
  source: AtlasModelSource,
  target: PublishTarget,
  schemas: RequiredSchema[],
  xmi: string,
  options: PublishOptions = {},
): Promise<PublishStep[]> {
  const steps: PublishStep[] = [];
  const melde = () => options.onProgress?.([...steps]);
  const beginne = (label: string): PublishStep => {
    const step: PublishStep = { label, state: 'laeuft' };
    steps.push(step);
    melde();
    return step;
  };

  // Alle Stages, in denen die Schemas liegen müssen: die Ziel-Stage und die,
  // in die gewechselt wird.
  const stages = [target.stage, ...(target.targetStage ? [target.targetStage] : [])];

  for (const stage of stages) {
    for (const schema of schemas) {
      const step = beginne(`Schema ${schema.name} in ${stage}`);
      try {
        if (await source.hasSchema(stage, schema.nsUri)) {
          step.state = 'uebersprungen';
          step.detail = 'liegt bereits dort';
          melde();
          continue;
        }
        if (!source.canUploadSchemas) {
          step.state = 'fehler';
          step.detail = 'fehlt im Scope, und dieser Zugang darf keine Schemas laden';
          melde();
          throw new PublishError(
            `Das Schema ${schema.name} (${schema.nsUri}) fehlt in der Stage ${stage}, ` +
              `und der Zugang darf keine Schemas hochladen.`,
            steps,
          );
        }
        await source.uploadSchema(stage, schema.content, {
          nsUri: schema.nsUri,
          name: schema.name,
          version: '1.0.0',
        });
        step.state = 'fertig';
        step.detail = 'hochgeladen';
        melde();
      } catch (e) {
        if (e instanceof PublishError) throw e;
        step.state = 'fehler';
        step.detail = nachricht(e);
        melde();
        throw new PublishError(
          `Das Schema ${schema.name} konnte in ${stage} nicht bereitgestellt werden: ${nachricht(e)}`,
          steps,
        );
      }
    }
  }

  // ── Instanz ──────────────────────────────────────────────────────────────
  const versuche = options.maxAttempts ?? DEFAULT_ATTEMPTS;
  const wartezeit = options.retryDelayMs ?? DEFAULT_DELAY_MS;
  const uploadStep = beginne(`Konfiguration nach ${target.registry}/${target.stage}`);
  let letzterFehler: unknown;
  for (let versuch = 1; versuch <= versuche; versuch++) {
    try {
      await source.publishObject(target.registry, target.stage, target.objectId, xmi, {
        name: target.objectName ?? target.objectId,
        override: true,
      });
      uploadStep.state = 'fertig';
      uploadStep.detail = versuch > 1 ? `im ${versuch}. Versuch` : undefined;
      melde();
      letzterFehler = undefined;
      break;
    } catch (e) {
      letzterFehler = e;
      // Nur bei 5xx wiederholen: die Stage-Package-Sicht holt asynchron auf.
      if (!istVoruebergehend(e) || versuch === versuche) break;
      uploadStep.detail = `Versuch ${versuch} von ${versuche} — der Atlas holt noch auf`;
      melde();
      await schlafe(wartezeit);
    }
  }
  if (letzterFehler) {
    uploadStep.state = 'fehler';
    uploadStep.detail = nachricht(letzterFehler);
    melde();
    throw new PublishError(
      `Die Konfiguration konnte nicht hochgeladen werden: ${nachricht(letzterFehler)}`,
      steps,
    );
  }

  // ── Stage-Wechsel ────────────────────────────────────────────────────────
  if (target.targetStage) {
    const step = beginne(`Wechsel nach ${target.targetStage}`);
    try {
      await source.transitionObject(
        target.registry,
        target.stage,
        target.objectId,
        target.targetStage,
      );
      step.state = 'fertig';
      melde();
    } catch (e) {
      step.state = 'fehler';
      step.detail = nachricht(e);
      melde();
      throw new PublishError(`Der Stage-Wechsel schlug fehl: ${nachricht(e)}`, steps);
    }
  }

  return steps;
}

/** 5xx heißt: der Atlas ist noch nicht bereit, gleich nochmal. */
function istVoruebergehend(e: unknown): boolean {
  const text = nachricht(e);
  return /HTTP 5\d\d/.test(text) || /de-serializing/i.test(text);
}

function nachricht(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
