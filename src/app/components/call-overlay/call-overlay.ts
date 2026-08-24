import { Component, inject } from '@angular/core';
import { Icon } from '../icon/icon';
import { CallService } from '../../core/signalr/call.service';
import { getInitials } from '../../shared/user-display';

@Component({
  selector: 'app-call-overlay',
  imports: [Icon],
  templateUrl: './call-overlay.html',
  styleUrl: './call-overlay.css',
})
export class CallOverlay {
  protected readonly call = inject(CallService);
  protected readonly getInitials = getInitials;

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
}
