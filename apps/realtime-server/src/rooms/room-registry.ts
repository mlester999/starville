export class RoomRegistry {
  readonly #membersByRoom = new Map<string, Set<string>>();

  join(roomId: string, connectionId: string): void {
    const members = this.#membersByRoom.get(roomId) ?? new Set<string>();
    members.add(connectionId);
    this.#membersByRoom.set(roomId, members);
  }

  leave(roomId: string, connectionId: string): void {
    const members = this.#membersByRoom.get(roomId);
    if (members === undefined) {
      return;
    }

    members.delete(connectionId);
    if (members.size === 0) {
      this.#membersByRoom.delete(roomId);
    }
  }

  removeConnection(connectionId: string): void {
    for (const roomId of this.#membersByRoom.keys()) {
      this.leave(roomId, connectionId);
    }
  }

  memberCount(roomId: string): number {
    return this.#membersByRoom.get(roomId)?.size ?? 0;
  }
}
