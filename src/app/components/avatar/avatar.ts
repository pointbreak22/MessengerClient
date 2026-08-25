import { Component, computed, input } from '@angular/core';
import { getInitials } from '../../shared/user-display';

// Single place that decides "real photo vs initials fallback" — every avatar
// in the app was a hand-rolled initials circle with no way to show avatarUrl
// even though UserProfile has carried it all along. Size/color stay as
// per-call-site inputs since existing spots vary a lot (h-8 header avatar vs
// h-20 profile hero, gradient "you" avatars vs plain ones for others).
@Component({
  selector: 'app-avatar',
  imports: [],
  templateUrl: './avatar.html',
  styleUrl: './avatar.css',
})
export class Avatar {
  readonly name = input<string | null | undefined>();
  readonly avatarUrl = input<string | null | undefined>();
  readonly sizeClass = input('h-10 w-10');
  readonly textClass = input('text-xs font-semibold');
  readonly colorClass = input('bg-surface-alt text-muted-foreground');

  protected readonly initials = computed(() => getInitials(this.name()));
}
