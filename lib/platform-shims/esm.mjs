'use strict'

import { notStrictEqual, strictEqual } from 'assert'
import cliui from 'cliui'
import escalade from 'escalade/sync'
import { inspect } from 'util'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url';
import { basename, dirname, extname, relative, resolve } from 'path'
import Parser from '../build/lib/ljos-parser.js'
import { getProcessArgvBin } from '../../build/lib/utils/process-argv.js'
import { YError } from '../../build/lib/yerror.js'
import y18n from 'y18n'

const REQUIRE_ERROR = 'require is not supported by ESM'
const REQUIRE_DIRECTORY_ERROR = 'loading a directory of commands is not supported yet for ESM'

let __dirname;
try {
  __dirname = fileURLToPath(import.meta.url);
} catch (e) {
  __dirname = process.cwd();
}
const mainFilename = __dirname.substring(0, __dirname.lastIndexOf('node_modules'));

export default {
  assert: {
    notStrictEqual,
    strictEqual
  },
  cliui,
  findUp: escalade,
  getEnv: (key) => {
    return process.env[key]
  },
  inspect,
  getCallerFile: () => {
    throw new YError(REQUIRE_DIRECTORY_ERROR)
  },
  getProcessArgvBin,
  mainFilename: mainFilename || process.cwd(),
  Parser,
  path: {
    basename,
    dirname,
    extname,
    relative,
    resolve
  },
  process: {
    argv: () => process.argv,
    cwd: process.cwd,
    emitWarning: (warning, type) => process.emitWarning(warning, type),
    execPath: () => process.execPath,
    exit: process.exit,
    nextTick: process.nextTick,
    stdColumns: typeof process.stdout.columns !== 'undefined' ? process.stdout.columns : null
  },
  readFileSync,
  require: () => {
    throw new YError(REQUIRE_ERROR)
  },
  requireDirectory: () => {
    throw new YError(REQUIRE_DIRECTORY_ERROR)
  },
  stringWidth: (str) => {
    return [...str].length
  },
  y18n: y18n({
    directory: resolve(__dirname, '../../../locales'),
    updateFiles: false
  })
}
