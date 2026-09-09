/**
 * TSM-Plugin-Einstieg für den Betrieb in der gene-Shell.
 *
 * Registriert die Perspective „Data Atlas" mit der WizardShell als
 * Center-Panel (Vorbild: eorm-wizard/src/plugin/index.ts). Der
 * Standalone-Betrieb (src/main.ts) bleibt unabhängig von dieser Datei.
 *
 * Noch nicht enthalten: Metamodell-Registrierung (Schritt 3 der
 * Umsetzungsreihenfolge) und der Atlas-Client (Schritt 10).
 */
import { markRaw } from 'vue';
import type { ModuleContext } from '@eclipse-daanse/tsm';
import WizardShell from '../wizard/WizardShell.vue';

const PERSPECTIVE_ID = 'data-atlas-config';
const PANEL_ID = 'data-atlas-wizard';
const ACTIVITY_ID = 'data-atlas-config-wizard';

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
  const perspectives = context.services.get<PerspectiveManagerLike>('ui.registry.perspectives');
  perspectives?.registry.register({
    id: PERSPECTIVE_ID,
    name: 'Data-Atlas-Assistent',
    icon: 'pi pi-server',
    requiresWorkspace: false,
    order: 86,
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
    title: 'Data-Atlas-Assistent',
    icon: 'pi pi-server',
    component: markRaw(WizardShell),
    perspectives: [PERSPECTIVE_ID],
    defaultLocation: 'center',
    defaultOrder: 0,
  });

  const activities = context.services.get<ActivityRegistryLike>('ui.registry.activities');
  activities?.register({
    id: ACTIVITY_ID,
    icon: 'pi pi-server',
    label: 'Data Atlas',
    tooltip: 'Data-Atlas-Konfiguration aus einem Domänenmodell erzeugen',
    panelId: PANEL_ID,
    perspectiveId: PERSPECTIVE_ID,
    order: 31,
    perspectives: [PERSPECTIVE_ID],
  });

  // Opener-Service. Der Wechsel muss über den Manager aus
  // `ui.registry.perspectives` laufen: `ui.perspectives.usePerspective()`
  // kennt nur die Standard-Perspectives und meldet für Plugin-Perspectives
  // „Perspective not found".
  context.services.register('ui.data-atlas-wizard.open', () => {
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

  context.log.info('[data-atlas-wizard] Perspective, Panel und Activity registriert');
}

export async function deactivate(context: ModuleContext): Promise<void> {
  context.services.get<PanelRegistryLike>('ui.registry.panels')?.unregister?.(PANEL_ID);
  context.services.get<ActivityRegistryLike>('ui.registry.activities')?.unregister?.(ACTIVITY_ID);
  context.services
    .get<PerspectiveManagerLike>('ui.registry.perspectives')
    ?.registry.unregister?.(PERSPECTIVE_ID);
  context.log.info('[data-atlas-wizard] deaktiviert');
}
