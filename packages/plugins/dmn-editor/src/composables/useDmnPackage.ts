/**
 * useDmnPackage - DMN EPackage Definition (programmatic)
 *
 * Defines the DMN metamodel as a programmatic EPackage using EMFTs BasicE* classes.
 * This is the runtime source for DMN types - no .ecore file loading needed.
 *
 * Metamodel classes:
 * - Definitions (root container)
 * - Decision, InputData, BusinessKnowledgeModel, KnowledgeSource (DRG elements)
 * - DecisionTable, InputClause, OutputClause, DecisionRule (table structure)
 * - UnaryTests, LiteralExpression (expressions)
 * - InformationRequirement, KnowledgeRequirement, AuthorityRequirement
 */

import {
  BasicEPackage, BasicEClass, BasicEAttribute, BasicEReference, BasicEFactory,
  BasicEEnum, BasicEEnumLiteral,
  getEcorePackage
} from '@emfts/core'
import type { EPackage, EClass, EAttribute, EReference, EEnum, EFactory } from '@emfts/core'
import { DMN_NS_URI, DMN_NS_PREFIX } from '../types'

// Singleton
let dmnPackage: EPackage | null = null
let dmnFactory: EFactory | null = null

// EClass references for external access
let definitionsClass: EClass
let decisionClass: EClass
let inputDataClass: EClass
let bkmClass: EClass
let knowledgeSourceClass: EClass
let decisionTableClass: EClass
let inputClauseClass: EClass
let outputClauseClass: EClass
let decisionRuleClass: EClass
let unaryTestsClass: EClass
let literalExpressionClass: EClass
let informationRequirementClass: EClass
let knowledgeRequirementClass: EClass
let authorityRequirementClass: EClass
let hitPolicyEnum: EEnum
let builtinAggregatorEnum: EEnum

