/**
 * TSM-Plugin-Einstieg für den Betrieb in der gene-Shell
 * (eclipse-daanse/org.eclipse.daanse.gene).
 *
 * Registriert die Perspective „SensiNact Mapping" mit der WizardShell als
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
import type { AtlasReadClient } from '../atlas/ModelAtlasClient';
import { AtlasModelSource } from '../atlas/atlasSource';
import { openMappingContent } from '../wizard/openMapping';
import { analyzeMappingXmi } from '../transform/fromProviderMapping';
import {
  atlasSource as sharedAtlasSource,
  openDialogOpen,
  setup as wizardSetup,
  showStatus,
  startNewMapping,
  uploadDialogOpen,
} from '../wizard/context';
import {
  buildArtifacts,
  canPublish,
  canSaveToWorkspace,
  saveToWorkspace,
  setFileSystem,
} from '../wizard/artifacts';
import type { GeneFileSystem } from '../wizard/artifacts';
import { setAtlasBrowser } from '../wizard/useAtlasConnection';
import type { GeneAtlasBrowser } from '../wizard/useAtlasConnection';
import WizardShell from '../wizard/WizardShell.vue';

const PERSPECTIVE_ID = 'sensinact-mapping';
const PANEL_ID = 'sensinact-wizard';
const OBJECT_ACTION_ID = 'sensinact-mapping-wizard.open';
const FILE_ACTION_ID = 'sensinact-mapping-wizard.openFile';

/** Sicht auf den Datei-Aktions-Contribution-Point des File Explorers. */
interface FileActionsLike {
  register(action: {
    id: string;
    label: string;
    icon?: string;
    order?: number;
    matches(entry: WorkspaceEntryLike): boolean;
    run(context: { entry: WorkspaceEntryLike; content: string }): void | Promise<void>;
  }): void;
  unregister(id: string): void;
}
interface WorkspaceEntryLike {
  name: string;
  path: string;
  extension?: string;
}

