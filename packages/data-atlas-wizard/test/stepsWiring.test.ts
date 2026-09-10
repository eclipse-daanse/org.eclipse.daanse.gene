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
import { atlasSource, initSetup, setup, version } from '../src/wizard/context';
import ModelSourceStep from '../src/wizard/ModelSourceStep.vue';
import ChainsStep from '../src/wizard/ChainsStep.vue';
import SummaryStep from '../src/wizard/SummaryStep.vue';
import { DataatlaswizardFactory, ExportKind, InputKind } from '../src/generated';

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

describe('ChainsStep: Datensätze', () => {
  it('zeigt je konkreter Klasse eine Zeile', () => {
    const wrapper = mount(ChainsStep);
    expect(wrapper.findAll('tbody tr')).toHaveLength(setup.value!.chains[0].datasets.length);
  });

  it('das Häkchen schaltet selected und stößt touch an', async () => {
    const wrapper = mount(ChainsStep);
    const vorher = version.value;
    const box = wrapper.find('tbody tr input[type="checkbox"]');
    await box.setValue(false);

    expect(setup.value!.chains[0].datasets[0].selected).toBe(false);
    expect(version.value).toBeGreaterThan(vorher);
  });

  it('eine Eingabe landet im Modell', async () => {
    const wrapper = mount(ChainsStep);
    const felder = wrapper.findAll('tbody tr:first-child input[type="text"]');
    // Reihenfolge der Spalten: id, Name, Pfad, Beschreibung
    await felder[0].setValue('personen');
    expect(setup.value!.chains[0].datasets[0].id).toBe('personen');
    await felder[2].setValue('leute');
    expect(setup.value!.chains[0].datasets[0].path).toBe('leute');
  });

  it('doppelte ids werden als Hinweis gemeldet', () => {
    // person.ecore hat nur eine konkrete Klasse — fuer den Fall braucht es
    // einen zweiten Datensatz auf derselben Klasse.
    const kette = setup.value!.chains[0];
    const zweiter = DataatlaswizardFactory.eINSTANCE.createDatasetConfig();
    zweiter.targetClass = kette.datasets[0].targetClass;
    zweiter.id = kette.datasets[0].id;
    zweiter.name = 'Zweiter';
    zweiter.description = 'Zweiter.';
    zweiter.path = 'zweiter';
    kette.datasets.push(zweiter);

    const wrapper = mount(ChainsStep);
    expect(wrapper.text()).toMatch(/mehrfach vergeben/);
  });

  it('ohne Auswahl steht der Hinweis am Weg', async () => {
    const wrapper = mount(ChainsStep);
    for (const box of wrapper.findAll('tbody tr input[type="checkbox"]')) {
      await box.setValue(false);
    }
    expect(wrapper.find('.probleme').text()).toMatch(/Kein Datensatz ausgewählt/);
  });
});

describe('ChainsStep: Formate', () => {
  it('nichts gewählt heißt: die Vorgaben gelten', () => {
    const wrapper = mount(ChainsStep);
    expect(wrapper.text()).toMatch(/es gelten JSON und XML/);
    expect(setup.value!.chains[0].exports).toHaveLength(0);
  });

  it('Anhaken legt einen Eintrag am Weg an, Abhaken entfernt ihn', async () => {
    const wrapper = mount(ChainsStep);
    const boxen = wrapper.findAll('.formate > li input[type="checkbox"]');
    await boxen[0].setValue(true); // JSON
    expect(setup.value!.chains[0].exports.map((e) => e.kind)).toEqual([ExportKind.JSON]);

    await wrapper.findAll('.formate > li input[type="checkbox"]')[0].setValue(false);
    expect(setup.value!.chains[0].exports).toHaveLength(0);
  });

  it('CSV blendet seine Optionen ein und schreibt sie', async () => {
    const wrapper = mount(ChainsStep);
    const boxen = wrapper.findAll('.formate > li input[type="checkbox"]');
    await boxen[2].setValue(true); // CSV
    const trenner = wrapper.find('.csv input[type="text"]');
    expect(trenner.exists()).toBe(true);
    await trenner.setValue('|');
    expect(setup.value!.chains[0].exports[0].separator).toBe('|');
  });
});

