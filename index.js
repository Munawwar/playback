import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
// eslint-disable-next-line import/no-extraneous-dependencies
import { diffChars } from 'diff';
import stringify from 'fast-stable-stringify';
import { intercept } from './intercept.js';

// Environment variable FIXTURE = update / append / read (default)
// @ts-ignore
const FIXTURE = process.env.FIXTURE || 'read';

let fixtureDirectory = null;
let fixtureSubDirectory = '';
const fixtures = new Map();
const readFiles = new Set();
const writtenFiles = new Set();
const allUsedFiles = new Set(); // Global tracking across all test cases
const interceptedMethods = new Set();
const unusedFixturesLogFile = 'unused-fixtures.log';
let beforeExitEventSeen = false;
let cachedFilesList = null; // Cache for directory file list (used for error debugging)
const hashCache = new Map(); // Cache for hash calculations

/**
 * Filter out functions from an object recursively
 * @param {any} obj
 * @returns {any}
 */
function filterFunctions(obj) {
  if (typeof obj === 'function') {
    return '[Function]';
  }
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(filterFunctions);
  }

  const filtered = {};
  Object.keys(obj).forEach((key) => {
    const value = obj[key];
    if (typeof value === 'function') {
      // Skip functions entirely
      return;
    }
    filtered[key] = filterFunctions(value);
  });
  return filtered;
}

/**
 * Check if a value contains functions recursively
 * @param {any} obj
 * @returns {boolean}
 */
function containsFunctions(obj) {
  if (typeof obj === 'function') {
    return true;
  }
  if (obj === null || typeof obj !== 'object') {
    return false;
  }
  if (Array.isArray(obj)) {
    return obj.some(containsFunctions);
  }

  return Object.values(obj).some(containsFunctions);
}

/**
 * ANSI color codes for terminal output
 */
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  white: '\x1b[37m',
};

/**
 * Create a diff showing both object structure and character differences
 * @param {any} oldObj
 * @param {any} newObj
 * @returns {string}
 */
function createDiff(oldObj, newObj) {
  const diffParts = [];

  function addColoredText(text, isAdded, isRemoved) {
    if (isAdded) {
      return `${colors.green}+${text}${colors.reset}`;
    }
    if (isRemoved) {
      return `${colors.red}-${text}${colors.reset}`;
    }
    return ` ${text}`;
  }

  function addHighlightedDiff(oldValue, newValue, prefix = '') {
    const oldStr = typeof oldValue === 'string' ? oldValue : JSON.stringify(oldValue);
    const newStr = typeof newValue === 'string' ? newValue : JSON.stringify(newValue);

    // Show character-level diff for the values
    const charDiff = diffChars(oldStr, newStr);

    let removedLine = `${colors.red}-${prefix}`;
    let addedLine = `${colors.green}+${prefix}`;

    charDiff.forEach((part) => {
      if (part.removed) {
        removedLine += `${colors.bgRed}${colors.white}${part.value}${colors.reset}${colors.red}`;
      } else if (part.added) {
        addedLine += `${colors.bgGreen}${colors.white}${part.value}${colors.reset}${colors.green}`;
      } else {
        removedLine += part.value;
        addedLine += part.value;
      }
    });

    removedLine += colors.reset;
    addedLine += colors.reset;

    return [removedLine, addedLine];
  }

  function compareObjects(oldValue, newValue, propertyPath = '', indent = '') {
    const oldStr = stringify(oldValue);
    const newStr = stringify(newValue);

    if (oldStr === newStr) {
      return; // No differences
    }

    // Handle different types
    if (typeof oldValue !== typeof newValue) {
      const lines = addHighlightedDiff(oldValue, newValue, `${indent}"${propertyPath}": `);
      diffParts.push(lines[0]);
      diffParts.push(lines[1]);
      return;
    }

    // Handle arrays
    if (Array.isArray(oldValue) && Array.isArray(newValue)) {
      const maxLength = Math.max(oldValue.length, newValue.length);

      Array.from({ length: maxLength }, (_, i) => {
        const oldItem = i < oldValue.length ? oldValue[i] : undefined;
        const newItem = i < newValue.length ? newValue[i] : undefined;

        if (oldItem === undefined) {
          diffParts.push(addColoredText(`${indent}[${i}]: ${JSON.stringify(newItem)}`, true, false));
        } else if (newItem === undefined) {
          diffParts.push(addColoredText(`${indent}[${i}]: ${JSON.stringify(oldItem)}`, false, true));
        } else if (stringify(oldItem) !== stringify(newItem)) {
          if (typeof oldItem === 'object' && typeof newItem === 'object') {
            diffParts.push(`${indent}[${i}]: {`);
            compareObjects(oldItem, newItem, '', `${indent}  `);
            diffParts.push(`${indent}}`);
          } else {
            const lines = addHighlightedDiff(oldItem, newItem, `${indent}[${i}]: `);
            diffParts.push(lines[0]);
            diffParts.push(lines[1]);
          }
        }
        return null;
      });
      return;
    }

    // Handle objects
    if (oldValue && newValue && typeof oldValue === 'object' && typeof newValue === 'object') {
      const allKeys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);

      allKeys.forEach((key) => {
        const oldProp = oldValue[key];
        const newProp = newValue[key];

        if (!(key in oldValue)) {
          diffParts.push(addColoredText(`${indent}"${key}": ${JSON.stringify(newProp)}`, true, false));
        } else if (!(key in newValue)) {
          diffParts.push(addColoredText(`${indent}"${key}": ${JSON.stringify(oldProp)}`, false, true));
        } else if (stringify(oldProp) !== stringify(newProp)) {
          if (typeof oldProp === 'object' && typeof newProp === 'object') {
            diffParts.push(`${indent}"${key}": {`);
            compareObjects(oldProp, newProp, key, `${indent}  `);
            diffParts.push(`${indent}}`);
          } else {
            const lines = addHighlightedDiff(oldProp, newProp, `${indent}"${key}": `);
            diffParts.push(lines[0]);
            diffParts.push(lines[1]);
          }
        }
      });
      return;
    }

    // Handle primitive values
    const lines = addHighlightedDiff(oldValue, newValue, `${indent}`);
    diffParts.push(lines[0]);
    diffParts.push(lines[1]);
  }

  compareObjects(oldObj, newObj);

  if (diffParts.length === 0) {
    return '';
  }

  return `[\n${diffParts.map((line) => `  ${line}`).join('\n')}\n]`;
}

