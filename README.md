# Node.js Test Playback

Record and replay methods (functions) for testing purposes on Node.js. `npm add @firstack/playback`.

## Why?

Let's say you are testing a function that makes external calls (like database queries, API calls, etc.). In a unit test you would want predictable inputs and outputs for any external dependencies.

To have predictable inputs and outputs there are 3 popular approaches:

1. Manual mocking: Mock / Stub the methods with a library like `sinon.js`
2. Mock service: Set up with fake data
3. Integration tests: That make requests to real systems

Manual mocking is tedious. Some opt to have external mock service, which is a moving piece in your CI that needs to be prefilled with data that works across git branches and changes. And some use MSW, which removes need to have separate mock service deployment, yet, it doesn't remove my work of mocking 5 to 20 requests per test. And the third option in the list, integration tests, are great, but real network requests are slow.

Here is fourth hybrid approach between unit test and integration test

1. Record-and-replay testing: Automatically create fixtures of function inputs and outputs the first time you run your test, and then replay fixture responses on future runs. Review and commit fixtures to source control and run these tests on CI. Refresh fixtures whenever needed (i.e. when you change code later).

Database clients or API clients are good candidates for record-and-replay testing. Additionally with this approach, one wouldn't want any real external calls to be made during testing; and if they do happen, then the test should fail (check MSW interceptors or an HTTP recording layer to achieve that).

This isn't a novel new idea. Ruby ecosystem has had similar tools in the past.

## Quick Example

```js
import test from "tape";
import {
  configure,
  startTestCase,
  endTestCase,
  interceptMethod,
} from "@firstack/playback";
import { resolve } from "node:path";

// Setup - run this only once per process
configure({ fixtureDirectory: resolve(import.meta.dirname, "function-fixtures") });

const xkcdClient = {
  async getLatest() {
    const res = await fetch("https://xkcd.com/info.0.json");
    return res.json();
  }
};

test("Latest XKCD comic", async (t) => {
  startTestCase('test-case-1');

  // Record `getLatest` in FIXTURE=update mode
  // Replay fixtures when FIXTURE env is unspecified
  const interceptor = interceptMethod(xkcdClient, 'getLatest');

  try {
    const comic = await xkcdClient.getLatest();
    t.equal(comic.title, "Iceberg Efficiency", "must be equal");
  } finally {
    // Calling endTestCase() is mandatory, even when there
    // is a failure in the try block
    endTestCase();
    // endTestCase() calls interceptor.undoMock() as well
  }
});
```

To create fixtures the first time run:

```sh
FIXTURE=update node tests/esmock.test.js
```

You will see a file named `getLatest-1a2b3c4d5e6f7g8.json` created in the `function-fixtures` directory. Commit this directory to source control.

Then onwards running: `node tests/esmock.test.js` or `FIXTURE=read node tests/esmock.test.js` will ensure method calls are all read from fixture files.

The unit tests of this library uses this library itself for creating fixtures. So you can check tests/ directory.

## Requirements and Limitations

**Important limitations for fixture recording:**

1. **JSON Serialization Required**: The function being captured in fixtures *must* only accept JSON-serializable arguments and return JSON-serializable data. Function/callback arguments will be ignored during serialization. If your function doesn't meet this requirement, it cannot use fixture recording.
2. **Method Interception Only**: The function *must* be a method of an object. You cannot intercept standalone functions in ESM code. Instead of `export const func = function() { ... }`, use `export const obj = { func() { ... } }` to make `func` interceptable.

## Wisdom

1. You shouldn't use fixture based testing if a dependency (function) keeps pulling in unstable data. i.e. lets say you have a function named `getShopInfo()` which in real world should be stable not-frequently updated data, but your sandbox environment is changing is so much or has garbage data, that every time you try to update your fixtures it breaks your tests. For this case, it makes more sense for you to manually mock that data, purely for the stability that it provides.

## API Reference

### `configure({ fixtureDirectory })`

Configures fixture recording with a root directory to store fixtures. Specific tests will be placed in a sub-directory under this root directory.

