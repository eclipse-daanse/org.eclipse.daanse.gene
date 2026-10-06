/**
 * TSM-Plugin-Einstieg für den Betrieb in der gene-Shell
 * (eclipse-daanse/org.eclipse.daanse.gene).
 *
 * Every mapping is a tab of its own (`sensinact:<document>`), with its own
 * context - two open mappings never meet. The openers (explorer action, Atlas
 * action, the view gene picks by nsURI, the menu) all go through
 * `openWizardTab`; the menu acts on the tab in front. Alle
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
  closeWizardContext,
  wizardContextFor,
  WIZARD_TAB_PREFIX,
} from '../wizard/context';
import type { WizardContext } from '../wizard/context';
import {
  buildArtifacts,
  canPublish,
  canSaveToWorkspace,
  saveToWorkspace,
  setFileSystem,
} from '../wizard/artifacts';
import { setMetamodelResolver, type HostMetamodelResolver } from '../wizard/metamodelResolver';
import type { GeneFileSystem } from '../wizard/artifacts';
import { setAtlasBrowser } from '../wizard/useAtlasConnection';
import type { GeneAtlasBrowser } from '../wizard/useAtlasConnection';
import WizardTab from '../wizard/WizardTab.vue';

/** The menu key - the view names it as the perspective it supersedes */
const PERSPECTIVE_ID = 'sensinact-mapping';
const EDITOR_ID = 'sensinact-mapping';
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

/** Sicht auf den Layout-Zustand (gene/packages/ui-layout). */
interface LayoutLike {
  state: { activeEditorTabId: string | null };
  openEditor(tab: { id: string; title: string; icon?: string; component: unknown; props?: Record<string, unknown> }): void;
  selectEditor?(tabId: string): void;
  onEditorClosed?(handler: (tabId: string) => void): () => void;
}
/** Sicht auf `gene.editor.front` - welcher Tab vorn liegt, und was ihn traegt. */
interface EditorFrontLike {
  bindTab?(tabId: string, editorId: string, filePath?: string): void;
  releaseTab?(tabId: string): void;
  frontTabId?(): string | null;
}

let tabCloseWired = false;
let newMappingCount = 0;

function layoutOf(context: ModuleContext): LayoutLike | undefined {
  return context.services.get<{ useLayoutState?: () => LayoutLike }>('ui.layout.state')?.useLayoutState?.();
}

/**
 * Opens (or brings forward) the tab of a document and returns its context.
 * The tab id names the document, so the same file opens the same tab.
 */
function openWizardTab(context: ModuleContext, tabId: string, title: string, filePath?: string): WizardContext {
  const ctx = wizardContextFor(tabId);
  const layout = layoutOf(context);
  if (!layout) return ctx;
  const front = context.services.get<EditorFrontLike>('gene.editor.front');
  front?.bindTab?.(tabId, EDITOR_ID, filePath);
  if (!tabCloseWired && layout.onEditorClosed) {
    tabCloseWired = true;
    layout.onEditorClosed((closed) => {
      if (!closed.startsWith(WIZARD_TAB_PREFIX)) return;
      closeWizardContext(closed);
      front?.releaseTab?.(closed);
    });
  }
  layout.openEditor({
    id: tabId,
    title,
    icon: 'pi pi-share-alt',
    component: markRaw(WizardTab),
    props: { tabId },
  });
  return ctx;
}

/** A fresh, empty mapping in a tab of its own. */
function openNewMappingTab(context: ModuleContext): WizardContext {
  newMappingCount += 1;
  return openWizardTab(context, `${WIZARD_TAB_PREFIX}neu-${newMappingCount}`, `Neues Mapping ${newMappingCount}`);
}

/** The context of the wizard tab in front, if a wizard tab is in front. */
function frontContext(context: ModuleContext): WizardContext | undefined {
  const front = context.services.get<EditorFrontLike>('gene.editor.front');
  const tabId = front?.frontTabId?.() ?? layoutOf(context)?.state.activeEditorTabId ?? null;
  return tabId && tabId.startsWith(WIZARD_TAB_PREFIX) ? wizardContextFor(tabId) : undefined;
}

