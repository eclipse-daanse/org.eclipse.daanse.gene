// @vitest-environment jsdom
/**
 * Verdrahtung der handgeschriebenen Schritte (Schritt 8b).
 *
 * Die Logik selbst decken context/validate/transform ab. Hier geht es um die
 * Kette, die man sonst nur in der laufenden App sieht: Klick im Formular →
 * Wert im Fassadenmodell → `touch()`, damit die Anzeige nachzieht. Genau da
 * saßen in diesem Projekt schon mehrere Fehler, die kein Unit-Test sah.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mount } from '@vue/test-utils';
import type { EPackage } from '@emfts/core';
import { registerEcoreFromString, setupPackages } from '../src/emf/setup';
import { initSetup, setup, version } from '../src/wizard/context';
import DatasetsStep from '../src/wizard/DatasetsStep.vue';
import ExportsStep from '../src/wizard/ExportsStep.vue';
import SummaryStep from '../src/wizard/SummaryStep.vue';
import { DataatlaswizardFactory, ExportKind } from '../src/generated';

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
