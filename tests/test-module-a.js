import testModuleB from './test-module-b.js';

export default async function testModuleA() {
  return testModuleB();
}