/**
 * Default fixture filename generator
 * @type {FilenameGenerator}
 */
export function defaultFixtureFileNameGenerator({ functionName, serializableArgs }) {
  const filePrefix = functionName;
  const fileSuffixDerivedFrom = serializableArgs;
  return { filePrefix, fileSuffixDerivedFrom };
}

let fixtureFileNameGenerator = defaultFixtureFileNameGenerator;

/**
 * @typedef {Object} FixtureFileInfo
 * @property {string} absoluteFilePath - The absolute path to the fixture file
 * @property {string} fileName - The relative file name of the fixture
 * @property {string} filePrefix - The prefix used for the fixture file
 * @property {any[]} fileSuffixDerivedFrom - The arguments or data used to derive the file suffix
 */

/**
 * @typedef {Object} FixtureData
 * @property {string} functionName - The name of the function that was called
 * @property {any[]} params - The filtered parameters passed to the function
 * @property {any} [result] - The result returned by the function (if successful)
 * @property {string} [error] - The error message (if function threw an error)
 * @property {boolean} isError - Whether the function call resulted in an error
 * @property {string} timestamp - ISO timestamp of when the fixture was created
 * @property {any[]} [fileSuffixDerivedFrom] - The data used to derive the file suffix
 * (only if different from params)
 */

/**
 * @typedef {Object} FilenameGeneratorArgs
 * @property {string} functionName - The name of the function
 * @property {any[]} serializableArgs - The serializable arguments passed to the function
 */

/**
 * @typedef {function(FilenameGeneratorArgs): {
 *  filePrefix: string,
 *  fileSuffixDerivedFrom: any[]
 * }} FilenameGenerator
 */

/**
 * Get fixture file info
 * @param {string} functionName
 * @param {any[]} args
 * @returns {FixtureFileInfo}
 */
function getFixtureFileInfo(functionName, args) {
  const serializableArgs = filterFunctions(args);
  const { filePrefix, fileSuffixDerivedFrom } = fixtureFileNameGenerator({
    functionName,
    serializableArgs,
  });

  // Ensure fileSuffixDerivedFrom is defined, fallback to serializableArgs
  const derivedFrom = fileSuffixDerivedFrom || serializableArgs;

  // 15-character hash from fileSuffixDerivedFrom for stable filenames
  const key = stringify(derivedFrom);
  let hash = hashCache.get(key);
  if (!hash) {
    hash = crypto.createHash('sha256')
      .update(key)
      .digest('base64url')
      .slice(0, 15);
    hashCache.set(key, hash);
  }

  const fileName = path.join(fixtureSubDirectory, `${filePrefix}-${hash}.json`);

  return {
    absoluteFilePath: path.resolve(fixtureDirectory, fileName),
    fileName,
    filePrefix,
    fileSuffixDerivedFrom: derivedFrom,
  };
}

