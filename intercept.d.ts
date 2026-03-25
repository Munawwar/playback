/**
 * Extracts the keys of an object where the values of the keys are functions.
 * @template T The object type.
 * @typedef {Extract<
 *   keyof T,
 *   { [K in keyof T]: T[K] extends Function ? K : never }[keyof T]
 * >} FunctionKeys
 */
/**
 * @template T
 * @template {FunctionKeys<T>} K
 * @param {T} object
 * @param {K} methodName
 */
export function intercept<T, K extends FunctionKeys<T>>(object: T, methodName: K): {
    /**
     * @param {(originalMethod: T[K], ...args: Parameters<T[K]>) => any} mockFunction
     */
    mock(mockFunction: (originalMethod: T[K], ...args: Parameters<T[K]>) => any): void;
    undoMock(): void;
    /**
     * Un-intercepting will not get rid of closures to interceptedFunction
     */
    destroy(): void;
};
export function undoAllMocks(): void;
/**
 * Extracts the keys of an object where the values of the keys are functions.
 */
export type FunctionKeys<T> = Extract<keyof T, { [K in keyof T]: T[K] extends Function ? K : never; }[keyof T]>;
