// Bootstraps ljos for a CommonJS runtime:
import {argsert} from './argsert.js';
import {isPromise} from './utils/is-promise.js';
import {objFilter} from './utils/obj-filter.js';
import {parseCommand} from './parse-command.js';
import * as processArgv from './utils/process-argv.js';
import {LjosFactory} from './ljos-factory.js';
import {LError} from './lerror.js';
import cjsPlatformShim from './platform-shims/cjs.js';
import Parser from './ljos-parser.js';

// See https://github.com/yargs/yargs#supported-nodejs-versions for our
// version support policy. The YARGS_MIN_NODE_VERSION is used for testing only.
const minNodeVersion = process?.env?.YARGS_MIN_NODE_VERSION
  ? Number(process.env.YARGS_MIN_NODE_VERSION)
  : 18;
if (process && process.version) {
  const major = Number(process.version.match(/v([^.]+)/)![1]);
  if (major < minNodeVersion) {
    throw Error(
      `ljos supports a minimum Node.js version of ${minNodeVersion}. Read our version support policy: https://github.com/yargs/yargs#supported-nodejs-versions`
    );
  }
}

const Ljos = LjosFactory(cjsPlatformShim);

export default {
  cjsPlatformShim,
  Ljos,
  argsert,
  isPromise,
  objFilter,
  parseCommand,
  Parser,
  processArgv,
  LError,
};