/**
 * Read existing fixture files list
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function readExistingFixtureFilesList(dir) {
  try {
    const files = await fs.promises.readdir(dir, { recursive: true });
    return files.filter((file) => file.endsWith('.json'));
  } catch (err) {
    return [];
  }
}

/**
 * Load a single fixture file
 * @param {string} fileName - The fixture file name to load
 * @returns {Promise<FixtureData|null>} The loaded fixture data or null if not found
 */
async function loadSingleFixture(fileName) {
  const key = path.join(fixtureSubDirectory, fileName);

  // Return from cache if already loaded
  if (fixtures.has(key)) {
    return fixtures.get(key);
  }

  try {
    const filePath = path.join(fixtureDirectory, fixtureSubDirectory, fileName);
    const content = await fs.promises.readFile(filePath, 'utf8');
    const fixture = JSON.parse(content);
    fixtures.set(key, { ...fixture, fileName });
    return fixtures.get(key);
  } catch (err) {
    // File doesn't exist or invalid JSON
    return null;
  }
}

/**
 * Get cached file list for error debugging (reads directory only once)
 * @returns {Promise<string[]>}
 */
async function getCachedFilesList() {
  if (cachedFilesList === null) {
    const testCaseDir = path.join(fixtureDirectory, fixtureSubDirectory);
    cachedFilesList = await readExistingFixtureFilesList(testCaseDir);
  }
  return cachedFilesList;
}

/**
 * Find similar fixtures for debugging
 * @param {string} functionName
 * @param {any[]} args
 * @param {FixtureFileInfo} fixtureFileInfo
 * @returns {Promise<string>}
 */
async function findSimilarFixtures(functionName, args, fixtureFileInfo) {
  const allFiles = await getCachedFilesList();
  const { fileSuffixDerivedFrom, fileName: expectedFileName } = fixtureFileInfo;

  const targetString = stringify(fileSuffixDerivedFrom);

  let bestMatch = /** @type {{ file: string, fixture: FixtureData, similarity: number, fixtureDerivedFrom: any } | null} */ (
    null
  );
  let bestSimilarity = 0;
  let exactContentMatch = null;

  await Promise.all(allFiles
    .filter((file) => file.startsWith(functionName))
    .map(async (file) => {
      try {
        const fixture = await loadSingleFixture(file);
        if (!fixture) return;

        // Check for exact content match with different filename
        if (stringify(fixture.params) === stringify(filterFunctions(args))) {
          exactContentMatch = file;
          return;
        }

        // Get the derived data for comparison
        const fixtureDerivedFrom = fixture.fileSuffixDerivedFrom || fixture.params;
        const fixtureString = stringify(fixtureDerivedFrom);

        // Early termination: skip if length difference is too large (>50% difference)
        const targetLen = targetString.length;
        const fixtureLen = fixtureString.length;
        if (Math.abs(targetLen - fixtureLen) > Math.max(targetLen, fixtureLen) * 0.5) {
          return;
        }

        // Calculate similarity using string comparison of the derived data
        const diff = diffChars(targetString, fixtureString);
        const similarChars = diff.reduce((acc, part) => (
          acc + (part.added || part.removed ? 0 : part.value.length)
        ), 0);
        const similarity = similarChars / Math.max(targetString.length, fixtureString.length);

        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestMatch = {
            file, fixture, similarity, fixtureDerivedFrom,
          };
        }
      } catch (err) {
        // Ignore invalid files
      }
    }));

  let debugMessage = '';
  if (exactContentMatch) {
    debugMessage += `\n\nFound exact parameter match in different file: ${exactContentMatch}`;
  }

  if (bestMatch && bestSimilarity > 0.5) {
    const diff = createDiff(fileSuffixDerivedFrom, bestMatch.fixtureDerivedFrom);
    const filenameDiff = diffChars(path.basename(expectedFileName), bestMatch.file);
    const filenameDisplay = filenameDiff.map((part) => {
      if (part.added) return `${colors.green}${part.value}${colors.reset}`;
      if (part.removed) return `${colors.red}${part.value}${colors.reset}`;
      return part.value;
    }).join('');

    debugMessage += `\n\nMost similar fixture file: ${bestMatch.file} (${Math.round(bestSimilarity * 100)}% similar)`;
    debugMessage += `\nExpected filename: ${path.basename(expectedFileName)}`;
    debugMessage += `\nActual filename:   ${filenameDisplay}`;
    debugMessage += `\nContent diff:\n${diff}`;
  }

  return debugMessage;
}

