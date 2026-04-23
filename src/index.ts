// Core — host side
export { DomService } from './dom-service';
export { ScreenCapture } from './screen-capture';
export { createPixeerBridge } from './bridge';

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
  createPostMessageCaller,
  createBroadcastCaller,
  createWebSocketCaller,
} from './transports';
export type {
  PostMessageTransportOptions,
  BroadcastTransportOptions,
  WebSocketTransportOptions,
  PostMessageCallerOptions,
  BroadcastCallerOptions,
  WebSocketCallerOptions,
} from './transports';
