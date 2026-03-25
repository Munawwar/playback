import esmock from 'esmock';
import test from 'tape';
import { resolve } from 'node:path';
import { configure, startTestCase, endTestCase, wrapForEsmock } from '../index.js';

configure({ fixtureDirectory: resolve(import.meta.dirname, "..", "function-fixtures") });

test('testModuleA', async (t) => {
  try {
    startTestCase('test-esmock');
  
    // const { default: testModuleB } = await import('./test-module-b.js');
    // const { default: testModuleA } = await esmock('./test-module-a.js', {}, {
    //   './test-module-b.js': {
    //     default: wrapFunction('test-module-b-default', testModuleB),
    //   },
    // });
    const { default: testModuleA } = await esmock('./test-module-a.js', {},  {
      ...(await wrapForEsmock(() => import('./test-module-b.js'), ['default'])),
    });
    
    const result = await testModuleA();
    console.log('Result:', result);
    console.log('Is mocked:', result === '2025-09-07T09:18:04.590Z');
    
    t.equal(result, '2025-09-07T09:18:04.590Z', 'testModuleA should return mocked value');
  } finally {
    endTestCase();
    t.end();
  }
});
