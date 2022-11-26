const {describe, it} = require('mocha');
const assert = require('assert');
const ljos = require('../ljos');

const HELPER_COUNT = 2;

describe('helpers', () => {
  it('does not expose additional helpers beyond blessed list', () => {
    assert.strictEqual(Object.keys(ljos).length, HELPER_COUNT);
  });
  describe('Parser', () => {
    it('exposes functional argument parser', () => {
      const argv = ljos.Parser('--foo --bar=99');
      assert.strictEqual(argv.bar, 99);
    });
  });
  describe('hideBin', () => {
    it('exposes helper for hiding node bin', () => {
      const argv = ljos.hideBin(['node', 'foo.js', '--hello']);
      assert.deepStrictEqual(argv, ['--hello']);
    });
  });
});
