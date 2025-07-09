export default class EventHub<Events extends Record<string, any> = Record<string, any>> {
  private listeners: { [K in keyof Events]?: Array<(payload: Events[K]) => void> } = {};

  /**
   * Emit an event with the given payload.
   * @param event The event key.
   * @param payload The payload for this event.
   */
  emit<E extends keyof Events>(event: E, payload: Events[E]): void {
    const handlers = this.listeners[event];
    if (handlers) {
      handlers.forEach((handler) => handler(payload));
    }
  }

  /**
   * Subscribe to an event.
   * @param event The event key.
   * @param handler Callback invoked with the event payload.
   */
  subscribe<E extends keyof Events>(
    event: E,
    handler: (payload: Events[E]) => void
  ): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event]!.push(handler);
  }

  /**
   * Unsubscribe a handler from an event.
   * @param event The event key.
   * @param handler The same callback passed to subscribe.
   */
  unsubscribe<E extends keyof Events>(
    event: E,
    handler: (payload: Events[E]) => void
  ): void {
    const handlers = this.listeners[event];
    if (!handlers) return;
    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }
    if (handlers.length === 0) {
      delete this.listeners[event];
    }
  }
}