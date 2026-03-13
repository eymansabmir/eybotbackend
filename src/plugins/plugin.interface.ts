/**
 * Base interface every plugin must implement.
 *
 * Lifecycle:
 *   1. All plugins are registered on the registry (synchronous).
 *   2. registry.initializeAll() calls initialize() in registration order —
 *      so a plugin can safely call registry.get() for its dependencies inside
 *      its own initialize(), as long as those deps were registered earlier.
 *   3. registry.shutdownAll() calls shutdown() in reverse registration order.
 */
export interface IPlugin {
  /** Unique name used to look this plugin up in the registry. */
  readonly name: string;

  /** Called once at startup. Receive the registry to resolve dependencies. */
  initialize(registry: IPluginRegistry): Promise<void>;

  /** Called once at shutdown (SIGTERM / SIGINT). */
  shutdown(): Promise<void>;
}

/**
 * The registry is the single source of truth for all plugins.
 * Features and other plugins obtain their dependencies from here —
 * they never import concrete plugin classes directly.
 */
export interface IPluginRegistry {
  /**
   * Register a plugin by name. Must be called before initializeAll().
   * Throws if a plugin with the same name is already registered.
   */
  register(plugin: IPlugin): void;

  /**
   * Register any arbitrary value under a string key.
   * Used by feature handlers that are not full IPlugin instances.
   * Throws if the key is already registered.
   */
  registerValue(key: string, value: unknown): void;

  /**
   * Retrieve a plugin by name, cast to the requested type.
   * Throws if the plugin has not been registered.
   */
  get<T>(name: string): T;

  /** Returns true if a plugin with the given name is registered. */
  has(name: string): boolean;

  /**
   * Initialize all registered plugins in registration order.
   * Each plugin's initialize() is awaited before the next one starts,
   * so dependency order is guaranteed by registration order.
   */
  initializeAll(): Promise<void>;

  /**
   * Shutdown all registered plugins in reverse registration order.
   */
  shutdownAll(): Promise<void>;
}
