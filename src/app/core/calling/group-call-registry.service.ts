import { Injectable, inject } from '@angular/core';
import { GroupCallService } from '../signalr/group-call.service';
import { GroupCallProvider, GroupCallProviderKind } from './group-call-provider';
import { createUnavailableProvider } from './unavailable-group-call-provider';

// One place that knows about every group-call transport GroupCallPicker can
// offer. Only 'mesh' is a real, working implementation today (GroupCallService);
// LiveKit/Jitsi/Janus are stubs (see unavailable-group-call-provider.ts) until
// each gets real credentials — at that point, swap the stub here for a real
// GroupCallProvider implementation and nothing else in the UI needs to change.
@Injectable({ providedIn: 'root' })
export class GroupCallRegistry {
  private readonly providers: Record<GroupCallProviderKind, GroupCallProvider>;

  constructor() {
    this.providers = {
      mesh: inject(GroupCallService),
      livekit: createUnavailableProvider('livekit', 'LiveKit'),
      jitsi: createUnavailableProvider('jitsi', 'Jitsi'),
      janus: createUnavailableProvider('janus', 'Janus'),
    };
  }

  get(kind: GroupCallProviderKind): GroupCallProvider {
    return this.providers[kind];
  }
}
