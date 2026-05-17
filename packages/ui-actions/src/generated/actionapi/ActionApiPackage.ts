/*
 * Generated from action-api.ecore
 * @generated
 */

import { BasicEPackage, BasicEClass, BasicEAttribute, BasicEReference, BasicEEnum, BasicEEnumLiteral } from '@emfts/core'
import type { EClass, EAttribute, EReference, EEnum, EDataType } from '@emfts/core'

// Resolve EString, EInt, EBoolean from Ecore
function getEcoreType(name: string): EDataType | undefined {
  try {
    const { EcorePackage } = require('@emfts/core')
    if (EcorePackage?.eINSTANCE) {
      return EcorePackage.eINSTANCE.getEClassifier(name) as EDataType
    }
  } catch { /* fallback */ }
  return undefined
}

export class ActionApiPackage extends BasicEPackage {
  static readonly eNAME = 'actionapi'
  static readonly eNS_URI = 'http://gene/model/action/api/1.0.0'
  static readonly eNS_PREFIX = 'actionapi'

  private static _instance: ActionApiPackage

  static get eINSTANCE(): ActionApiPackage {
    if (!this._instance) {
      this._instance = new ActionApiPackage()
      this._instance.init()
    }
    return this._instance
  }

  static readonly Literals = {
    // Enums
    HTTP_METHOD: null as unknown as EEnum,
    MEDIA_TYPE: null as unknown as EEnum,
    JOB_STATE: null as unknown as EEnum,
    PARAMETER_TYPE: null as unknown as EEnum,
    LOG_LEVEL: null as unknown as EEnum,
    // Classes
    SERVICE_CAPABILITIES: null as unknown as EClass,
    SERVICE_CAPABILITIES__NAME: null as unknown as EAttribute | EReference,
    SERVICE_CAPABILITIES__VERSION: null as unknown as EAttribute | EReference,
    SERVICE_CAPABILITIES__ENDPOINTS: null as unknown as EAttribute | EReference,
    SERVICE_CAPABILITIES__JOB_MANAGEMENT: null as unknown as EAttribute | EReference,
    ENDPOINT: null as unknown as EClass,
    ENDPOINT__ID: null as unknown as EAttribute | EReference,
    ENDPOINT__NAME: null as unknown as EAttribute | EReference,
    ENDPOINT__DESCRIPTION: null as unknown as EAttribute | EReference,
    ENDPOINT__PATH: null as unknown as EAttribute | EReference,
    ENDPOINT__HTTP_METHOD: null as unknown as EAttribute | EReference,
    ENDPOINT__INPUT_TYPE: null as unknown as EAttribute | EReference,
    ENDPOINT__OUTPUT_TYPE: null as unknown as EAttribute | EReference,
    ENDPOINT__ASYNC_SUPPORTED: null as unknown as EAttribute | EReference,
    ENDPOINT__PARAMETERS: null as unknown as EAttribute | EReference,
    ENDPOINT__CATEGORY: null as unknown as EAttribute | EReference,
    ENDPOINT_PARAMETER: null as unknown as EClass,
    ENDPOINT_PARAMETER__NAME: null as unknown as EAttribute | EReference,
    ENDPOINT_PARAMETER__TYPE: null as unknown as EAttribute | EReference,
    ENDPOINT_PARAMETER__REQUIRED: null as unknown as EAttribute | EReference,
    ENDPOINT_PARAMETER__DESCRIPTION: null as unknown as EAttribute | EReference,
    ENDPOINT_PARAMETER__DEFAULT_VALUE: null as unknown as EAttribute | EReference,
    JOB_MANAGEMENT: null as unknown as EClass,
    JOB_MANAGEMENT__STATUS_ENDPOINT: null as unknown as EAttribute | EReference,
    JOB_MANAGEMENT__CANCEL_ENDPOINT: null as unknown as EAttribute | EReference,
    JOB_MANAGEMENT__RESULT_ENDPOINT: null as unknown as EAttribute | EReference,
    JOB_MANAGEMENT__POLL_INTERVAL_MS: null as unknown as EAttribute | EReference,
    JOB_MANAGEMENT__MAX_JOB_DURATION_MS: null as unknown as EAttribute | EReference,
    JOB_STATUS: null as unknown as EClass,
    JOB_STATUS__JOB_ID: null as unknown as EAttribute | EReference,
    JOB_STATUS__STATUS: null as unknown as EAttribute | EReference,
    JOB_STATUS__PROGRESS: null as unknown as EAttribute | EReference,
    JOB_STATUS__PROGRESS_MESSAGE: null as unknown as EAttribute | EReference,
    JOB_STATUS__STARTED_AT: null as unknown as EAttribute | EReference,
    JOB_STATUS__LOGS: null as unknown as EAttribute | EReference,
    JOB_LOG_ENTRY: null as unknown as EClass,
    JOB_LOG_ENTRY__MESSAGE: null as unknown as EAttribute | EReference,
    JOB_LOG_ENTRY__LEVEL: null as unknown as EAttribute | EReference,
    JOB_LOG_ENTRY__TIMESTAMP: null as unknown as EAttribute | EReference,
    ACTION_RESULT: null as unknown as EClass,
    ACTION_RESULT__RESULT_STATUS: null as unknown as EAttribute | EReference,
    ACTION_RESULT__MESSAGE: null as unknown as EAttribute | EReference,
    ACTION_RESULT__ARTIFACTS: null as unknown as EAttribute | EReference,
    ARTIFACT: null as unknown as EClass,
    ARTIFACT__NAME: null as unknown as EAttribute | EReference,
    ARTIFACT__ARTIFACT_TYPE: null as unknown as EAttribute | EReference,
    ARTIFACT__CONTENT: null as unknown as EAttribute | EReference,
    ARTIFACT__MIME_TYPE: null as unknown as EAttribute | EReference,
    ARTIFACT__VALIDATION_MESSAGES: null as unknown as EAttribute | EReference,
    VALIDATION_MESSAGE: null as unknown as EClass,
    VALIDATION_MESSAGE__SEVERITY: null as unknown as EAttribute | EReference,
    VALIDATION_MESSAGE__MESSAGE: null as unknown as EAttribute | EReference,
    VALIDATION_MESSAGE__OBJECT_URI: null as unknown as EAttribute | EReference,
    VALIDATION_MESSAGE__CLASS_NAME: null as unknown as EAttribute | EReference,
    VALIDATION_MESSAGE__FEATURE_NAME: null as unknown as EAttribute | EReference,
    JOB_STATUS__RESULT: null as unknown as EAttribute | EReference,
    PROPOSED_ACTION: null as unknown as EClass,
    PROPOSED_ACTION__COMMAND_ID: null as unknown as EAttribute | EReference,
    PROPOSED_ACTION__LABEL: null as unknown as EAttribute | EReference,
    PROPOSED_ACTION__DESCRIPTION: null as unknown as EAttribute | EReference,
    PROPOSED_ACTION__ARGS: null as unknown as EAttribute | EReference,
    PROPOSED_ACTION__AUTO_EXECUTE: null as unknown as EAttribute | EReference,
    ACTION_RESULT__PROPOSED_ACTIONS: null as unknown as EAttribute | EReference,
  }

