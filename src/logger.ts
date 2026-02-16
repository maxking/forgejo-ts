/**
 * Logger interface for the Forgejo client.
 * Consumers can inject their own logger (e.g. VS Code output channel).
 */
export interface ForgejoLogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * No-op logger that silently discards all messages.
 */
export const noopLogger: ForgejoLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {}
};
