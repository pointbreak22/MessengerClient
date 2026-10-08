import { Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Icon } from '../../components/icon/icon';
import { AdminApiService, AdminChat, AdminIpBan, AdminUser, AdminViolation } from '../../services/admin-api.service';
import { UserRole } from '../../interfaces/user-profile';
import { formatLastSeen } from '../../shared/user-display';

type Tab = 'users' | 'chats' | 'ipBans';

// Violations of one user, fetched lazily the first time the row is expanded.
type ViolationsState = AdminViolation[] | 'loading' | 'error';

const TARGET_LABELS: Record<AdminViolation['target'], string> = {
  Message: 'Message',
  UserName: 'Nickname',
  ChatName: 'Chat name',
};

// Superadmin console. Reached only through superAdminGuard, and every request it
// makes is independently checked by the server's SuperAdmin policy.
@Component({
  selector: 'app-admin',
  imports: [Icon, NgTemplateOutlet],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class Admin {
  private readonly api = inject(AdminApiService);
  private readonly router = inject(Router);
  protected readonly formatLastSeen = formatLastSeen;
  protected readonly UserRole = UserRole;
  protected readonly targetLabels = TARGET_LABELS;

  protected readonly tab = signal<Tab>('users');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly users = signal<AdminUser[]>([]);
  protected readonly chats = signal<AdminChat[]>([]);
  protected readonly ipBans = signal<AdminIpBan[]>([]);

  // Lets the users list flag "this IP is banned" without a field per user.
  protected readonly bannedIps = computed(() => new Set(this.ipBans().map((b) => b.ipAddress)));

  // Id of the row currently being edited, plus its draft value. Only one row is
  // editable at a time, which keeps "cancel" and "save" unambiguous.
  protected readonly editingId = signal<string | null>(null);
  protected readonly draft = signal('');

  protected readonly expandedUserId = signal<string | null>(null);
  protected readonly violations = signal<Record<string, ViolationsState>>({});

  // "Ban an IP" form on the IP bans tab.
  protected readonly newIp = signal('');
  protected readonly newIpReason = signal('');
  protected readonly newIpDays = signal('7');

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      if (this.tab() === 'users') {
        const [page, bans] = await Promise.all([
          firstValueFrom(this.api.listUsers()),
          firstValueFrom(this.api.listIpBans()),
        ]);
        this.users.set(page.items);
        this.ipBans.set(bans);
      } else if (this.tab() === 'chats') {
        const page = await firstValueFrom(this.api.listPublicChats());
        this.chats.set(page.items);
      } else {
        this.ipBans.set(await firstValueFrom(this.api.listIpBans()));
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
      this.replaceUser(updated);
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
      this.replaceUser(updated);
    } catch {
      this.error.set(user.isBanned
        ? `Не удалось разблокировать ${user.userName}.`
        : `Не удалось заблокировать ${user.userName}.`);
    }
  }

  // ---------- violations ----------

  protected async toggleViolations(user: AdminUser): Promise<void> {
    if (this.expandedUserId() === user.id) {
      this.expandedUserId.set(null);
      return;
    }
    this.expandedUserId.set(user.id);
    if (Array.isArray(this.violations()[user.id])) return;

    this.setViolations(user.id, 'loading');
    try {
      this.setViolations(user.id, await firstValueFrom(this.api.listViolations(user.id)));
    } catch {
      this.setViolations(user.id, 'error');
    }
  }

  protected violationsOf(userId: string): ViolationsState | undefined {
    return this.violations()[userId];
  }

  protected isViolationList(state: ViolationsState | undefined): state is AdminViolation[] {
    return Array.isArray(state);
  }

  private setViolations(userId: string, state: ViolationsState): void {
    this.violations.update((map) => ({ ...map, [userId]: state }));
  }

  // ---------- IP bans ----------

  protected isIpBanned(ip: string | null): boolean {
    return !!ip && this.bannedIps().has(ip);
  }

  // Quick action from a user row / violation: asks only for the duration.
  protected async banIpQuick(ip: string, reason: string): Promise<void> {
    const answer = prompt(`Заблокировать IP ${ip}? На сколько дней (0 — навсегда):`, '7');
    if (answer === null) return;
    const days = Number(answer);
    if (!Number.isFinite(days) || days < 0) {
      this.error.set('Количество дней должно быть числом от 0.');
      return;
    }
    await this.createIpBan(ip, reason, days);
  }

  protected async submitIpBan(): Promise<void> {
    const ip = this.newIp().trim();
    const days = Number(this.newIpDays() || '0');
    if (!ip) return;
    if (!Number.isFinite(days) || days < 0) {
      this.error.set('Количество дней должно быть числом от 0.');
      return;
    }
    if (await this.createIpBan(ip, this.newIpReason().trim() || null, days)) {
      this.newIp.set('');
      this.newIpReason.set('');
    }
  }

  private async createIpBan(ip: string, reason: string | null, days: number): Promise<boolean> {
    try {
      const ban = await firstValueFrom(this.api.banIp(ip, reason, days || null));
      this.ipBans.update((list) => [ban, ...list]);
      return true;
    } catch {
      this.error.set(`Не удалось заблокировать IP ${ip}: адрес некорректен или уже заблокирован.`);
      return false;
    }
  }

  protected async unbanIp(ban: AdminIpBan): Promise<void> {
    if (!confirm(`Снять блокировку с IP ${ban.ipAddress}?`)) return;
    try {
      await firstValueFrom(this.api.unbanIp(ban.id));
      this.ipBans.update((list) => list.filter((b) => b.id !== ban.id));
    } catch {
      this.error.set(`Не удалось разблокировать IP ${ban.ipAddress}.`);
    }
  }

  protected unbanIpByAddress(ip: string): void {
    const ban = this.ipBans().find((b) => b.ipAddress === ip);
    if (ban) void this.unbanIp(ban);
  }

  protected onInput(target: 'ip' | 'reason' | 'days', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (target === 'ip') this.newIp.set(value);
    else if (target === 'reason') this.newIpReason.set(value);
    else this.newIpDays.set(value);
  }

  protected formatDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  }

  // ---------- chats ----------

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

  private replaceUser(updated: AdminUser): void {
    this.users.update((list) => list.map((u) => (u.id === updated.id ? updated : u)));
  }
}