function buildDmnPackage(): EPackage {
  const ecorePkg = getEcorePackage()
  const EString = ecorePkg.getEClassifier('EString')!
  const EInt = ecorePkg.getEClassifier('EInt')!
  const EBoolean = ecorePkg.getEClassifier('EBoolean')!

  // Create package
  const pkg = new BasicEPackage(DMN_NS_URI)
  pkg.setName('dmn')
  pkg.setNsPrefix(DMN_NS_PREFIX)

  // Create factory
  const factory = new BasicEFactory()
  factory.setEPackage(pkg)
  pkg.setEFactoryInstance(factory)

  // ============ Enums ============

  // HitPolicy enum
  const hitPolicyE = new BasicEEnum()
  hitPolicyE.setName('HitPolicy')
  const hitPolicies = ['UNIQUE', 'FIRST', 'PRIORITY', 'ANY', 'COLLECT', 'RULE_ORDER', 'OUTPUT_ORDER']
  hitPolicies.forEach((name, i) => {
    const literal = new BasicEEnumLiteral()
    literal.setName(name)
    literal.setValue(i)
    literal.setLiteral(name)
    hitPolicyE.addLiteral(literal)
  })
  pkg.getEClassifiers().add(hitPolicyE)
  hitPolicyEnum = hitPolicyE

  // BuiltinAggregator enum
  const aggregatorE = new BasicEEnum()
  aggregatorE.setName('BuiltinAggregator')
  const aggregators = ['COUNT', 'SUM', 'MIN', 'MAX']
  aggregators.forEach((name, i) => {
    const literal = new BasicEEnumLiteral()
    literal.setName(name)
    literal.setValue(i)
    literal.setLiteral(name)
    aggregatorE.addLiteral(literal)
  })
  pkg.getEClassifiers().add(aggregatorE)
  builtinAggregatorEnum = aggregatorE

  // ============ Abstract base classes ============

  // NamedElement (abstract)
  const namedElementClass = new BasicEClass()
  namedElementClass.setName('NamedElement')
  namedElementClass.setAbstract(true)
  const nameAttr = new BasicEAttribute()
  nameAttr.setName('name')
  nameAttr.setEType(EString)
  namedElementClass.addFeature(nameAttr)
  pkg.getEClassifiers().add(namedElementClass)

  // DRGElement (abstract, extends NamedElement)
  const drgElementClass = new BasicEClass()
  drgElementClass.setName('DRGElement')
  drgElementClass.setAbstract(true)
  drgElementClass.addSuperType(namedElementClass)
  pkg.getEClassifiers().add(drgElementClass)

  // Expression (abstract)
  const expressionClass = new BasicEClass()
  expressionClass.setName('Expression')
  expressionClass.setAbstract(true)
  const typeRefAttr = new BasicEAttribute()
  typeRefAttr.setName('typeRef')
  typeRefAttr.setEType(EString)
  expressionClass.addFeature(typeRefAttr)
  pkg.getEClassifiers().add(expressionClass)

  // ============ Concrete classes ============

  // Definitions (root)
  const defsClass = new BasicEClass()
  defsClass.setName('Definitions')
  const defsNameAttr = new BasicEAttribute()
  defsNameAttr.setName('name')
  defsNameAttr.setEType(EString)
  defsClass.addFeature(defsNameAttr)
  const defsNamespaceAttr = new BasicEAttribute()
  defsNamespaceAttr.setName('namespace')
  defsNamespaceAttr.setEType(EString)
  defsClass.addFeature(defsNamespaceAttr)
  const defsExprLangAttr = new BasicEAttribute()
  defsExprLangAttr.setName('expressionLanguage')
  defsExprLangAttr.setEType(EString)
  defsClass.addFeature(defsExprLangAttr)
  pkg.getEClassifiers().add(defsClass)
  definitionsClass = defsClass

  // UnaryTests
  const unaryTestsCls = new BasicEClass()
  unaryTestsCls.setName('UnaryTests')
  unaryTestsCls.addSuperType(expressionClass)
  const utTextAttr = new BasicEAttribute()
  utTextAttr.setName('text')
  utTextAttr.setEType(EString)
  unaryTestsCls.addFeature(utTextAttr)
  pkg.getEClassifiers().add(unaryTestsCls)
  unaryTestsClass = unaryTestsCls

  // LiteralExpression
  const literalExprCls = new BasicEClass()
  literalExprCls.setName('LiteralExpression')
  literalExprCls.addSuperType(expressionClass)
  const leTextAttr = new BasicEAttribute()
  leTextAttr.setName('text')
  leTextAttr.setEType(EString)
  literalExprCls.addFeature(leTextAttr)
  pkg.getEClassifiers().add(literalExprCls)
  literalExpressionClass = literalExprCls

  // InputClause
  const inputClauseCls = new BasicEClass()
  inputClauseCls.setName('InputClause')
  const icLabelAttr = new BasicEAttribute()
  icLabelAttr.setName('label')
  icLabelAttr.setEType(EString)
  inputClauseCls.addFeature(icLabelAttr)
  // inputExpression: LiteralExpression [1] containment
  const icExprRef = new BasicEReference()
  icExprRef.setName('inputExpression')
  icExprRef.setEType(literalExprCls)
  icExprRef.setContainment(true)
  icExprRef.setLowerBound(0)
  icExprRef.setUpperBound(1)
  inputClauseCls.addFeature(icExprRef)
  // inputValues: UnaryTests [0..1] containment
  const icValuesRef = new BasicEReference()
  icValuesRef.setName('inputValues')
  icValuesRef.setEType(unaryTestsCls)
  icValuesRef.setContainment(true)
  icValuesRef.setLowerBound(0)
  icValuesRef.setUpperBound(1)
  inputClauseCls.addFeature(icValuesRef)
  pkg.getEClassifiers().add(inputClauseCls)
  inputClauseClass = inputClauseCls

  // OutputClause
  const outputClauseCls = new BasicEClass()
  outputClauseCls.setName('OutputClause')
  const ocLabelAttr = new BasicEAttribute()
  ocLabelAttr.setName('label')
  ocLabelAttr.setEType(EString)
  outputClauseCls.addFeature(ocLabelAttr)
  const ocNameAttr = new BasicEAttribute()
  ocNameAttr.setName('name')
  ocNameAttr.setEType(EString)
  outputClauseCls.addFeature(ocNameAttr)
  const ocTypeRefAttr = new BasicEAttribute()
  ocTypeRefAttr.setName('typeRef')
  ocTypeRefAttr.setEType(EString)
  outputClauseCls.addFeature(ocTypeRefAttr)
  // outputValues: UnaryTests [0..1] containment
  const ocValuesRef = new BasicEReference()
  ocValuesRef.setName('outputValues')
  ocValuesRef.setEType(unaryTestsCls)
  ocValuesRef.setContainment(true)
  ocValuesRef.setLowerBound(0)
  ocValuesRef.setUpperBound(1)
  outputClauseCls.addFeature(ocValuesRef)
  // defaultOutputEntry: LiteralExpression [0..1] containment
  const ocDefaultRef = new BasicEReference()
  ocDefaultRef.setName('defaultOutputEntry')
  ocDefaultRef.setEType(literalExprCls)
  ocDefaultRef.setContainment(true)
  ocDefaultRef.setLowerBound(0)
  ocDefaultRef.setUpperBound(1)
  outputClauseCls.addFeature(ocDefaultRef)
  pkg.getEClassifiers().add(outputClauseCls)
  outputClauseClass = outputClauseCls

  // DecisionRule
  const decisionRuleCls = new BasicEClass()
  decisionRuleCls.setName('DecisionRule')
  const drDescAttr = new BasicEAttribute()
  drDescAttr.setName('description')
  drDescAttr.setEType(EString)
  decisionRuleCls.addFeature(drDescAttr)
  // inputEntry: UnaryTests [*] containment
  const drInputRef = new BasicEReference()
  drInputRef.setName('inputEntry')
  drInputRef.setEType(unaryTestsCls)
  drInputRef.setContainment(true)
  drInputRef.setLowerBound(0)
  drInputRef.setUpperBound(-1) // unbounded
  decisionRuleCls.addFeature(drInputRef)
  // outputEntry: LiteralExpression [*] containment
  const drOutputRef = new BasicEReference()
  drOutputRef.setName('outputEntry')
  drOutputRef.setEType(literalExprCls)
  drOutputRef.setContainment(true)
  drOutputRef.setLowerBound(0)
  drOutputRef.setUpperBound(-1) // unbounded
  decisionRuleCls.addFeature(drOutputRef)
  pkg.getEClassifiers().add(decisionRuleCls)
  decisionRuleClass = decisionRuleCls

  // DecisionTable
  const dtClass = new BasicEClass()
  dtClass.setName('DecisionTable')
  dtClass.addSuperType(expressionClass)
  // hitPolicy: HitPolicy
  const dtHitPolicyAttr = new BasicEAttribute()
  dtHitPolicyAttr.setName('hitPolicy')
  dtHitPolicyAttr.setEType(hitPolicyE)
  dtClass.addFeature(dtHitPolicyAttr)
  // aggregation: BuiltinAggregator
  const dtAggregationAttr = new BasicEAttribute()
  dtAggregationAttr.setName('aggregation')
  dtAggregationAttr.setEType(aggregatorE)
  dtClass.addFeature(dtAggregationAttr)
  // outputLabel: EString
  const dtOutputLabelAttr = new BasicEAttribute()
  dtOutputLabelAttr.setName('outputLabel')
  dtOutputLabelAttr.setEType(EString)
  dtClass.addFeature(dtOutputLabelAttr)
  // input: InputClause [*] containment
  const dtInputRef = new BasicEReference()
  dtInputRef.setName('input')
  dtInputRef.setEType(inputClauseCls)
  dtInputRef.setContainment(true)
  dtInputRef.setLowerBound(0)
  dtInputRef.setUpperBound(-1)
  dtClass.addFeature(dtInputRef)
  // output: OutputClause [*] containment
  const dtOutputRef = new BasicEReference()
  dtOutputRef.setName('output')
  dtOutputRef.setEType(outputClauseCls)
  dtOutputRef.setContainment(true)
  dtOutputRef.setLowerBound(0)
  dtOutputRef.setUpperBound(-1)
  dtClass.addFeature(dtOutputRef)
  // rule: DecisionRule [*] containment
  const dtRuleRef = new BasicEReference()
  dtRuleRef.setName('rule')
  dtRuleRef.setEType(decisionRuleCls)
  dtRuleRef.setContainment(true)
  dtRuleRef.setLowerBound(0)
  dtRuleRef.setUpperBound(-1)
  dtClass.addFeature(dtRuleRef)
  pkg.getEClassifiers().add(dtClass)
  decisionTableClass = dtClass

  // InformationRequirement
  const infoReqClass = new BasicEClass()
  infoReqClass.setName('InformationRequirement')
  pkg.getEClassifiers().add(infoReqClass)
  informationRequirementClass = infoReqClass

  // KnowledgeRequirement
  const knowledgeReqClass = new BasicEClass()
  knowledgeReqClass.setName('KnowledgeRequirement')
  pkg.getEClassifiers().add(knowledgeReqClass)
  knowledgeRequirementClass = knowledgeReqClass

  // AuthorityRequirement
  const authorityReqClass = new BasicEClass()
  authorityReqClass.setName('AuthorityRequirement')
  pkg.getEClassifiers().add(authorityReqClass)
  authorityRequirementClass = authorityReqClass

  // InputData (extends DRGElement)
  const inputDataCls = new BasicEClass()
  inputDataCls.setName('InputData')
  inputDataCls.addSuperType(drgElementClass)
  // typeRef: qualifizierter Typname (z.B. "Customer")
  const idTypeRefAttr = new BasicEAttribute()
  idTypeRefAttr.setName('typeRef')
  idTypeRefAttr.setEType(EString)
  inputDataCls.addFeature(idTypeRefAttr)
  // modelNsURI: nsURI des referenzierten EPackage
  const idNsUriAttr = new BasicEAttribute()
  idNsUriAttr.setName('modelNsURI')
  idNsUriAttr.setEType(EString)
  inputDataCls.addFeature(idNsUriAttr)
  // featurePath: optionaler Pfad zum Feature (z.B. "age")
  const idFeaturePathAttr = new BasicEAttribute()
  idFeaturePathAttr.setName('featurePath')
  idFeaturePathAttr.setEType(EString)
  inputDataCls.addFeature(idFeaturePathAttr)
  pkg.getEClassifiers().add(inputDataCls)
  inputDataClass = inputDataCls

  // BusinessKnowledgeModel (extends DRGElement)
  const bkmCls = new BasicEClass()
  bkmCls.setName('BusinessKnowledgeModel')
  bkmCls.addSuperType(drgElementClass)
  pkg.getEClassifiers().add(bkmCls)
  bkmClass = bkmCls

  // KnowledgeSource (extends DRGElement)
  const knowledgeSourceCls = new BasicEClass()
  knowledgeSourceCls.setName('KnowledgeSource')
  knowledgeSourceCls.addSuperType(drgElementClass)
  pkg.getEClassifiers().add(knowledgeSourceCls)
  knowledgeSourceClass = knowledgeSourceCls

  // Decision (extends DRGElement)
  const decCls = new BasicEClass()
  decCls.setName('Decision')
  decCls.addSuperType(drgElementClass)
  // decisionLogic: DecisionTable [0..1] containment (simplified: only DecisionTable for v1)
  const decLogicRef = new BasicEReference()
  decLogicRef.setName('decisionLogic')
  decLogicRef.setEType(dtClass)
  decLogicRef.setContainment(true)
  decLogicRef.setLowerBound(0)
  decLogicRef.setUpperBound(1)
  decCls.addFeature(decLogicRef)
  // informationRequirement: InformationRequirement [*] containment
  const decInfoReqRef = new BasicEReference()
  decInfoReqRef.setName('informationRequirement')
  decInfoReqRef.setEType(infoReqClass)
  decInfoReqRef.setContainment(true)
  decInfoReqRef.setLowerBound(0)
  decInfoReqRef.setUpperBound(-1)
  decCls.addFeature(decInfoReqRef)
  pkg.getEClassifiers().add(decCls)
  decisionClass = decCls

  // Wire up Definitions containment references
  // decisions: Decision [*]
  const defsDecisionsRef = new BasicEReference()
  defsDecisionsRef.setName('decision')
  defsDecisionsRef.setEType(decCls)
  defsDecisionsRef.setContainment(true)
  defsDecisionsRef.setLowerBound(0)
  defsDecisionsRef.setUpperBound(-1)
  defsClass.addFeature(defsDecisionsRef)

  // inputData: InputData [*]
  const defsInputDataRef = new BasicEReference()
  defsInputDataRef.setName('inputData')
  defsInputDataRef.setEType(inputDataCls)
  defsInputDataRef.setContainment(true)
  defsInputDataRef.setLowerBound(0)
  defsInputDataRef.setUpperBound(-1)
  defsClass.addFeature(defsInputDataRef)

  // businessKnowledgeModel: BKM [*]
  const defsBkmRef = new BasicEReference()
  defsBkmRef.setName('businessKnowledgeModel')
  defsBkmRef.setEType(bkmCls)
  defsBkmRef.setContainment(true)
  defsBkmRef.setLowerBound(0)
  defsBkmRef.setUpperBound(-1)
  defsClass.addFeature(defsBkmRef)

  // knowledgeSource: KnowledgeSource [*]
  const defsKsRef = new BasicEReference()
  defsKsRef.setName('knowledgeSource')
  defsKsRef.setEType(knowledgeSourceCls)
  defsKsRef.setContainment(true)
  defsKsRef.setLowerBound(0)
  defsKsRef.setUpperBound(-1)
  defsClass.addFeature(defsKsRef)

  return pkg
}

