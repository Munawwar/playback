/**
 * Intercepts all methods of an object and returns an object with the same keys
 * but with intercept results as values.
 *
 * @template {{ [x: string]:  any }} T - The type of the object being intercepted
 * @type {import('./types/interceptAllMethods').InterceptAllMethods<T>} An object containing intercept results for each method
 *
 * @example
 * const myObject = {
 *   method1: () => 'original1',
 *   method2: (x) => x * 2,
 *   property: 'not a function'
 * };
 *
 * const intercepted = interceptAllMethods(myObject);
 * // intercepted will have keys 'method1' and 'method2' (but not 'property')
 * // Each value is an intercept result with mock(), undoMock(), and destroy() methods
 */
export const interceptAllMethods: import("./types/interceptAllMethods").InterceptAllMethods<T>;
