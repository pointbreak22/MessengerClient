import { Component, inject } from '@angular/core';
import { Icon } from '../icon/icon';
import { ModerationNoticeStore } from '../../core/moderation/moderation-notice.store';

@Component({
  selector: 'app-moderation-notice',
  imports: [Icon],
  templateUrl: './moderation-notice.html',
  styleUrl: './moderation-notice.css',
})
export class ModerationNotice {
  protected readonly store = inject(ModerationNoticeStore);

  dismiss(): void {
    this.store.dismiss();
  }
}
