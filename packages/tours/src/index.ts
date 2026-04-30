// Core
export { createTour, Tour } from './Tour.js';
export { Highlighter } from './Highlighter.js';
export { StepExecutor, waitForSelector, scrollIntoView } from './StepExecutor.js';
export { AdaptationMonitor } from './AdaptationMonitor.js';
export { Coordinator } from './Coordinator.js';
export { Narrator } from './Narrator.js';

// LLM tour planner
export { planTour } from './TourPlanner.js';

// React hooks (tree-shaken when not using React)
export { useTour, useTourStep, useInteractiveTour } from './hooks.js';

// Types
export type {
  // Modes and structure
  TourMode,
  TourScript,
  TourSettings,
  TourAct,
  TourStep,
  BaseStep,
  HighlightStep,
  ClickStep,
  TypeStep,
  NavigateStep,
  WaitStep,
  NarrateStep,
  CustomStep,
  TourStepContext,

  // Tooltip
  TooltipContent,
  TooltipAction,

  // State
  TourStatus,
  TourState,
  TourHandle,
  TourOptions,

  // Events
  TourEventType,
  TourEventMap,
  TourEventHandler,

  // Interactive mode
  CoordinatorDecision,
  ConversationMessage,
  GenerateTextFn,

  // Narrator
  NarratorLike,

  // Planner
  TourPlannerOptions,
  PlannedTour,
} from './types.js';

// React hook types
export type {
  UseTourResult,
  UseTourStepOptions,
  UseInteractiveTourResult,
} from './hooks.js';

// Highlighter types
export type { HighlightOptions } from './Highlighter.js';

// AdaptationMonitor types
export type { StepReadiness } from './AdaptationMonitor.js';
