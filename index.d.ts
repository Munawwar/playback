export function defaultFixtureFileNameGenerator(arg0: FilenameGeneratorArgs): {
    filePrefix: string;
    fileSuffixDerivedFrom: any[];
};
/**
 * Wrap a function for recording / replaying fixtures when needed
 * (recording / replaying is 'on' by default). This function maybe
 * used along with esmock npm library.
 * @template {Function} T
 * @param {string} functionName
 * @param {T} func
 * @returns {T}
 */
export function wrapFunction<T extends Function>(functionName: string, func: T): T;
export function wrapForEsmock(importFunction: any, methods: any): Promise<{
    [x: number]: {};
}>;
/**
 * Intercept a method on an object for fixture recording
 * @param {any} object - The object containing the method
 * @param {string} methodName - The name of the method to intercept
 * @param {string} [prefix=''] - The prefix added to the fixture file name (by default no prefix)
 * This is to prevent collisions when intercepting multiple methods with the similar name.
 * @returns {{ undoMock: () => void, destroy: () => void }} - Object with undoMock and destroy methods
 */
export function interceptMethod(object: any, methodName: string, prefix?: string): {
    undoMock: () => void;
    destroy: () => void;
};
/**
 * Intercepts all methods of an object and returns an object with the same keys
 * but with intercept results as values.
 *
 * @template {Record<string, Function>} T - The type of the object being intercepted
 * @param {T} object - The object containing the method
 * @param {string} [prefix=''] - The prefix added to the fixture file name (by default no prefix)
 * This is to prevent collisions when intercepting multiple methods with the similar name.
 * @returns {{ [K in import('./types/interceptAllMethods').FunctionKeys<T>]: ReturnType<typeof interceptMethod> }} An object containing intercept results for each method
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
export function interceptAllMethods<T extends Record<string, Function>>(object: T, prefix?: string): { [K in import("./types/interceptAllMethods").FunctionKeys<T>]: ReturnType<typeof interceptMethod>; };
/**
 * Start a test case
 * @param {string} directoryName
 */
export function startTestCase(directoryName: string): void;
/**
 * End a test case
 */
export function endTestCase(): void;
/**
 * Start fixture recording
 * @param {object} opts
 * @param {string} opts.fixtureDirectory
 */
export function configure({ fixtureDirectory: _fixtureDirectory }: {
    fixtureDirectory: string;
}): void;
/**
 * Attach a custom fixture filename generator
 * @param {FilenameGenerator} func - The custom filename generator function
 */
export function attachFixtureFilenameGenerator(func: FilenameGenerator): void;
/**
 * Reset fixture filename generator to default
 */
export function resetFixtureFilenameGenerator(): void;
export type FixtureFileInfo = {
    /**
     * - The absolute path to the fixture file
     */
    absoluteFilePath: string;
    /**
     * - The relative file name of the fixture
     */
    fileName: string;
    /**
     * - The prefix used for the fixture file
     */
    filePrefix: string;
    /**
     * - The arguments or data used to derive the file suffix
     */
    fileSuffixDerivedFrom: any[];
};
export type FixtureData = {
    /**
     * - The name of the function that was called
     */
    functionName: string;
    /**
     * - The filtered parameters passed to the function
     */
    params: any[];
    /**
     * - The result returned by the function (if successful)
     */
    result?: any;
    /**
     * - The error message (if function threw an error)
     */
    error?: string | undefined;
    /**
     * - Whether the function call resulted in an error
     */
    isError: boolean;
    /**
     * - ISO timestamp of when the fixture was created
     */
    timestamp: string;
    /**
     * - The data used to derive the file suffix
     * (only if different from params)
     */
    fileSuffixDerivedFrom?: any[] | undefined;
};
export type FilenameGeneratorArgs = {
    /**
     * - The name of the function
     */
    functionName: string;
    /**
     * - The serializable arguments passed to the function
     */
    serializableArgs: any[];
};
export type FilenameGenerator = (arg0: FilenameGeneratorArgs) => {
    filePrefix: string;
    fileSuffixDerivedFrom: any[];
};
