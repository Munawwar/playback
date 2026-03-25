import { intercept } from '../intercept';

/**
 * Extracts the keys of an object where the values are functions.
 */
export type FunctionKeys<T> = {
  [K in keyof T]: T[K] extends Function ? K : never;
}[keyof T];

/**
 * Creates a mapped type where each function property of T is mapped to an intercept result.
 */
export type InterceptResult<T, K extends keyof FunctionKeys<T>> = {
  mock(mockFunction: (originalMethod: T[K], ...args: Parameters<T[K]>) => ReturnType<T[K]>): void;
  undoMock(): void;
  /**
   * Un-intercepting will not get rid of closures to interceptedFunction
   */
  destroy(): void;
};

type Intercept = typeof intercept;

export type InterceptAllMethods<T> = (object: T) => {
  [K in FunctionKeys<T>]: ReturnType<Intercept<T, K>>;
};