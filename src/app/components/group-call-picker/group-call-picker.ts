import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { CallsApiService } from '../../services/calls-api.service';
import { ChatStore } from '../../stores/chat.store';
import { Avatar } from '../avatar/avatar';
import { Icon } from '../icon/icon';
import { GroupCallProvidersDto } from '../../interfaces/active-call';
import { GroupCallRegistry } from '../../core/calling/group-call-registry.service';
import { GroupCallProviderKind } from '../../core/calling/group-call-provider';

@Component({
  selector: 'app-group-call-picker',
  imports: [Icon, Avatar],
  templateUrl: './group-call-picker.html',
  styleUrl: './group-call-picker.css',
})
export class GroupCallPicker {
  private readonly chatStore = inject(ChatStore);
  private readonly registry = inject(GroupCallRegistry);
  private readonly callsApi = inject(CallsApiService);
  private readonly auth = inject(AuthService);

  protected readonly show = this.chatStore.showGroupCallPicker;
  protected readonly chat = this.chatStore.selectedChat;
  protected readonly members = computed(() => {
    const myId = this.auth.currentUserProfile()?.id;
    return this.chatStore.selectedChatMemberProfiles().filter((m) => m.id !== myId);
  });

  protected readonly selectedIds = signal<ReadonlySet<string>>(new Set());
  protected readonly selectedProvider = signal<GroupCallProviderKind>('mesh');
  protected readonly providers = signal<GroupCallProvidersDto | null>(null);
  protected readonly providerKinds: GroupCallProviderKind[] = ['mesh', 'livekit', 'jitsi', 'janus'];

  // Mesh is the only real transport today, so its cap is what governs
  // selection regardless of selectedProvider() — revisit once another
  // provider is actually wired up with its own limit.
  protected readonly maxParticipants = computed(() => this.providers()?.mesh.maxParticipants ?? 8);
  protected readonly isOverCap = computed(() => this.selectedIds().size + 1 > this.maxParticipants());

  constructor() {
    void firstValueFrom(this.callsApi.getProviders())
      .then((p) => this.providers.set(p))
      .catch(() => {});
  }

  isSelected(userId: string): boolean {
    return this.selectedIds().has(userId);
  }

  toggleMember(userId: string): void {
    this.selectedIds.update((ids) => {
      const next = new Set(ids);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  selectAll(): void {
    this.selectedIds.set(new Set(this.members().map((m) => m.id)));
  }

  isProviderAvailable(kind: GroupCallProviderKind): boolean {
    const p = this.providers();
    if (!p) return kind === 'mesh'; // optimistic default before GET /calls/providers resolves
    switch (kind) {
      case 'mesh':
        return p.mesh.available;
      case 'livekit':
        return p.liveKit.available;
      case 'jitsi':
        return p.jitsi.available;
      case 'janus':
        return p.janus.available;
    }
  }

  selectProvider(kind: GroupCallProviderKind): void {
    if (!this.isProviderAvailable(kind)) return;
    this.selectedProvider.set(kind);
  }

  close(): void {
    this.selectedIds.set(new Set());
    this.chatStore.closeGroupCallPicker();
  }

  async call(isVideo: boolean): Promise<void> {
    const chat = this.chat();
    const participantIds = [...this.selectedIds()];
    if (!chat || participantIds.length === 0 || this.isOverCap()) return;

    const provider = this.registry.get(this.selectedProvider());
    this.close();
    await provider.start(chat.id, participantIds, isVideo);
  }
}
