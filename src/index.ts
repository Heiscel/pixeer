// Core
export { DomService } from './dom-service';
export { ScreenCapture } from './screen-capture';
export { createPixeerBridge } from './bridge';

// Types
export type {
  InteractiveElement,
  ComponentStateResult,
  PixeerTransport,
  PixeerBridgeOptions,
  PixeerBridge,
} from './types';
export type { ScreenCaptureOptions } from './screen-capture';

// Transports
export { createLiveKitTransport } from './transports';