  private constructor() {
    super()
    this.setName(ActionApiPackage.eNAME)
    this.setNsURI(ActionApiPackage.eNS_URI)
    this.setNsPrefix(ActionApiPackage.eNS_PREFIX)
  }

  private init(): void {
    const L = ActionApiPackage.Literals

    // ─── Enums ─────────────────────────────────────────
    L.HTTP_METHOD = this.createEnum('HttpMethod', ['GET', 'POST', 'PUT', 'DELETE'])
    L.MEDIA_TYPE = this.createEnum('MediaType', ['APPLICATION_XMI', 'APPLICATION_JSON', 'TEXT_PLAIN'])
    L.JOB_STATE = this.createEnum('JobState', ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELED'])
    L.PARAMETER_TYPE = this.createEnum('ParameterType', ['STRING', 'INTEGER', 'BOOLEAN', 'ENUM'])
    L.LOG_LEVEL = this.createEnum('LogLevel', ['INFO', 'WARN', 'ERROR'])
    this.createEnum('ResultStatus', ['SUCCESS', 'WARNING', 'ERROR'])
    this.createEnum('ArtifactType', ['XMI', 'JSON', 'FILE', 'VALIDATION_MESSAGES', 'MARKDOWN'])

    // ─── ServiceCapabilities ───────────────────────────
    const scCls = this.createClass('ServiceCapabilities')
    L.SERVICE_CAPABILITIES = scCls
    L.SERVICE_CAPABILITIES__NAME = this.addAttribute(scCls, 'name', 0)
    L.SERVICE_CAPABILITIES__VERSION = this.addAttribute(scCls, 'version', 1)

    // ─── Endpoint ──────────────────────────────────────
    const epCls = this.createClass('Endpoint')
    L.ENDPOINT = epCls
    L.ENDPOINT__ID = this.addAttribute(epCls, 'id', 0)
    L.ENDPOINT__NAME = this.addAttribute(epCls, 'name', 1)
    L.ENDPOINT__DESCRIPTION = this.addAttribute(epCls, 'description', 2)
    L.ENDPOINT__PATH = this.addAttribute(epCls, 'path', 3)
    L.ENDPOINT__HTTP_METHOD = this.addAttribute(epCls, 'httpMethod', 4)
    L.ENDPOINT__INPUT_TYPE = this.addAttribute(epCls, 'inputType', 5)
    L.ENDPOINT__OUTPUT_TYPE = this.addAttribute(epCls, 'outputType', 6)
    L.ENDPOINT__ASYNC_SUPPORTED = this.addAttribute(epCls, 'asyncSupported', 7)
    L.ENDPOINT__CATEGORY = this.addAttribute(epCls, 'category', 9)

    // ─── EndpointParameter ─────────────────────────────
    const epPCls = this.createClass('EndpointParameter')
    L.ENDPOINT_PARAMETER = epPCls
    L.ENDPOINT_PARAMETER__NAME = this.addAttribute(epPCls, 'name', 0)
    L.ENDPOINT_PARAMETER__TYPE = this.addAttribute(epPCls, 'type', 1)
    L.ENDPOINT_PARAMETER__REQUIRED = this.addAttribute(epPCls, 'required', 2)
    L.ENDPOINT_PARAMETER__DESCRIPTION = this.addAttribute(epPCls, 'description', 3)
    L.ENDPOINT_PARAMETER__DEFAULT_VALUE = this.addAttribute(epPCls, 'defaultValue', 4)

    // ─── JobManagement ─────────────────────────────────
    const jmCls = this.createClass('JobManagement')
    L.JOB_MANAGEMENT = jmCls
    L.JOB_MANAGEMENT__STATUS_ENDPOINT = this.addAttribute(jmCls, 'statusEndpoint', 0)
    L.JOB_MANAGEMENT__CANCEL_ENDPOINT = this.addAttribute(jmCls, 'cancelEndpoint', 1)
    L.JOB_MANAGEMENT__RESULT_ENDPOINT = this.addAttribute(jmCls, 'resultEndpoint', 2)
    L.JOB_MANAGEMENT__POLL_INTERVAL_MS = this.addAttribute(jmCls, 'pollIntervalMs', 3)
    L.JOB_MANAGEMENT__MAX_JOB_DURATION_MS = this.addAttribute(jmCls, 'maxJobDurationMs', 4)

    // ─── JobStatus ─────────────────────────────────────
    const jsCls = this.createClass('JobStatus')
    L.JOB_STATUS = jsCls
    L.JOB_STATUS__JOB_ID = this.addAttribute(jsCls, 'jobId', 0)
    L.JOB_STATUS__STATUS = this.addAttribute(jsCls, 'status', 1)
    L.JOB_STATUS__PROGRESS = this.addAttribute(jsCls, 'progress', 2)
    L.JOB_STATUS__PROGRESS_MESSAGE = this.addAttribute(jsCls, 'progressMessage', 3)
    L.JOB_STATUS__STARTED_AT = this.addAttribute(jsCls, 'startedAt', 4)

    // ─── JobLogEntry ───────────────────────────────────
    const jlCls = this.createClass('JobLogEntry')
    L.JOB_LOG_ENTRY = jlCls
    L.JOB_LOG_ENTRY__MESSAGE = this.addAttribute(jlCls, 'message', 0)
    L.JOB_LOG_ENTRY__LEVEL = this.addAttribute(jlCls, 'level', 1)
    L.JOB_LOG_ENTRY__TIMESTAMP = this.addAttribute(jlCls, 'timestamp', 2)

    // ─── ActionResult ────────────────────────────────────
    const arCls = this.createClass('ActionResult')
    L.ACTION_RESULT = arCls
    L.ACTION_RESULT__RESULT_STATUS = this.addAttribute(arCls, 'resultStatus', 0)
    L.ACTION_RESULT__MESSAGE = this.addAttribute(arCls, 'message', 1)

    // ─── Artifact ────────────────────────────────────────
    const artCls = this.createClass('Artifact')
    L.ARTIFACT = artCls
    L.ARTIFACT__NAME = this.addAttribute(artCls, 'name', 0)
    L.ARTIFACT__ARTIFACT_TYPE = this.addAttribute(artCls, 'artifactType', 1)
    L.ARTIFACT__CONTENT = this.addAttribute(artCls, 'content', 2)
    L.ARTIFACT__MIME_TYPE = this.addAttribute(artCls, 'mimeType', 3)

    // ─── ValidationMessage ───────────────────────────────
    const vmCls = this.createClass('ValidationMessage')
    L.VALIDATION_MESSAGE = vmCls
    L.VALIDATION_MESSAGE__SEVERITY = this.addAttribute(vmCls, 'severity', 0)
    L.VALIDATION_MESSAGE__MESSAGE = this.addAttribute(vmCls, 'message', 1)
    L.VALIDATION_MESSAGE__OBJECT_URI = this.addAttribute(vmCls, 'objectUri', 2)
    L.VALIDATION_MESSAGE__CLASS_NAME = this.addAttribute(vmCls, 'className', 3)
    L.VALIDATION_MESSAGE__FEATURE_NAME = this.addAttribute(vmCls, 'featureName', 4)

    // ─── ProposedAction ────────────────────────────────
    const paCls = this.createClass('ProposedAction')
    L.PROPOSED_ACTION = paCls
    L.PROPOSED_ACTION__COMMAND_ID = this.addAttribute(paCls, 'commandId', 0)
    L.PROPOSED_ACTION__LABEL = this.addAttribute(paCls, 'label', 1)
    L.PROPOSED_ACTION__DESCRIPTION = this.addAttribute(paCls, 'description', 2)
    L.PROPOSED_ACTION__ARGS = this.addAttribute(paCls, 'args', 3)
    L.PROPOSED_ACTION__AUTO_EXECUTE = this.addAttribute(paCls, 'autoExecute', 4)

    // ─── References (containment) ──────────────────────
    L.SERVICE_CAPABILITIES__ENDPOINTS = this.addContainment(scCls, 'endpoints', epCls, -1, 2)
    L.SERVICE_CAPABILITIES__JOB_MANAGEMENT = this.addContainment(scCls, 'jobManagement', jmCls, 1, 3)
    L.ENDPOINT__PARAMETERS = this.addContainment(epCls, 'parameters', epPCls, -1, 8)
    L.JOB_STATUS__LOGS = this.addContainment(jsCls, 'logs', jlCls, -1, 5)
    L.JOB_STATUS__RESULT = this.addContainment(jsCls, 'result', arCls, 1, 6)
    L.ACTION_RESULT__ARTIFACTS = this.addContainment(arCls, 'artifacts', artCls, -1, 2)
    L.ACTION_RESULT__PROPOSED_ACTIONS = this.addContainment(arCls, 'proposedActions', paCls, -1, 3)
    L.ARTIFACT__VALIDATION_MESSAGES = this.addContainment(artCls, 'validationMessages', vmCls, -1, 4)

  }

  private createEnum(name: string, literals: string[]): EEnum {
    const eEnum = new BasicEEnum()
    eEnum.setName(name)
    literals.forEach((lit, i) => {
      const el = new BasicEEnumLiteral()
      el.setName(lit)
      el.setValue(i)
      el.setLiteral(lit)
      eEnum.getELiterals().push(el)
    })
    this.getEClassifiers().push(eEnum)
    return eEnum
  }

  private createClass(name: string): EClass {
    const cls = new BasicEClass()
    cls.setName(name)
    cls.setAbstract(false)
    cls.setInterface(false)
    this.getEClassifiers().push(cls)
    cls.setEPackage(this)
    return cls
  }

  private addAttribute(cls: EClass, name: string, featureId: number): EAttribute {
    const attr = new BasicEAttribute()
    attr.setName(name)
    attr.setLowerBound(0)
    attr.setUpperBound(1)
    attr.setFeatureID(featureId)
    cls.getEStructuralFeatures().push(attr)
    return attr
  }

  private addContainment(cls: EClass, name: string, type: EClass, upper: number, featureId: number): EReference {
    const ref = new BasicEReference()
    ref.setName(name)
    ref.setEType(type)
    ref.setContainment(true)
    ref.setLowerBound(0)
    ref.setUpperBound(upper)
    ref.setFeatureID(featureId)
    cls.getEStructuralFeatures().push(ref)
    return ref
  }
}
