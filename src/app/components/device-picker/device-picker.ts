import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { DeviceOption, listMediaDevices } from '../../core/calling/media-devices';
import { SettingsStore } from '../../stores/settings.store';

@Component({
  selector: 'app-device-picker',
  imports: [],
  templateUrl: './device-picker.html',
  styleUrl: './device-picker.css',
})
export class DevicePicker implements OnInit {
  private readonly settings = inject(SettingsStore);

  readonly showCamera = input(true);
  readonly cameraChange = output<string>();
  readonly micChange = output<string>();

  protected readonly cameras = signal<DeviceOption[]>([]);
  protected readonly mics = signal<DeviceOption[]>([]);
  protected readonly preferredCameraId = this.settings.preferredCameraId;
  protected readonly preferredMicId = this.settings.preferredMicId;

  async ngOnInit(): Promise<void> {
    // Labels are only populated once permission has been granted — fine
    // here, this panel only ever opens from inside an already-active call.
    const { cameras, mics } = await listMediaDevices();
    this.cameras.set(cameras);
    this.mics.set(mics);
  }

  onCameraSelect(event: Event): void {
    const deviceId = (event.target as HTMLSelectElement).value;
    if (deviceId) this.cameraChange.emit(deviceId);
  }

  onMicSelect(event: Event): void {
    const deviceId = (event.target as HTMLSelectElement).value;
    if (deviceId) this.micChange.emit(deviceId);
  }
}
