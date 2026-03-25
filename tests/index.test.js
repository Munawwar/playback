import test from "tape";
import { configure, startTestCase, endTestCase, interceptMethod } from "../index.js";
import { resolve } from "node:path";

// Setup - run this only once per process
configure({ fixtureDirectory: resolve(import.meta.dirname, "..", "function-fixtures") });

const xkcdClient = {
  async getLatest() {
    const res = await fetch("https://xkcd.com/info.0.json");
    return res.json();
  }
};

test("Latest XKCD comic", async (t) => {
  // Start test case (optional - use if not using isolated test runner)
  startTestCase('test-case-1');

  // Intercept the method
  const interceptor = interceptMethod(xkcdClient, 'getLatest');

  try {
    const comic = await xkcdClient.getLatest();
    t.equal(comic.title, "Dimensional Lumber Tape Measure", "must be equal");
  } finally {
    // Calling endTestCase() is mandatory, even when there
    // is a failure in the try block
    endTestCase();
  }
});
