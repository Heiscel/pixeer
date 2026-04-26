/**
 * Gives your agent the ability to see the screen.
 *
 * Manages a screen share stream behind the scenes and captures frames
 * as base64 JPEG whenever your agent asks. The first call will prompt
 * the user for screen share permission — after that, captures are instant.
 *
 * Safe to import on the server — all browser APIs are guarded.
 */

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

export interface ScreenCaptureOptions {
  /** JPEG quality, 0-1 (default: 0.8) */
  quality?: number;
}

export class ScreenCapture {
  private videoEl: HTMLVideoElement | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private quality: number;

  constructor(options?: ScreenCaptureOptions) {
    this.quality = options?.quality ?? 0.8;
  }

  /**
   * Capture the current screen as a base64 JPEG string.
   * The first time you call this, the browser will ask the user to pick
   * a screen/window/tab to share. After that, subsequent captures reuse
   * the same stream.
   */
  async capture(): Promise<string> {
    if (!isBrowser) {
      throw new Error('Screen capture is only available in the browser');
    }

    // Request screen share if we don't have one yet
    if (!this.videoEl?.srcObject) {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' } as MediaTrackConstraints,
        audio: false,
      });

      // We create a hidden video element to receive the stream
      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.muted = true;
      video.style.display = 'none';
      document.body.appendChild(video);
      this.videoEl = video;

      // Wait for the video feed to be ready
      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => {
          video.play();
          resolve();
        };
      });
    }

    const video = this.videoEl;
    if (!video) {
      throw new Error('Screen capture not available');
    }

    // Draw the current frame to a canvas and export as JPEG
    if (!this.canvasEl) {
      this.canvasEl = document.createElement('canvas');
    }
    const canvas = this.canvasEl;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas context not available');
    }

    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', this.quality);
    const base64 = dataUrl.split(',')[1];

    return base64;
  }

  /**
   * Stop the screen share and clean up. Call this when your agent
   * no longer needs vision, or when the user disconnects.
   */
  dispose(): void {
    if (this.videoEl) {
      const stream = this.videoEl.srcObject as MediaStream | null;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      this.videoEl.remove();
      this.videoEl = null;
    }
    this.canvasEl = null;
  }
}
