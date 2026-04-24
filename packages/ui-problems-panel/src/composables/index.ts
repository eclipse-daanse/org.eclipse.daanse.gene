/**
 * Problems Panel Composables
 */

export {
  useProblemsService,
  useSharedProblemsService
} from './useProblemsService'

export {
  useCoclLoader,
  loadCoclFromString,
  unloadCocl,
  getLoadedConstraintSets,
  getConstraintsByRole,
  getConstraintsForClass,
  getReferenceFilterConstraint,
  getDerivedConstraint,
  constraintSetAppliesTo,
  clearAllConstraintSets,
  type CoclSeverity,
  type CoclRole,
  type CoclConstraint,
  type CoclConstraintSet
} from './useCoclLoader'

// Legacy aliases for backwards compatibility
export {
  useProblemsService as useOclService,
  useSharedProblemsService as useSharedOclService
} from './useProblemsService'