describe('ChainsStep: Wege und Quellen', () => {
  it('ein zweiter Weg kommt mit eigener Quelle und ohne Auswahl', async () => {
    const wrapper = mount(ChainsStep);
    const knopf = wrapper.findAll('button').find((b) => b.text().includes('Datenweg (Datei)'))!;
    await knopf.trigger('click');

    const s = setup.value!;
    expect(s.chains).toHaveLength(2);
    expect(s.chains[1].source?.kind).toBe(InputKind.FILE);
    // Welche Klassen aus diesem Weg kommen, entscheidet der Nutzer
    expect(s.chains[1].datasets.every((d) => !d.selected)).toBe(true);
    expect(wrapper.findAll('.kette')).toHaveLength(2);
  });

  it('der zweite Weg kann die Quelle des ersten mitbenutzen', async () => {
    const wrapper = mount(ChainsStep);
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Datenweg (Datenbank)'))!
      .trigger('click');

    const erste = setup.value!.chains[0].source!;
    const wahl = wrapper.findAll('.kette')[1].find('.art select');
    const angebot = wahl.findAll('option').map((o) => o.attributes('value'));
    expect(angebot).toContain(`shared:${erste.id}`);

    await wahl.setValue(`shared:${erste.id}`);
    expect(setup.value!.chains[1].sharedSource).toBe(erste);
    expect(setup.value!.chains[1].source).toBeFalsy();
    // Statt der Felder steht dort der Hinweis auf die geteilte Quelle
    expect(wrapper.findAll('.kette')[1].find('.geteilt').text()).toContain(erste.id);
  });

  it('die Wahl „eigene Datenbank" tauscht die Quelle des Wegs', async () => {
    const wrapper = mount(ChainsStep);
    await wrapper.find('.art select').setValue(InputKind.DATABASE);
    const quelle = setup.value!.chains[0].source!;
    expect(quelle.kind).toBe(InputKind.DATABASE);
    expect(quelle.dataSourceFilter).toBeTruthy();
    // Und die Warnung zum abgeleiteten Mapping erscheint in der Zusammenfassung
    expect(wrapper.findAll('.kette')[0].text()).toContain('Filter auf den DataSource-Dienst');
  });

  it('der erste Weg lässt sich nicht entfernen, solange er der einzige ist', async () => {
    const wrapper = mount(ChainsStep);
    const weg = wrapper.find('.kette .weg');
    expect(weg.attributes('disabled')).toBeDefined();

    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Datenweg (Datei)'))!
      .trigger('click');
    await wrapper.findAll('.kette')[1].find('.weg').trigger('click');
    expect(setup.value!.chains).toHaveLength(1);
  });

  it('die id des Wegs landet im Modell', async () => {
    const wrapper = mount(ChainsStep);
    await wrapper.find('.kette input.id').setValue('personen-weg');
    expect(setup.value!.chains[0].id).toBe('personen-weg');
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
    expect(vorschau).toContain(
      'href="https://eclipse.org/fennec/data/atlas/example/person/1.0.0#//Person"',
    );
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
  it('das gewählte Modell wird übernommen, Abhängigkeiten bleiben registriert', async () => {
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
      warnings: [],
    });
    await wrapper.vm.$nextTick();

    expect(setup.value!.modelPackage).toBe(personPackage);
    expect(setup.value!.chains[0].datasets.length).toBeGreaterThan(0);
  });

  it('filtert nur die Atlas-API-Metamodelle, nicht die Domänenmodelle', async () => {
    /*
     * Die Vorlage im eorm-Assistenten filtert Kandidaten mit
     * `nsURI.includes('/atlas/')`. Genau das trifft die Modelle dieses
     * Assistenten: `…/fennec/data/atlas/example/person/1.0.0`.
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
