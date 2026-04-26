// Core — host side
export { DomService } from './dom-service';
export { ScreenCapture } from './screen-capture';
export { createPixeerBridge } from './bridge';
export { createMutationTracker } from './mutation-tracker';
export { RefMap } from './ref-map';
export { createWebMCPBridge } from './webmcp-bridge';

// Core — agent side
export { PixeerAgent } from './agent';

// Analytics
export { PixeerAnalytics } from './analytics';

// Types
export type {
  InteractiveElement,
  ComponentStateResult,
  PixeerTransport,
  PixeerCallerTransport,
  PixeerBridgeOptions,
  PixeerBridge,
  ScrollDirection,
} from './types';
export type {
  DomDelta,
  DeltaResult,
  MutationTrackerOptions,
  MutationTracker,
} from './mutation-tracker';
export type {
  WebMCPBridgeOptions,
  WebMCPBridgeHandle,
} from './webmcp-bridge';
export type { ScreenCaptureOptions } from './screen-capture';
export type { PixeerEvent, PixeerEventType, PixeerStats } from './analytics';
export type {
  PixeerAgentOptions,
  PageContext,
  ScrollOptions,
  PressKeyOptions,
} from './agent';

// Transports
export {
  createLiveKitTransport,
  createPostMessageTransport,
  createBroadcastTransport,
  createWebSocketTransport,
  createPixeerServerTransport,
  createPostMessageCaller,
  createBroadcastCaller,
  createWebSocketCaller,
} from './transports';
export type {
  PostMessageTransportOptions,
  BroadcastTransportOptions,
  WebSocketTransportOptions,
  PixeerServerTransportOptions,
  PostMessageCallerOptions,
  BroadcastCallerOptions,
  WebSocketCallerOptions,
} from './transports';
