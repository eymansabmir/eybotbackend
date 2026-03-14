import { IPlugin, IPluginRegistry } from './plugin.interface';

export class PluginRegistry implements IPluginRegistry {
  private readonly plugins: Map<string, IPlugin> = new Map();
  private readonly values: Map<string, unknown> = new Map();
  private readonly registrationOrder: string[] = [];

  register(plugin: IPlugin): void {
    if (this.plugins.has(plugin.name)) {
      throw new Error(
        `[PluginRegistry] Plugin "${plugin.name}" is already registered. ` +
        `Each plugin name must be unique.`
      );
    }
    this.plugins.set(plugin.name, plugin);
    this.registrationOrder.push(plugin.name);
    logger.debug({ plugin: plugin.name }, 'Plugin registered');
  }

  registerValue(key: string, value: unknown): void {
    if (this.values.has(key)) {
      throw new Error(`[PluginRegistry] Value "${key}" is already registered.`);
    }
    this.values.set(key, value);
    logger.debug({ key }, 'Registry value registered');
  }

  get<T>(name: string): T {
    if (this.values.has(name)) {
      return this.values.get(name) as T;
    }
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(
        `[PluginRegistry] "${name}" not found. ` +
        `Registered: [${this.registrationOrder.join(', ')}]`
      );
    }
    return plugin as unknown as T;
  }

  has(name: string): boolean {
    return this.plugins.has(name);
  }

  async initializeAll(): Promise<void> {
    for (const name of this.registrationOrder) {
      const plugin = this.plugins.get(name)!;
      logger.info({ plugin: name }, 'Initialising plugin');
      await plugin.initialize(this);
      logger.info({ plugin: name }, 'Plugin ready');
    }
  }

  async shutdownAll(): Promise<void> {
    const reverseOrder = [...this.registrationOrder].reverse();
    for (const name of reverseOrder) {
      const plugin = this.plugins.get(name)!;
      logger.info({ plugin: name }, 'Shutting down plugin');
      try {
        await plugin.shutdown();
        logger.info({ plugin: name }, 'Plugin stopped');
      } catch (err) {
        logger.error({ plugin: name, err }, 'Error shutting down plugin');
      }
    }
  }
}
