import { Component, inject } from '@angular/core';
import { Icon } from '../icon/icon';
import { AppUpdateService } from '../../core/pwa/app-update.service';

@Component({
  selector: 'app-update-banner',
  imports: [Icon],
  templateUrl: './update-banner.html',
  styleUrl: './update-banner.css',
})
export class UpdateBanner {
  protected readonly update = inject(AppUpdateService);

  reload(): void {
    this.update.reload();
  }
}
