// @vitest-environment jsdom
/**
 * Verdrahtung der handgeschriebenen Schritte (Schritt 8b).
 *
 * Die Logik selbst decken context/validate/transform ab. Hier geht es um die
 * Kette, die man sonst nur in der laufenden App sieht: Klick im Formular →
 * Wert im Fassadenmodell → `touch()`, damit die Anzeige nachzieht. Genau da
 * saßen in diesem Projekt schon mehrere Fehler, die kein Unit-Test sah.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { flushPromises, mount } from '@vue/test-utils';
import type { EPackage } from '@emfts/core';
import { registerEcoreFromString, setupPackages } from '../src/emf/setup';
import { atlasSource, initSetup, setConfigMode, setup, version } from '../src/wizard/context';
import ModelSourceStep from '../src/wizard/ModelSourceStep.vue';
import DatasetsStep from '../src/wizard/DatasetsStep.vue';
import ExportsStep from '../src/wizard/ExportsStep.vue';
import SummaryStep from '../src/wizard/SummaryStep.vue';
import { ConfigMode, DataatlaswizardFactory, ExportKind } from '../src/generated';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
let personPackage: EPackage;

beforeAll(async () => {
  await setupPackages();
  personPackage = registerEcoreFromString(
    readFileSync(join(fixtures, 'person.ecore'), 'utf-8'),
    'model/person.ecore',
  );
});

beforeEach(() => {
  initSetup(personPackage);
});

describe('DatasetsStep', () => {
  it('zeigt je konkreter Klasse eine Zeile', () => {
    const wrapper = mount(DatasetsStep);
    expect(wrapper.findAll('tbody tr')).toHaveLength(setup.value!.datasets.length);
  });

  it('das Häkchen schaltet selected und stößt touch an', async () => {
    const wrapper = mount(DatasetsStep);
    const vorher = version.value;
    const box = wrapper.find('tbody tr input[type="checkbox"]');
    await box.setValue(false);

    expect(setup.value!.datasets[0].selected).toBe(false);
    expect(version.value).toBeGreaterThan(vorher);
  });

  it('eine Eingabe landet im Modell', async () => {
    const wrapper = mount(DatasetsStep);
    const felder = wrapper.findAll('tbody tr:first-child input[type="text"]');
    // Reihenfolge der Spalten: id, Name, Pfad, Beschreibung
    await felder[0].setValue('personen');
    expect(setup.value!.datasets[0].id).toBe('personen');
    await felder[2].setValue('leute');
    expect(setup.value!.datasets[0].path).toBe('leute');
  });

  it('doppelte ids werden als Hinweis gemeldet', async () => {
    // person.ecore hat nur eine konkrete Klasse — fuer den Fall braucht es
    // einen zweiten Datensatz auf derselben Klasse.
    const s = setup.value!;
    const zweiter = DataatlaswizardFactory.eINSTANCE.createDatasetConfig();
    zweiter.targetClass = s.datasets[0].targetClass;
    zweiter.id = s.datasets[0].id;
    zweiter.name = 'Zweiter';
    zweiter.description = 'Zweiter.';
    zweiter.path = 'zweiter';
    s.datasets.push(zweiter);

    const wrapper = mount(DatasetsStep);
    expect(wrapper.text()).toMatch(/mehrfach vergeben/);
  });

  it('ohne Auswahl steht der Hinweis dort', async () => {
    const wrapper = mount(DatasetsStep);
    for (const box of wrapper.findAll('tbody tr input[type="checkbox"]')) {
      await box.setValue(false);
    }
    expect(wrapper.text()).toMatch(/Kein Datensatz ausgewählt/);
  });
});

describe('ExportsStep', () => {
  it('nichts gewählt heißt: die Vorgaben gelten', () => {
    const wrapper = mount(ExportsStep);
    expect(wrapper.text()).toMatch(/es gelten JSON und XML/);
    expect(setup.value!.exports).toHaveLength(0);
  });

  it('Anhaken legt einen Eintrag an, Abhaken entfernt ihn', async () => {
    const wrapper = mount(ExportsStep);
    const boxen = wrapper.findAll('.formate > li input[type="checkbox"]');
    await boxen[0].setValue(true); // JSON
    expect(setup.value!.exports.map((e) => e.kind)).toEqual([ExportKind.JSON]);

    await wrapper.findAll('.formate > li input[type="checkbox"]')[0].setValue(false);
    expect(setup.value!.exports).toHaveLength(0);
  });

  it('CSV blendet seine Optionen ein und schreibt sie', async () => {
    const wrapper = mount(ExportsStep);
    const boxen = wrapper.findAll('.formate > li input[type="checkbox"]');
    await boxen[2].setValue(true); // CSV
    const trenner = wrapper.find('.csv-optionen input[type="text"]');
    expect(trenner.exists()).toBe(true);
    await trenner.setValue('|');
    expect(setup.value!.exports[0].separator).toBe('|');
  });

  it('nur CSV warnt vor dem 406', async () => {
    const wrapper = mount(ExportsStep);
    await wrapper.findAll('.formate > li input[type="checkbox"]')[2].setValue(true);
    expect(wrapper.text()).toMatch(/406/);
  });
});

describe('SummaryStep', () => {
  it('zeigt die Prüfliste und bietet den Download an', () => {
    const wrapper = mount(SummaryStep);
    expect(wrapper.text()).toMatch(/Konfiguration herunterladen/);
    expect(wrapper.text()).toContain('dataatlas.xmi');
    // Der abgeleitete Zustand ist vollständig — kein Fehlerkasten
    expect(wrapper.find('.fehlerbox').exists()).toBe(false);
  });

  it('die Vorschau zeigt das erzeugte XMI', async () => {
    const wrapper = mount(SummaryStep);
    await wrapper.findAll('button')[1].trigger('click');
    const vorschau = wrapper.find('.vorschau').text();
    expect(vorschau).toContain('<configuration:DataAtlasConfiguration');
    expect(vorschau).toContain('href="model/person.ecore#//Person"');
  });

  it('ein fehlendes Pflichtfeld erscheint als Fehler, nicht als Absturz', async () => {
    setup.value!.urlContext = '';
    const wrapper = mount(SummaryStep);
    expect(wrapper.find('.fehlerbox').exists()).toBe(true);
    expect(wrapper.text()).toMatch(/Basis-Pfad/);
    expect(wrapper.text()).not.toMatch(/Konfiguration herunterladen/);
  });
});

describe('ModelSourceStep', () => {
  it('nimmt alle geladenen Packages in die Datei-Karte auf', async () => {
    /*
     * Der entscheidende Unterschied zum eorm-Assistenten: im Datei-Modus
     * braucht JEDES referenzierte Package den Pfad seiner .ecore, sonst wirft
     * der Serializer. Der Schritt trägt deshalb auch die Abhängigkeiten ein,
     * mit ihrem echten Dateinamen, wo er bekannt ist.
     */
    const zweites = registerEcoreFromString(
      readFileSync(join(fixtures, 'person.ecore'), 'utf-8')
        .replace('name="person"', 'name="basis"')
        .replace('example/person/1.0.0', 'example/basis/1.0.0'),
      'model/basis.ecore',
    );
    const wrapper = mount(ModelSourceStep);
    const tab = wrapper.findComponent({ name: 'UploadSourceTab' });
    tab.vm.$emit('packages-loaded', {
      candidates: [personPackage],
      all: [personPackage, zweites],
      fileNames: ['person.ecore', 'schemas/basis.ecore'],
      warnings: [],
    });
    await wrapper.vm.$nextTick();

    const dateien = setup.value!.modelFiles;
    expect(dateien).toHaveLength(2);
    expect(dateien[0].fileName).toBe('model/person.ecore');
    // Der echte Name der Abhängigkeit, nicht die Ableitung
    expect(dateien[1].fileName).toBe('schemas/basis.ecore');
    expect(setup.value!.modelPackage).toBe(personPackage);
  });

  it('ein Modellwechsel behält den gewählten Modus', async () => {
    const wrapper = mount(ModelSourceStep);
    const tab = wrapper.findComponent({ name: 'UploadSourceTab' });
    tab.vm.$emit('packages-loaded', {
      candidates: [personPackage],
      all: [personPackage],
      warnings: [],
    });
    await wrapper.vm.$nextTick();

    setConfigMode(ConfigMode.ATLAS);
    tab.vm.$emit('packages-loaded', {
      candidates: [personPackage],
      all: [personPackage],
      warnings: [],
    });
    await wrapper.vm.$nextTick();
    expect(setup.value!.configMode).toBe(ConfigMode.ATLAS);
  });

  it('filtert nur die Atlas-API-Metamodelle, nicht die Domänenmodelle', async () => {
    /*
     * Die Vorlage im eorm-Assistenten filtert Kandidaten mit
     * `nsURI.includes('/atlas/')`. Genau das trifft die Modelle dieses
     * Assistenten: `…/fennec/data/atlas/example/person/1.0.0`. Geprüft wird
     * deshalb der Präfix der API-Modelle.
     */
    const api = registerEcoreFromString(
      readFileSync(join(fixtures, 'person.ecore'), 'utf-8')
        .replace('name="person"', 'name="apimodell"')
        .replace(
          'nsURI="https://eclipse.org/fennec/data/atlas/example/person/1.0.0"',
          'nsURI="http://eclipse.org/fennec/model/atlas/management/1.0.0"',
        ),
      'model/api.ecore',
    );
    const wrapper = mount(ModelSourceStep);
    const tab = wrapper.findComponent({ name: 'UploadSourceTab' });
    tab.vm.$emit('packages-loaded', {
      candidates: [personPackage, api],
      all: [personPackage, api],
      warnings: [],
    });
    await wrapper.vm.$nextTick();

    const optionen = wrapper.findAll('option').map((o) => o.text());
    expect(optionen.some((t) => t.includes('example/person'))).toBe(true);
    expect(optionen.some((t) => t.includes('model/atlas/management'))).toBe(false);
    expect(setup.value!.modelPackage).toBe(personPackage);
  });

  it('Warnungen des Ladevorgangs erscheinen', async () => {
    const wrapper = mount(ModelSourceStep);
    const tab = wrapper.findComponent({ name: 'UploadSourceTab' });
    tab.vm.$emit('packages-loaded', {
      candidates: [personPackage],
      all: [personPackage],
      warnings: ['Das Modell referenziert „basis.ecore".'],
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('basis.ecore');
  });
});

