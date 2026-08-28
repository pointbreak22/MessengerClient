import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { CallsApiService } from '../../services/calls-api.service';
import { CallPresenceStore } from '../../stores/call-presence.store';
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
  private readonly callPresence = inject(CallPresenceStore);

  protected readonly show = this.chatStore.showGroupCallPicker;
  protected readonly isVideo = this.chatStore.groupCallPickerVideo;
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

  // Already on some call (any call, not necessarily one I'm in — I'm not on
  // one yet, this picker is how I'd start one) — can't call someone twice at
  // once, so they're not selectable here.
  isMemberBusy(userId: string): boolean {
    return this.callPresence.badgeFor(userId, null).status !== 'none';
  }

  toggleMember(userId: string): void {
    if (this.isMemberBusy(userId)) return;
    this.selectedIds.update((ids) => {
      const next = new Set(ids);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  selectAll(): void {
    this.selectedIds.set(new Set(this.members().filter((m) => !this.isMemberBusy(m.id)).map((m) => m.id)));
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

  async call(): Promise<void> {
    const chat = this.chat();
    const participantIds = [...this.selectedIds()];
    if (!chat || participantIds.length === 0 || this.isOverCap()) return;

    const provider = this.registry.get(this.selectedProvider());
    const isVideo = this.isVideo();
    this.close();
    await provider.start(chat.id, participantIds, isVideo);
  }
}