/** Sicht auf den Objekt-Aktions-Contribution-Point des Atlas-Browsers. */
interface AtlasObjectActionsLike {
  register(action: {
    id: string;
    label: string;
    icon?: string;
    order?: number;
    matches(detail: AtlasObjectMetadataLike, nodeData: AtlasNodeDataLike): boolean;
    run(context: {
      detail: AtlasObjectMetadataLike;
      nodeData: AtlasNodeDataLike;
      content: string;
    }): void | Promise<void>;
  }): void;
  unregister(id: string): void;
}
interface AtlasObjectMetadataLike {
  objectId?: string;
  objectName?: string;
  objectType?: string;
  registry?: string;
  stage?: string;
}
interface AtlasNodeDataLike {
  connectionId: string;
  scopeName?: string;
  registryName?: string;
  stageName?: string;
  objectId?: string;
  isSchemaRegistry?: boolean;
}

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

  // 2. Perspective + Panel + Activity registrieren
  const perspectives = context.services.get<PerspectiveManagerLike>('ui.registry.perspectives');
  perspectives?.registry.register({
    id: PERSPECTIVE_ID,
    name: 'SensiNact Mapping',
    icon: 'pi pi-share-alt',
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
    title: 'SensiNact Mapping-Assistent',
    icon: 'pi pi-share-alt',
    component: markRaw(WizardShell),
    perspectives: [PERSPECTIVE_ID],
    defaultLocation: 'center',
    defaultOrder: 0,
  });

  const activities = context.services.get<ActivityRegistryLike>('ui.registry.activities');
  activities?.register({
    id: 'sensinact-mapping-wizard',
    icon: 'pi pi-share-alt',
    label: 'SensiNact Mapping',
    tooltip: 'SensiNact-Mapping aus Sensormodell erzeugen',
    panelId: PANEL_ID,
    perspectiveId: PERSPECTIVE_ID,
    order: 30,
    perspectives: [PERSPECTIVE_ID],
  });

  // 3. Opener-Service (Perspective-Wechsel).
  //    Wichtig: Der Wechsel muss über den Manager aus `ui.registry.perspectives`
  //    laufen. `ui.perspectives.usePerspective()` liefert eine eigene
  //    Composable-Instanz, deren switchTo die aktive Oberfläche nicht ändert.
  context.services.register('ui.sensinact-wizard.open', () => {
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

  // 4. Laufzeit-Dienste des Hosts übernehmen: Atlas-Verbindungen (für Modell-
  //    und Mapping-Dialoge) und der Workspace (für „Speichern").
  adoptHostServices(context);

  // 5. Menü-Toolbar der Perspective (T24/#201)
  registerMenu(context);

  // 6. Aktion im File Explorer: ein Mapping-XMI aus dem Workspace öffnen
  //    (T25/#202 — Contribution-Point gene.file.actions).
  registerFileAction(context);

  // 7. Aktion im Atlas Browser: ein ProviderMapping direkt hier öffnen
  //    (T22/#193 — Contribution-Point gene.atlas.objectActions).
  registerAtlasObjectAction(context);

  context.log.info('[sensinact-wizard] Perspective, Panel und Activity registriert');
}

/**
 * Dienste des Hosts übernehmen. Sie stehen beim Aktivieren nicht zwingend schon
 * bereit (Ladereihenfolge der Module), deshalb wird kurz nachgefasst, bis beide
 * da sind — sonst bliebe der Assistent ohne Verbindungen und ohne Workspace.
 */
let hostServiceRetry: ReturnType<typeof setTimeout> | undefined;

function adoptHostServices(context: ModuleContext, attempt = 0): void {
  const browser = context.services.get<GeneAtlasBrowser>('gene.atlas.browser');
  const files = context.services.get<GeneFileSystem>('gene.filesystem');
  if (browser) setAtlasBrowser(browser);
  if (files) setFileSystem(files);
  if ((browser && files) || attempt >= 20) return; // ~5 s
  hostServiceRetry = setTimeout(() => adoptHostServices(context, attempt + 1), 250);
}

/**
 * „Im Mapping-Assistenten öffnen" für Mapping-XMIs im Workspace (T25/#202).
 * Ob es wirklich ein ProviderMapping ist, steht erst im Inhalt — das
 * Kontextmenü kann nur die Endung prüfen, deshalb die Meldung im `run`.
 */
function createFileAction(context: ModuleContext) {
  return {
    id: FILE_ACTION_ID,
    label: 'Im Mapping-Assistenten öffnen',
    icon: 'pi pi-share-alt',
    order: 50,
    matches: (entry: WorkspaceEntryLike) =>
      (entry.extension?.toLowerCase() ?? '') === '.xmi' || entry.name.toLowerCase().endsWith('.xmi'),
    run: async ({ entry, content }: { entry: WorkspaceEntryLike; content: string }) => {
      const analysis = analyzeMappingXmi(content);
      if (analysis.rootType && analysis.rootType !== 'ProviderMapping') {
        window.alert(
          `„${entry.name}" ist kein Sensor-Mapping, sondern ein ${analysis.rootType}-Objekt.`,
        );
        return;
      }
      context.services.get<() => void>('ui.sensinact-wizard.open')?.();
      try {
        await openMappingContent({
          content,
          // Fehlende Sensormodelle notfalls aus dem verbundenen Atlas nachladen.
          source: sharedAtlasSource.value,
          document: { source: 'file', name: entry.name },
        });
      } catch (error) {
        showStatus((error as Error).message, 'error');
      }
    },
  };
}

/** Wie beim Atlas-Browser: Der File Explorer kann später aktiviert werden. */
let fileActionRetry: ReturnType<typeof setTimeout> | undefined;

function registerFileAction(context: ModuleContext, attempt = 0): void {
  const registry = context.services.get<FileActionsLike>('gene.file.actions');
  if (registry) {
    registry.register(createFileAction(context));
    context.log.info('[sensinact-wizard] Datei-Aktion registriert');
    return;
  }
  if (attempt >= 20) return; // ~5 s; ohne File Explorer gibt es die Aktion nicht
  fileActionRetry = setTimeout(() => registerFileAction(context, attempt + 1), 250);
}

/** Sicht auf die Menü-Registry des Layouts (gene/packages/ui-layout). */
interface MenuRegistryLike {
  registerMenu(perspectiveId: string, items: unknown[]): void;
  unregisterMenu?(perspectiveId: string): void;
}

/**
 * Dokument-Aktionen in der Menü-Toolbar der Perspective (T24/#201) — wie in
 * den anderen gene-Perspectives (Vorbild: metamodeler). Die `disabled`-
 * Funktionen lesen reaktive Refs; die MenuBar wertet sie beim Rendern aus.
 */
function registerMenu(context: ModuleContext): void {
  const menu = context.services.get<MenuRegistryLike>('gene.menu.registry');
  if (!menu) return;

  menu.registerMenu(PERSPECTIVE_ID, [
    {
      id: 'sensinact.new',
      icon: 'pi pi-file',
      label: 'Neues Mapping',
      action: () => {
        if (wizardSetup.value && !window.confirm('Aktuelles Mapping verwerfen und neu beginnen?')) {
          return;
        }
        startNewMapping();
      },
    },
    {
      id: 'sensinact.open',
      icon: 'pi pi-folder-open',
      label: 'Mapping öffnen',
      action: () => {
        openDialogOpen.value = true;
      },
    },
    { id: 'sensinact.sep1', separator: true, icon: '', label: '', action: () => {} },
    {
      id: 'sensinact.save',
      icon: 'pi pi-save',
      label: 'Speichern',
      disabled: () => !canSaveToWorkspace(),
      action: async () => {
        try {
          const written = await saveToWorkspace(buildArtifacts().files);
          showStatus(
            written.length === 1
              ? `„${written[0]}" im Workspace gespeichert.`
              : `${written.length} Dateien im Workspace gespeichert.`,
          );
        } catch (error) {
          showStatus((error as Error).message, 'error');
        }
      },
    },
    {
      id: 'sensinact.publish',
      icon: 'pi pi-cloud-upload',
      label: 'In den Modelatlas',
      disabled: () => !canPublish(),
      action: () => {
        uploadDialogOpen.value = true;
      },
    },
  ]);
  context.log.info('[sensinact-wizard] Menü registriert');
}

/** Aktion „Im Mapping-Assistenten öffnen" für ProviderMapping-Objekte. */
function createObjectAction(context: ModuleContext) {
  return {
    id: OBJECT_ACTION_ID,
    label: 'Im Mapping-Assistenten öffnen',
    icon: 'pi pi-share-alt',
    order: 50,
    matches: (detail: AtlasObjectMetadataLike, nodeData: AtlasNodeDataLike) =>
      !nodeData.isSchemaRegistry && /ProviderMapping$/.test(detail.objectType ?? ''),
    run: async ({
      detail,
      nodeData,
      content,
    }: {
      detail: AtlasObjectMetadataLike;
      nodeData: AtlasNodeDataLike;
      content: string;
    }) => {
      // Für das Nachladen der Sensormodelle und das Zurückschreiben dieselbe
      // Verbindung nutzen, die der Browser schon offen hat.
      const browser = context.services.get<GeneAtlasBrowser>('gene.atlas.browser');
      const client = browser?.getClient(nodeData.connectionId);
      const source =
        client && nodeData.scopeName
          ? new AtlasModelSource(client, nodeData.scopeName, nodeData.stageName ?? 'release')
          : undefined;
      if (source) sharedAtlasSource.value = source;

      context.services.get<() => void>('ui.sensinact-wizard.open')?.();
      await openMappingContent({
        content,
        source,
        document: {
          source: 'atlas',
          name: detail.objectName || detail.objectId || 'Mapping',
          registry: nodeData.registryName ?? detail.registry,
          stage: nodeData.stageName ?? detail.stage,
          objectId: nodeData.objectId ?? detail.objectId,
        },
      });
    },
  };
}

/**
 * Der Atlas-Browser registriert seinen Contribution-Point beim Aktivieren.
 * `optionalDependencies` im Manifest sorgt für die Reihenfolge; falls das
 * Modul dennoch später kommt (eigenes Repo, geänderte Startliste), wird kurz
 * nachgefasst statt die Aktion stillschweigend zu verlieren.
 */
let objectActionRetry: ReturnType<typeof setTimeout> | undefined;

function registerAtlasObjectAction(context: ModuleContext, attempt = 0): void {
  const registry = context.services.get<AtlasObjectActionsLike>('gene.atlas.objectActions');
  if (registry) {
    registry.register(createObjectAction(context));
    context.log.info('[sensinact-wizard] Atlas-Browser-Aktion registriert');
    return;
  }
  if (attempt >= 20) return; // ~5 s; ohne Atlas-Browser gibt es die Aktion nicht
  objectActionRetry = setTimeout(() => registerAtlasObjectAction(context, attempt + 1), 250);
}

export async function deactivate(context: ModuleContext): Promise<void> {
  clearTimeout(objectActionRetry);
  clearTimeout(hostServiceRetry);
  clearTimeout(fileActionRetry);
  context.services.get<FileActionsLike>('gene.file.actions')?.unregister(FILE_ACTION_ID);
  context.services.get<MenuRegistryLike>('gene.menu.registry')?.unregisterMenu?.(PERSPECTIVE_ID);
  setAtlasBrowser(undefined);
  setFileSystem(undefined);
  context.services
    .get<AtlasObjectActionsLike>('gene.atlas.objectActions')
    ?.unregister(OBJECT_ACTION_ID);
  context.services.get<PanelRegistryLike>('ui.registry.panels')?.unregister?.(PANEL_ID);
  context.services
    .get<ActivityRegistryLike>('ui.registry.activities')
    ?.unregister?.('sensinact-mapping-wizard');
  context.services
    .get<PerspectiveManagerLike>('ui.registry.perspectives')
    ?.registry.unregister?.(PERSPECTIVE_ID);
  context.log.info('[sensinact-wizard] deaktiviert');
}