describe('SummaryStep: Veröffentlichen', () => {
  /** Stellvertreter für die Atlas-Verbindung — nur was das Panel braucht. */
  function fakeSource(overrides: Record<string, unknown> = {}) {
    return {
      canPublish: true,
      canUploadSchemas: true,
      canTransition: true,
      listRegistries: async () => [
        { name: 'configurations', stages: [{ name: 'draft' }, { name: 'release' }] },
      ],
      hasSchema: async () => true,
      publishObject: vi.fn(async () => undefined),
      uploadSchema: vi.fn(async () => undefined),
      transitionObject: vi.fn(async () => undefined),
      ...overrides,
    };
  }

  beforeEach(() => {
    atlasSource.value = undefined;
  });

  it('ohne Verbindung steht dort der Hinweis', () => {
    const wrapper = mount(SummaryStep);
    expect(wrapper.find('.publish-card').exists()).toBe(false);
    expect(wrapper.text()).toMatch(/einen Model Atlas verbinden/);
  });

  it('mit Verbindung erscheinen Registry und Stages', async () => {
    atlasSource.value = fakeSource() as never;
    const wrapper = mount(SummaryStep);
    await flushPromises();
    expect(wrapper.find('.publish-card').exists()).toBe(true);
    const optionen = wrapper.findAll('.publish-row select option').map((o) => o.text());
    expect(optionen).toContain('configurations');
    expect(optionen).toContain('draft');
    expect(optionen).toContain('release');
  });

  it('ein Zugang ohne Schreibrecht bekommt kein Formular', async () => {
    atlasSource.value = fakeSource({ canPublish: false }) as never;
    const wrapper = mount(SummaryStep);
    await flushPromises();
    expect(wrapper.text()).toMatch(/darf nicht schreiben/);
    expect(wrapper.find('.publish-row').exists()).toBe(false);
  });

  it('Veröffentlichen lädt hoch und schiebt in die nächste Stage', async () => {
    const source = fakeSource();
    atlasSource.value = source as never;
    const wrapper = mount(SummaryStep);
    await flushPromises();

    const knopf = wrapper.findAll('button').find((b) => b.text().includes('Veröffentlichen'))!;
    await knopf.trigger('click');
    await flushPromises();

    expect(source.publishObject).toHaveBeenCalledWith(
      'configurations',
      'draft',
      'dataatlas',
      expect.stringContaining('<configuration:DataAtlasConfiguration'),
      expect.objectContaining({ override: true }),
    );
    // draft ist die erste Stage, geschoben wird nach release
    expect(source.transitionObject).toHaveBeenCalledWith(
      'configurations',
      'draft',
      'dataatlas',
      'release',
    );
    expect(wrapper.text()).toMatch(/Veröffentlicht\./);
  });

  it('ein Fehler beim Hochladen erscheint als Meldung', async () => {
    const source = fakeSource({
      publishObject: vi.fn(async () => {
        throw new Error('Upload fehlgeschlagen (HTTP 403): read-only stage');
      }),
    });
    atlasSource.value = source as never;
    const wrapper = mount(SummaryStep);
    await flushPromises();
    const knopf = wrapper.findAll('button').find((b) => b.text().includes('Veröffentlichen'))!;
    await knopf.trigger('click');
    await flushPromises();

    expect(wrapper.find('.publish-fehler').text()).toMatch(/403/);
    expect(wrapper.text()).not.toMatch(/Veröffentlicht\./);
  });
});
