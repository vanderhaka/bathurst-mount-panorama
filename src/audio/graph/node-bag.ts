/** Tracks every node a car-audio instance creates so dispose() can free them all. */
export class NodeBag {
  private readonly nodes: AudioNode[] = [];
  private readonly sources: AudioScheduledSourceNode[] = [];

  add<T extends AudioNode>(node: T): T {
    this.nodes.push(node);
    if (typeof AudioScheduledSourceNode !== 'undefined' && node instanceof AudioScheduledSourceNode) {
      this.sources.push(node);
    }
    return node;
  }

  disposeAll(): void {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* never started or already stopped */
      }
    }
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    this.nodes.length = 0;
    this.sources.length = 0;
  }
}