/**
 * Save a fixture to file
 * @param {FixtureData} fixture - The fixture data to save
 * @param {string} absoluteFilePath - The absolute path where to save the fixture
 */
async function saveFixture(fixture, absoluteFilePath) {
  await fs.promises.mkdir(path.dirname(absoluteFilePath), { recursive: true });
  await fs.promises.writeFile(absoluteFilePath, JSON.stringify(fixture, null, 2));
}

const getRecorderMock = (functionName) => async function recorder(originalMethod, ...args) {
  const fixtureFileInfo = getFixtureFileInfo(functionName, args);
  const { absoluteFilePath, fileName, fileSuffixDerivedFrom } = fixtureFileInfo;
  const key = fileName;

  // Load fixture if not already loaded
  if (['read', 'append'].includes(FIXTURE)) {
    if (!fixtures.has(key)) {
      const fixture = await loadSingleFixture(path.basename(fileName));
      if (fixture) {
        fixtures.set(key, fixture);
      }
    }

    if (fixtures.has(key)) {
      const fixture = fixtures.get(key);
      readFiles.add(fileName);
      allUsedFiles.add(fileName);

      // Return fixture result
      if (fixture.isError) {
        throw new Error(fixture.error);
      }
      return fixture.result;
    }
  }

  // No fixture found
  if (FIXTURE === 'read') {
    const debugInfo = await findSimilarFixtures(functionName, args, fixtureFileInfo);
    throw new Error(
      `Function ${functionName}: No fixture found for parameters: ${JSON.stringify(args, null, 2)}`
      + `\nExpected file: ${fileName}${debugInfo}`,
    );
  }

  // Call original function and create fixture
  let fixtureData;
  let shouldFixture = true;
  try {
    const result = await originalMethod(...args);
    // Check if result contains functions
    if (containsFunctions(result)) {
      shouldFixture = false;
      throw new Error(`Cannot record fixture for function ${functionName}: return value contains functions/callbacks which are not serializable`);
    }
    // Create new fixture structure with space optimization
    fixtureData = {
      functionName,
      params: filterFunctions(args),
      result,
      isError: false,
      timestamp: new Date().toISOString(),
      /** @type {any[]|undefined} */
      fileSuffixDerivedFrom: undefined,
    };

    // Only include fileSuffixDerivedFrom if it differs from params (space optimization)
    if (stringify(fileSuffixDerivedFrom) !== stringify(filterFunctions(args))) {
      fixtureData.fileSuffixDerivedFrom = fileSuffixDerivedFrom;
    }
    return result;
  } catch (error) {
    if (shouldFixture) {
      fixtureData = {
        functionName,
        params: filterFunctions(args),
        // @ts-ignore
        error: error?.message,
        isError: true,
        timestamp: new Date().toISOString(),
        /** @type {any[]|undefined} */
        fileSuffixDerivedFrom: undefined,
      };

      // Only include fileSuffixDerivedFrom if it differs from params (space optimization)
      if (stringify(fileSuffixDerivedFrom) !== stringify(filterFunctions(args))) {
        fixtureData.fileSuffixDerivedFrom = fileSuffixDerivedFrom;
      }
    }
    throw error;
  } finally {
    if (fixtureData) {
      fixtures.set(key, fixtureData);
      await saveFixture(fixtureData, absoluteFilePath);
      writtenFiles.add(fileName);
      allUsedFiles.add(fileName);
    }
  }
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
export function wrapFunction(functionName, func) {
  const recorderMiddleware = getRecorderMock(functionName);
  // @ts-ignore
  return function wrappedFunction(...args) {
    return recorderMiddleware(func, ...args);
  };
}

export async function wrapForEsmock(importFunction, methods) {
  const match = importFunction.toString().match(/import\s*\(\s*['"`]([^'"`]+)['"`]/);
  if (!match) {
    throw new Error('Could not extract module path from import function');
  }
  const modulePath = match[1]
  const moduleName = modulePath
    .replace(/\.(js|ts|mjs|cjs|mts|cts)/, '')
    .replace(/[^\w-]/g, ' ')
    .trim()
    .replace(/ /g, '-');
  // Actually execute the import to get the real module
  const realModule = await importFunction();
  // Create wrapped versions of the specified methods
  const wrappedMethods = {};
  for (const method of methods) {
    if (typeof realModule[method] === 'function') {
      wrappedMethods[method] = wrapFunction(`${moduleName}-${method}`, realModule[method]);
    }
  }
  return { [modulePath]: wrappedMethods };
}

/**
 * Intercept a method on an object for fixture recording
 * @param {any} object - The object containing the method
 * @param {string} methodName - The name of the method to intercept
 * @param {string} [prefix=''] - The prefix added to the fixture file name (by default no prefix)
 * This is to prevent collisions when intercepting multiple methods with the similar name.
 * @returns {{ undoMock: () => void, destroy: () => void }} - Object with undoMock and destroy methods
 */
export function interceptMethod(object, methodName, prefix = '') {
  // Prevent double intercept
  let interceptor = object[methodName].__vcr_interceptor__;
  if (!interceptor) {
    interceptor = intercept(object, methodName);
    interceptedMethods.add(interceptor);
    object[methodName].__vcr_interceptor__ = interceptor;
  }

  interceptor.mock(getRecorderMock(prefix ? `${prefix}-${methodName}` : methodName));

  return {
    undoMock: () => {
      interceptor.undoMock();
      interceptedMethods.delete(interceptor);
    },
    /**
     * Note: Destroy cannot undo any closures to the previously mocked function.
     * So I recommend using undoMock() instead.
     */
    destroy: () => {
      interceptor.destroy();
      interceptedMethods.delete(interceptor);
    },
  };
}

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
export function interceptAllMethods(object, prefix = '') {
  // @ts-ignore
  return Object.fromEntries(
    Object
      .keys(object)
      .filter((key) => typeof object[key] === 'function')
      .map(
        (key) => [key, interceptMethod(object, key, prefix)],
      ),
  );
}

/**
 * Start a test case
 * @param {string} directoryName
 */
export function startTestCase(directoryName) {
  if (fixtureSubDirectory) {
    throw new Error(`Cannot start test case '${directoryName}' as test case '${fixtureSubDirectory}' is already running.`);
  }
  fixtureSubDirectory = directoryName;
  fixtures.clear();
  readFiles.clear();
  writtenFiles.clear();
  cachedFilesList = null; // Clear cache for new test case
}

/**
 * End a test case
 */
export function endTestCase() {
  // Undo all intercepted methods
  interceptedMethods.forEach((interceptor) => {
    interceptor.undoMock();
  });
  interceptedMethods.clear();
  fixtureFileNameGenerator = defaultFixtureFileNameGenerator;

  fixtureSubDirectory = '';
  fixtures.clear();
  readFiles.clear();
  writtenFiles.clear();
  cachedFilesList = null; // Clear cache
}

/**
 * Start fixture recording
 * @param {object} opts
 * @param {string} opts.fixtureDirectory
 */
export function configure({ fixtureDirectory: _fixtureDirectory }) {
  if (!_fixtureDirectory) {
    throw new Error('Please specify full path to a directory for storing/reading fixtures');
  }
  fixtureDirectory = _fixtureDirectory;
}

/**
 * Attach a custom fixture filename generator
 * @param {FilenameGenerator} func - The custom filename generator function
 */
export function attachFixtureFilenameGenerator(func) {
  fixtureFileNameGenerator = func;
}

/**
 * Reset fixture filename generator to default
 */
export function resetFixtureFilenameGenerator() {
  fixtureFileNameGenerator = defaultFixtureFileNameGenerator;
}

/**
 * Generate unused fixtures log
 */
async function generateUnusedFixturesLog() {
  if (!fixtureDirectory) return;

  try {
    const existingFiles = await readExistingFixtureFilesList(fixtureDirectory);
    const unusedFiles = existingFiles.filter((file) => (
      !allUsedFiles.has(file) && file !== unusedFixturesLogFile
    ));

    const unusedLogPath = path.resolve(fixtureDirectory, unusedFixturesLogFile);

    if (unusedFiles.length > 0) {
      await fs.promises.writeFile(unusedLogPath, unusedFiles.join('\n'), 'utf8');
    } else {
      // Try to remove unused fixtures log if no unused files
      try {
        await fs.promises.unlink(unusedLogPath);
      } catch (err) {
        // Ignore if file doesn't exist
      }
    }
  } catch (err) {
    // Ignore errors in generating unused fixtures log
  }
}

// Set up beforeExit handler to generate unused fixtures log
// @ts-ignore
process.on('beforeExit', async () => {
  if (FIXTURE === 'read' && !beforeExitEventSeen && fixtureDirectory !== null) {
    beforeExitEventSeen = true;
    await generateUnusedFixturesLog();
  }
});