### `interceptMethod(object, methodName)`

Intercept a specific method of an object to record or replay it's input / output. Returns an object with:

- `undoMock()`: Reverts last mock() callback.
- `destroy()`: Stops intercepting the method completely

### `interceptAllMethods(object)`

Run interceptMethod() on all methods of an object. Returns an object with method names as keys and interceptors as values.

### `startTestCase(directoryName)`

Start a new test case to isolate fixtures into a sub-directory of `fixtureDirectory`.

### `endTestCase()`

End the current test case and clean up all interceptors.

## Environment Variables

- `FIXTURE=update`: Create new fixtures or update existing ones
- `FIXTURE=append`: Add new fixtures without touching existing ones
- `FIXTURE=read`: Use existing fixtures (default)
- `FIXTURE=ignore`: Neither read nor write fixtures, execute real calls

## Advanced Usage

### Custom Fixture File Names

You can customize how fixture files are named. This is useful if you have noisy data that goes into the function, like a "current timestamp". The issue with passing a new timestamp every time to a function is that replay logic will treat it as new data and fail the test case when it can't find an existing fixture for that data. 

```js
import {
  attachFixtureFilenameGenerator,
  resetFixtureFilenameGenerator
} from "@firstack/playback";

function myFixtureFilenameGenerator({ functionName, serializableArgs }) {
  // Create custom file naming logic
  const args = serializableArgs;
  if (functionName === 'writeProductInfoToDatabase') {
    args[0] = {
      ...args[0],
      // remove noisy data being factored into fixture file naming
      createdDate: undefined,
      updatedDate: undefined,
    };
  }
  const fileSuffixDerivedFrom = [functionName, ...args];
  return { filePrefix: functionName, fileSuffixDerivedFrom };
}

attachFixtureFilenameGenerator(myFixtureFilenameGenerator);

// Reset to default
resetFixtureFilenameGenerator();
```

### Testing Different Scenarios

For testing the same function with different return values:

```js
import { accountService } from './services.js';
import { interceptMethod } from "@firstack/playback";
import manualIntercept from "@firstack/playback/intercept";

// This is the built-in fixture recording interception
interceptMethod(accountService, 'getAccount');

test('test case', () => {
  // For this specific use-case we want to change the returned fixture data
  const higherOrderInterceptor = manualIntercept(accountService, 'getAccount')
  higherOrderInterceptor.mock(async (originalMethod, ...args) => {
    const result = await originalMethod(...args); // uses existing fixture
    return {
      ...result,
      accountType: 'premium'
    };
  });
  
  try {
    // .. write test related code here
  } finally {
    higherOrderInterceptor.destroy();
    endTestCase();
  }
});
```

### Handling Non-Serializable Data

If your function returns non-serializable data (like functions or class instances), you have two options:

1. **Transform the data**: Modify the function to return serializable data
2. **Don't fixture**: Use traditional mocking for these cases

Example of transforming data:

```js
const dbClient = {
  async query(sql, params) {
    const result = await realDb.query(sql, params);
    // Transform non-serializable data
    return {
      rows: result.rows.map(row => ({...row})),
      rowCount: result.rowCount
    };
  }
};
```

## File Structure

Fixtures are stored as JSON files with the following structure:

```json
{
  "functionName": "getLatest",
  "params": [],
  "result": { "title": "Iceberg Efficiency", ... },
  "isError": false,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Concurrency

WARNING: This module isn't concurrent or thread safe. Make sure that:

1. Within one worker only one test is being executed at a time
2. Parallel tests don't update the same fixture file at the same time (i.e., while you run with FIXTURE=update)

## Unused Fixtures

After running your complete test suite, check `<fixtures directory>/unused-fixtures.log` to see which fixture files haven't been used. You can delete unused fixture files. You can run `xargs rm < unused-fixtures.log` to delete all unused fixture files.

## Development

The tests of this library use this library itself. Check the `tests/` directory and try the tests:

```sh
npm ci
npm test
```

