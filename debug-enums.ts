import { EcoreLoader } from '../EMFTs/emfts-codegen/src/loader/EcoreLoader';

async function main() {
  const loader = new EcoreLoader();
  const ePackage = await loader.load('./learn/fennec-generic-ui.ecore');

  console.log('Package:', ePackage.getName());
  console.log('Classifiers:');

  for (const classifier of ePackage.getEClassifiers()) {
    const obj = classifier as any;
    const name = obj.getName?.() ?? obj.name ?? 'unknown';
    const eClass = obj.eClass?.();
    const eClassName = eClass?.getName?.() ?? eClass?.name ?? 'no-eclass';

    console.log(`  ${name}: eClass=${eClassName}`);

    // Try to access eLiterals feature
    if (obj.eLiterals) {
      console.log(`    eLiterals (property):`, obj.eLiterals.length);
    }
    if (obj.eGet) {
      try {
        const feature = eClass?.getEStructuralFeature?.('eLiterals');
        if (feature) {
          const literals = obj.eGet(feature);
          console.log(`    eLiterals (via eGet):`, literals?.length ?? 0);
        }
      } catch (e) {
        // ignore
      }
    }
  }
}

main().catch(console.error);