export async function activate(context: ModuleContext): Promise<void> {
  // 1. Metamodelle + Widgets (idempotent; Assets sind ins Bundle eingebettet)
  await setupPackages();
  registerWizardWidgets();

  // 2. No perspective, no panel of its own: a mapping is a tab (see openWizardTab).
  //    The menu keeps the old perspective id as its key - the view gene picks
  //    for a mapping names it as the perspective it supersedes.

  // 3. Opener-Service.
  //    With a file and its content - the explorer's "Open with", or the view
  //    gene picks for a mapping by its nsURI - the mapping is opened as well;
  //    without, the wizard just comes to the front.
  context.services.register(
    'ui.sensinact-wizard.open',
    (file?: { name: string; path?: string }, content?: string) => {
      if (file && content !== undefined) {
        const ctx = openWizardTab(context, `${WIZARD_TAB_PREFIX}${file.path ?? file.name}`, file.name, file.path);
        void openWorkspaceMapping(ctx, file.name, content);
      } else {
        openNewMappingTab(context);
      }
    },
  );

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

  context.log.info('[sensinact-wizard] Oeffner, Menue und Aktionen registriert');
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
  const resolver = context.services.get<HostMetamodelResolver>('gene.metamodel.resolver');
  if (browser) setAtlasBrowser(browser);
  if (files) setFileSystem(files);
  if (resolver) setMetamodelResolver(resolver);
  if ((browser && files && resolver) || attempt >= 20) return; // ~5 s
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
      const ctx = openWizardTab(context, `${WIZARD_TAB_PREFIX}${entry.path}`, entry.name, entry.path);
      await openWorkspaceMapping(ctx, entry.name, content);
    },
  };
}

/** A mapping from a workspace file: missing sensor models come from the host or the Atlas. */
async function openWorkspaceMapping(ctx: WizardContext, name: string, content: string): Promise<void> {
  try {
    await openMappingContent({
      context: ctx,
      content,
      // Fehlende Sensormodelle notfalls aus dem verbundenen Atlas nachladen.
      source: sharedAtlasSource.value,
      document: { source: 'file', name },
    });
  } catch (error) {
    ctx.showStatus((error as Error).message, 'error');
  }
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

  // Every action means the tab in front; "new" and "open" start a tab when none is
  menu.registerMenu(PERSPECTIVE_ID, [
    {
      id: 'sensinact.new',
      icon: 'pi pi-file',
      label: 'Neues Mapping',
      action: () => {
        openNewMappingTab(context);
      },
    },
    {
      id: 'sensinact.open',
      icon: 'pi pi-folder-open',
      label: 'Mapping öffnen',
      action: () => {
        const ctx = frontContext(context) ?? openNewMappingTab(context);
        ctx.openDialogOpen.value = true;
      },
    },
    { id: 'sensinact.sep1', separator: true, icon: '', label: '', action: () => {} },
    {
      id: 'sensinact.save',
      icon: 'pi pi-save',
      label: 'Speichern',
      disabled: () => {
        const ctx = frontContext(context);
        return !ctx || !canSaveToWorkspace(ctx);
      },
      action: async () => {
        const ctx = frontContext(context);
        if (!ctx) return;
        try {
          const written = await saveToWorkspace(buildArtifacts(ctx).files);
          ctx.showStatus(
            written.length === 1
              ? `„${written[0]}" im Workspace gespeichert.`
              : `${written.length} Dateien im Workspace gespeichert.`,
          );
        } catch (error) {
          ctx.showStatus((error as Error).message, 'error');
        }
      },
    },
    {
      id: 'sensinact.publish',
      icon: 'pi pi-cloud-upload',
      label: 'In den Modelatlas',
      disabled: () => {
        const ctx = frontContext(context);
        return !ctx || !canPublish(ctx);
      },
      action: () => {
        const ctx = frontContext(context);
        if (ctx) ctx.uploadDialogOpen.value = true;
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

      const objectId = nodeData.objectId ?? detail.objectId ?? 'mapping';
      const registry = nodeData.registryName ?? detail.registry ?? '';
      const title = detail.objectName || detail.objectId || 'Mapping';
      const ctx = openWizardTab(context, `${WIZARD_TAB_PREFIX}atlas/${registry}/${objectId}`, title);
      await openMappingContent({
        context: ctx,
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
  context.services.unregister('ui.sensinact-wizard.open');
  context.log.info('[sensinact-wizard] deaktiviert');
}