/**
 * Get or create the DMN EPackage (singleton)
 */
export function getDmnPackage(): EPackage {
  if (!dmnPackage) {
    dmnPackage = buildDmnPackage()
  }
  return dmnPackage
}

/**
 * Get the DMN EFactory
 */
export function getDmnFactory(): EFactory {
  if (!dmnFactory) {
    dmnFactory = getDmnPackage().getEFactoryInstance()
  }
  return dmnFactory
}

// ============ EClass accessors ============

export function getDefinitionsClass(): EClass { getDmnPackage(); return definitionsClass }
export function getDecisionClass(): EClass { getDmnPackage(); return decisionClass }
export function getInputDataClass(): EClass { getDmnPackage(); return inputDataClass }
export function getBkmClass(): EClass { getDmnPackage(); return bkmClass }
export function getKnowledgeSourceClass(): EClass { getDmnPackage(); return knowledgeSourceClass }
export function getDecisionTableClass(): EClass { getDmnPackage(); return decisionTableClass }
export function getInputClauseClass(): EClass { getDmnPackage(); return inputClauseClass }
export function getOutputClauseClass(): EClass { getDmnPackage(); return outputClauseClass }
export function getDecisionRuleClass(): EClass { getDmnPackage(); return decisionRuleClass }
export function getUnaryTestsClass(): EClass { getDmnPackage(); return unaryTestsClass }
export function getLiteralExpressionClass(): EClass { getDmnPackage(); return literalExpressionClass }
export function getInformationRequirementClass(): EClass { getDmnPackage(); return informationRequirementClass }
export function getKnowledgeRequirementClass(): EClass { getDmnPackage(); return knowledgeRequirementClass }
export function getAuthorityRequirementClass(): EClass { getDmnPackage(); return authorityRequirementClass }
export function getHitPolicyEnum(): EEnum { getDmnPackage(); return hitPolicyEnum }
export function getBuiltinAggregatorEnum(): EEnum { getDmnPackage(); return builtinAggregatorEnum }
