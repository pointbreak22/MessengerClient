import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { UserApiService } from '../../services/user-api.service';
import { Avatar } from '../avatar/avatar';
import { Icon } from '../icon/icon';
import { getInitials } from '../../shared/user-display';

@Component({
  selector: 'app-header',
  imports: [Icon, Avatar],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class Header {
  private readonly auth = inject(AuthService);
  private readonly userApi = inject(UserApiService);

  @ViewChild('avatarFileInput') private readonly avatarFileInput!: ElementRef<HTMLInputElement>;

  protected readonly currentUser = this.auth.currentUserProfile;
  protected readonly getInitials = getInitials;

  protected readonly showProfileMenu = signal(false);
  protected readonly uploadingAvatar = signal(false);
  protected readonly editingName = signal(false);
  protected readonly nameDraft = signal('');
  protected readonly savingName = signal(false);

  signOut(): void {
    this.auth.logout();
  }

  toggleProfileMenu(): void {
    const next = !this.showProfileMenu();
    this.showProfileMenu.set(next);
    if (!next) this.editingName.set(false);
  }

  closeProfileMenu(): void {
    this.showProfileMenu.set(false);
    this.editingName.set(false);
  }

  triggerAvatarUpload(): void {
    if (this.uploadingAvatar()) return;
    this.avatarFileInput.nativeElement.click();
  }

  async onAvatarSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-selecting the same file next time
    if (!file) return;

    this.uploadingAvatar.set(true);
    try {
      const { avatarUrl } = await firstValueFrom(this.userApi.uploadAvatar(file));
      this.auth.updateProfile({ avatarUrl });
    } finally {
      this.uploadingAvatar.set(false);
    }
  }

  async removeAvatar(): Promise<void> {
    if (this.uploadingAvatar()) return;
    this.uploadingAvatar.set(true);
    try {
      await firstValueFrom(this.userApi.deleteAvatar());
      this.auth.updateProfile({ avatarUrl: null });
    } finally {
      this.uploadingAvatar.set(false);
    }
  }

  startEditName(): void {
    this.nameDraft.set(this.currentUser()?.userName ?? '');
    this.editingName.set(true);
  }

  cancelEditName(): void {
    this.editingName.set(false);
  }

  onNameDraftInput(event: Event): void {
    this.nameDraft.set((event.target as HTMLInputElement).value);
  }

  async saveName(): Promise<void> {
    const userName = this.nameDraft().trim();
    if (!userName || this.savingName()) return;

    this.savingName.set(true);
    try {
      await firstValueFrom(this.userApi.updateMe(userName));
      this.auth.updateProfile({ userName });
      this.editingName.set(false);
    } finally {
      this.savingName.set(false);
    }
  }
}
