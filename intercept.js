/*
 * This function was created with a realization that once you override a method for mocking
 * and run a test, you can't undo the override, because shared code (test runner without
 * test isolation) will hold on to closures to the overridden function.
 *
 * So a solution it to intercept once before all tests, mock for a test and "undoMock()" at
 * end of a test will cause the intercept to "proxy" future calls to the original method.
 */

const mocked = new Set();

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
export function intercept(object, methodName) {
  let mockHandler = null;
  const originalMethod = object[methodName];
  // @ts-ignore
  const boundedMethod = object[methodName].bind(object);

  // @ts-ignore
  // eslint-disable-next-line no-param-reassign
  object[methodName] = function interceptedFunction(...args) {
    return mockHandler
      ? mockHandler(boundedMethod, ...args)
      // @ts-ignore
      : originalMethod.apply(object, args);
  };

  return {
    /**
     * @param {(originalMethod: T[K], ...args: Parameters<T[K]>) => ReturnType<T[K]>} mockFunction
     */
    mock(mockFunction) {
      mockHandler = mockFunction;
      mocked.add(this);
    },
    undoMock() {
      mockHandler = null;
      mocked.delete(this);
    },
    /**
     * Un-intercepting will not get rid of closures to interceptedFunction
     */
    destroy() {
      mockHandler = null;
      // eslint-disable-next-line no-param-reassign
      object[methodName] = originalMethod;
    },
  };
}

export function undoAllMocks() {
  [...mocked].forEach((methods) => methods.undoMock());
}
