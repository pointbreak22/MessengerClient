import { SettingsStore } from '../../stores/settings.store';

export interface LocalMediaResult {
  stream: MediaStream;
  // True when video was requested but the camera couldn't be opened and the
  // call proceeded audio-only instead of failing outright.
  videoFallback: boolean;
}

// Camera-specific failures — missing/busy device, or permission specifically
// denied for video — shouldn't kill a call the mic can still handle.
const CAMERA_FALLBACK_ERRORS = new Set([
  'NotFoundError',
  'NotReadableError',
  'OverconstrainedError',
  'NotAllowedError',
]);

export async function getLocalMediaStream(video: boolean, settings: SettingsStore): Promise<LocalMediaResult> {
  const micId = settings.preferredMicId();
  const audio: MediaTrackConstraints | boolean = micId ? { deviceId: { exact: micId } } : true;

  if (!video) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
    return { stream, videoFallback: false };
  }

  const cameraId = settings.preferredCameraId();
  const videoConstraint: MediaTrackConstraints = cameraId ? { deviceId: { exact: cameraId } } : {};

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio, video: videoConstraint });
    return { stream, videoFallback: false };
  } catch (err) {
    if (err instanceof DOMException && CAMERA_FALLBACK_ERRORS.has(err.name)) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
      return { stream, videoFallback: true };
    }
    throw err;
  }
}

export interface DeviceOption {
  deviceId: string;
  label: string;
}

// Labels are blank until permission has been granted at least once — fine
// here since this is only ever called from an active/about-to-start call.
export async function listMediaDevices(): Promise<{ cameras: DeviceOption[]; mics: DeviceOption[] }> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices
    .filter((d) => d.kind === 'videoinput')
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }));
  const mics = devices
    .filter((d) => d.kind === 'audioinput')
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
  return { cameras, mics };
}
