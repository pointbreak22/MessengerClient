import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Icon } from '../../components/icon/icon';
import { AdminApiService, AdminChat, AdminUser } from '../../services/admin-api.service';
import { UserRole } from '../../interfaces/user-profile';
import { formatLastSeen } from '../../shared/user-display';

type Tab = 'users' | 'chats';

// Superadmin console. Reached only through superAdminGuard, and every request it
// makes is independently checked by the server's SuperAdmin policy.
@Component({
  selector: 'app-admin',
  imports: [Icon],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class Admin {
  private readonly api = inject(AdminApiService);
  private readonly router = inject(Router);
  protected readonly formatLastSeen = formatLastSeen;
  protected readonly UserRole = UserRole;

  protected readonly tab = signal<Tab>('users');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly users = signal<AdminUser[]>([]);
  protected readonly chats = signal<AdminChat[]>([]);

  // Id of the row currently being edited, plus its draft value. Only one row is
  // editable at a time, which keeps "cancel" and "save" unambiguous.
  protected readonly editingId = signal<string | null>(null);
  protected readonly draft = signal('');

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      if (this.tab() === 'users') {
        const page = await firstValueFrom(this.api.listUsers());
        this.users.set(page.items);
      } else {
        const page = await firstValueFrom(this.api.listPublicChats());
        this.chats.set(page.items);
      }
    } catch {
      this.error.set('Не удалось загрузить данные. Проверьте, что у вас есть права суперадмина.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async switchTab(tab: Tab): Promise<void> {
    if (this.tab() === tab) return;
    this.tab.set(tab);
    this.cancelEdit();
    await this.load();
  }

  protected startEdit(id: string, current: string | null): void {
    this.editingId.set(id);
    this.draft.set(current ?? '');
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.draft.set('');
  }

  protected onDraftInput(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }

  protected async saveUser(user: AdminUser): Promise<void> {
    const name = this.draft().trim();
    if (!name || name === user.userName) return this.cancelEdit();

    try {
      const updated = await firstValueFrom(this.api.renameUser(user.id, name));
      this.users.update((list) => list.map((u) => (u.id === updated.id ? updated : u)));
      this.cancelEdit();
    } catch {
      this.error.set(`Не удалось переименовать пользователя ${user.userName}.`);
    }
  }

  protected async toggleBan(user: AdminUser): Promise<void> {
    if (!user.isBanned && !confirm(`Заблокировать ${user.userName}? Пользователь не сможет ничего писать и пропадёт у всех из списков.`)) {
      return;
    }

    try {
      const updated = await firstValueFrom(user.isBanned ? this.api.unbanUser(user.id) : this.api.banUser(user.id));
      this.users.update((list) => list.map((u) => (u.id === updated.id ? updated : u)));
    } catch {
      this.error.set(user.isBanned
        ? `Не удалось разблокировать ${user.userName}.`
        : `Не удалось заблокировать ${user.userName}.`);
    }
  }

  protected async saveChat(chat: AdminChat): Promise<void> {
    const name = this.draft().trim();
    if (!name || name === chat.name) return this.cancelEdit();

    try {
      const updated = await firstValueFrom(this.api.updateChat(chat.id, { name }));
      this.chats.update((list) => list.map((c) => (c.id === updated.id ? updated : c)));
      this.cancelEdit();
    } catch {
      this.error.set('Не удалось переименовать чат.');
    }
  }

  protected async togglePublic(chat: AdminChat): Promise<void> {
    try {
      const updated = await firstValueFrom(this.api.updateChat(chat.id, { isPublic: !chat.isPublic }));
      this.chats.update((list) => list.map((c) => (c.id === updated.id ? updated : c)));
    } catch {
      this.error.set('Не удалось изменить видимость чата.');
    }
  }

  // Deleting a chat destroys its messages for everyone in it, so it asks first.
  protected async deleteChat(chat: AdminChat): Promise<void> {
    const label = chat.name ?? 'без названия';
    if (!confirm(`Удалить чат «${label}» вместе со всеми сообщениями? Это необратимо.`)) return;

    try {
      await firstValueFrom(this.api.deleteChat(chat.id));
      this.chats.update((list) => list.filter((c) => c.id !== chat.id));
    } catch {
      this.error.set('Не удалось удалить чат.');
    }
  }

  protected back(): void {
    void this.router.navigate(['/app']);
  }

  protected dismissError(): void {
    this.error.set(null);
  }
}
