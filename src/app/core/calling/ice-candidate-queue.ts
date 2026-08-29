// ICE candidates can arrive over the signaling channel before setRemoteDescription
// has run (offer/answer and ICE races independently) — queue them and flush once
// the peer connection actually has a remote description to add them against.
// Whether to queue-vs-add-immediately is a per-call-site decision (depends on
// checking pc.remoteDescription), so that branch stays at each call site —
// this only holds the queue + drains it.
export class IceCandidateQueue {
  private queue: RTCIceCandidateInit[] = [];

  add(candidate: RTCIceCandidateInit): void {
    this.queue.push(candidate);
  }

  clear(): void {
    this.queue = [];
  }

  async flush(pc: RTCPeerConnection): Promise<void> {
    const pending = this.queue;
    this.queue = [];
    // One rejected addIceCandidate() (a stale/duplicate candidate, most
    // commonly) must not stop the rest of the batch from being added — a
    // sequential for-await here would silently drop every candidate queued
    // after the first failure, shrinking the candidate pool ICE has to find
    // a working pair from.
    await Promise.allSettled(pending.map((candidate) => pc.addIceCandidate(candidate)));
  }
}
