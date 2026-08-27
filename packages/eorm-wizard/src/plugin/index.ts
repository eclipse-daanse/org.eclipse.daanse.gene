/**
 * TSM-Plugin-Einstieg für den Betrieb in der gene-Shell
 * (eclipse-daanse/org.eclipse.daanse.gene).
 *
 * Registriert die Perspective „eorm" mit der WizardShell als
 * Center-Panel (Vorbild: gene/packages/atlas-browser/src/index.ts). Alle
 * Package-Registrierungen laufen über setupPackages() und sind idempotent —
 * Ecore-Basis und UIModel-Package bringt der gene-Host bereits mit.
 *
 * Standalone-Betrieb (src/main.ts) bleibt unabhängig von dieser Datei.
 */
import { markRaw } from 'vue';
import type { ModuleContext } from '@eclipse-daanse/tsm';
import { setupPackages } from '../emf/setup';
import { registerWizardWidgets } from '../widgets/register';
import { setAtlasClientFactory, resetAtlasClientFactory } from '../atlas/clientFactory';
import type { AtlasReadClient, ModelAtlasClientOptions } from '../atlas/ModelAtlasClient';
import WizardShell from '../wizard/WizardShell.vue';

const PERSPECTIVE_ID = 'eorm-mapping';
const PANEL_ID = 'eorm-wizard';

/** Minimale Sichten auf die gene-Registries (Strukturen siehe ui-perspectives). */
interface PerspectiveManagerLike {
  registry: { register(p: unknown): void; unregister?(id: string): void };
  /** Umschalten der aktiven Perspective (der echte Manager, nicht das Composable). */
  switchTo?(perspectiveId: string): void | Promise<void>;
}
interface PanelRegistryLike {
  register(p: unknown): void;
  unregister?(id: string): void;
}
interface ActivityRegistryLike {
  register(a: unknown): void;
  unregister?(id: string): void;
}

export async function activate(context: ModuleContext): Promise<void> {
  // 1. Metamodelle + Widgets (idempotent; Assets sind ins Bundle eingebettet)
  await setupPackages();
  registerWizardWidgets();

  // 2. Original-Atlas-Client aus dem storage-model-atlas-Modul beziehen,
  //    falls geladen — sonst bleibt der eigene minimale Client aktiv.
  const atlasModule = context.getModule<{
    ModelAtlasClient?: new (options: ModelAtlasClientOptions) => AtlasReadClient;
  }>('storage-model-atlas');
  if (atlasModule?.ModelAtlasClient) {
    const AtlasClient = atlasModule.ModelAtlasClient;
    setAtlasClientFactory((options) => new AtlasClient(options));
    context.log.info('[eorm-wizard] Verwende ModelAtlasClient aus storage-model-atlas');
  }

  // 3. Perspective + Panel + Activity registrieren
  const perspectives = context.services.get<PerspectiveManagerLike>('ui.registry.perspectives');
  perspectives?.registry.register({
    id: PERSPECTIVE_ID,
    name: 'eorm-Assistent',
    icon: 'pi pi-database',
    requiresWorkspace: false,
    order: 85,
    defaultLayout: {
      left: [],
      center: [PANEL_ID],
      right: [],
      bottom: [],
    },
    defaultVisibility: { left: false, right: false, bottom: false },
  });

  const panels = context.services.get<PanelRegistryLike>('ui.registry.panels');
  panels?.register({
    id: PANEL_ID,
    title: 'eorm-Assistent',
    icon: 'pi pi-database',
    component: markRaw(WizardShell),
    perspectives: [PERSPECTIVE_ID],
    defaultLocation: 'center',
    defaultOrder: 0,
  });

  const activities = context.services.get<ActivityRegistryLike>('ui.registry.activities');
  activities?.register({
    id: 'eorm-mapping-wizard',
    icon: 'pi pi-database',
    label: 'eorm-Mapping',
    tooltip: 'SensiNact-Mapping aus Sensormodell erzeugen',
    panelId: PANEL_ID,
    perspectiveId: PERSPECTIVE_ID,
    order: 30,
    perspectives: [PERSPECTIVE_ID],
  });

  // 4. Opener-Service (Perspective-Wechsel).
  //    Der Wechsel muss über den Manager aus `ui.registry.perspectives` laufen:
  //    `ui.perspectives.usePerspective()` kennt nur die Standard-Perspectives
  //    und meldet für Plugin-Perspectives „Perspective not found".
  context.services.register('ui.eorm-wizard.open', () => {
    const manager = context.services.get<PerspectiveManagerLike>('ui.registry.perspectives');
    if (manager?.switchTo) {
      void manager.switchTo(PERSPECTIVE_ID);
      return;
    }
    context.services
      .get<{ usePerspective?: () => { switchTo(id: string): void } }>('ui.perspectives')
      ?.usePerspective?.()
      .switchTo(PERSPECTIVE_ID);
  });

  context.log.info('[eorm-wizard] Perspective, Panel und Activity registriert');
}

export async function deactivate(context: ModuleContext): Promise<void> {
  resetAtlasClientFactory();
  context.services.get<PanelRegistryLike>('ui.registry.panels')?.unregister?.(PANEL_ID);
  context.services
    .get<ActivityRegistryLike>('ui.registry.activities')
    ?.unregister?.('eorm-mapping-wizard');
  context.services
    .get<PerspectiveManagerLike>('ui.registry.perspectives')
    ?.registry.unregister?.(PERSPECTIVE_ID);
  context.log.info('[eorm-wizard] deaktiviert');
}
