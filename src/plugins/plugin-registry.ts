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
    console.log(`[PluginRegistry] Registered plugin: ${plugin.name}`);
  }

  registerValue(key: string, value: unknown): void {
    if (this.values.has(key)) {
      throw new Error(`[PluginRegistry] Value "${key}" is already registered.`);
    }
    this.values.set(key, value);
    console.log(`[PluginRegistry] Registered value: ${key}`);
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
      console.log(`[PluginRegistry] Initializing plugin: ${name}`);
      await plugin.initialize(this);
      console.log(`[PluginRegistry] ✓ Plugin ready: ${name}`);
    }
  }

  async shutdownAll(): Promise<void> {
    const reverseOrder = [...this.registrationOrder].reverse();
    for (const name of reverseOrder) {
      const plugin = this.plugins.get(name)!;
      console.log(`[PluginRegistry] Shutting down plugin: ${name}`);
      try {
        await plugin.shutdown();
        console.log(`[PluginRegistry] ✓ Plugin stopped: ${name}`);
      } catch (err) {
        console.error(`[PluginRegistry] Error shutting down plugin "${name}":`, err);
      }
    }
  }
}
