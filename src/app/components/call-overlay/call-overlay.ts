import { Component, inject, signal } from '@angular/core';
import { Avatar } from '../avatar/avatar';
import { DevicePicker } from '../device-picker/device-picker';
import { Icon } from '../icon/icon';
import { CallService } from '../../core/signalr/call.service';
import { getInitials } from '../../shared/user-display';

@Component({
  selector: 'app-call-overlay',
  imports: [Icon, Avatar, DevicePicker],
  templateUrl: './call-overlay.html',
  styleUrl: './call-overlay.css',
})
export class CallOverlay {
  protected readonly call = inject(CallService);
  protected readonly getInitials = getInitials;
  protected readonly showDevicePicker = signal(false);

  toggleDevicePicker(): void {
    this.showDevicePicker.update((v) => !v);
  }

  closeDevicePicker(): void {
    this.showDevicePicker.set(false);
  }

  onCameraChange(deviceId: string): void {
    void this.call.switchCamera(deviceId);
  }

  onMicChange(deviceId: string): void {
    void this.call.switchMic(deviceId);
  }

  accept(): void {
    void this.call.acceptCall();
  }

  decline(): void {
    this.call.declineCall();
  }

  hangUp(): void {
    this.call.hangUp();
  }

  toggleMute(): void {
    this.call.toggleMute();
  }

  toggleCamera(): void {
    this.call.toggleCamera();
  }

  dismissError(): void {
    this.call.clearError();
  }
}
