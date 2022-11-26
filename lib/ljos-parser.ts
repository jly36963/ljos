/**
 * @license
 * Copyright (c) 2016, Contributors
 * SPDX-License-Identifier: ISC
 */

import {format, parseArgs} from 'node:util';
import {normalize} from 'node:path';
import {
  ArgsInput,
  Arguments,
  ArrayFlagsKey,
  ArrayOption,
  BooleanFlag,
  CoerceCallback,
  CoercionsFlag,
  ConfigsFlag,
  DetailedArguments,
  Flag,
  Flags,
  FlagsKey,
  NumberFlag,
  Options,
  OptionsDefault,
  Parser,
  PlatformShim,
  StringFlag,
} from './typings/ljos-parser-types.js';
import type {Dictionary, ValueOf} from './typings/common-types.js';
import {camelCase, decamelize, looksLikeNumber} from './utils/strings.js';

// ---
// Configuration
// ---

// Still need to be user-provided?
const parsePositionalNumbers = true;
const populateDoubleDash = true;

// These were originally user-provided configuration options
const negationPrefix = 'no-'; // Change?
const booleanNegation = true; // TODO: re-implement this?
const shortOptionGroups = true; // parseArgs does this as true
const unknownOptionsAsArgs = false;
const camelCaseExpansion = true;
const greedyArrays = false; // Not yargs default

const parseNumbers = true;
const combineArrays = false;
const duplicateArgumentsArray = true;
const flattenDuplicateArrays = true;
const setPlaceholderKey = false;
const nargsEatsOptions = false;
const dotNotation = true; // Change?
const haltAtNonOption = false; // TODO: determine how this is impacted

const stripDashed = false;
const stripAliased = false;

// // TODO: make this the default (will break reads from argv for kebab-case keys)
// const stripDashed = true; // Not yargs default
// const stripAliased = true; // Not yargs default

// ---
// Constants
// ---

const NEGATIVE_REGEX = /^-([0-9]+(\.[0-9]+)?|\.[0-9]+)$/;
const NEGATED_BOOLEAN_REGEX = new RegExp('^--' + negationPrefix + '(.+)');

const notFlagsOption = populateDoubleDash;
const notFlagsArgv: string = notFlagsOption ? '--' : '_';

// ---
// Parser
// ---

let shim: PlatformShim;
export class LjosParser {
  /** Platform specific functions (DI) */
  readonly shim: PlatformShim;
  /** TODO: idk */
  flags: Flags; // readonly flags: Flags;
  /** Error that is encountered during and returned by parse */
  error: Error | null;
  /** i18n formatter */
  __: Function; // readonly __: Function;
  /** Option values, details, callbacks, etc */
  opts: Partial<Options>;
  /** Default values for specified keys */
  defaults: OptionsDefault;
  /** argv object with partially/completely parsed values */
  argv: Arguments;
  /** Argv returned by parse */
  argvReturn: {[argName: string]: any};
  /** Map of keys to their aliases */
  aliases: Dictionary<string[]>;
  /** Aliases generated during parsing */
  newAliases: Dictionary<boolean>;
  /** Map of keys to a boolean representing if a default is set */
  defaulted: Dictionary<boolean>;
  /** Configuration objects to apply to argv object */
  configObjects: Dictionary<any>[]; // readonly configObjects: Dictionary<any>[];
  /** Args after option terminator ('--') */
  notFlags: string[];

  constructor(_shim: PlatformShim) {
    this.shim = _shim;
    this.flags = newFlags();
    this.error = null;
    this.__ = this.shim.format;
    this.opts = newOpts();
    this.defaults = nullObj();
    this.argv = Object.assign(nullObj(), {_: []});
    this.argvReturn = nullObj();
    this.aliases = nullObj();
    this.newAliases = nullObj();
    this.defaulted = nullObj();
    this.configObjects = [];
    this.notFlags = [];
  }

  /** Reset parser state */
  reset() {
    this.flags = newFlags();
    this.error = null;
    this.__ = this.shim.format;
    this.opts = newOpts();
    this.defaults = nullObj();
    // this.defaults = Object.assign(nullObj(), this.opts.default);
    this.argv = Object.assign(nullObj(), {_: []});
    this.argvReturn = nullObj();
    this.aliases = nullObj();
    // this.aliases = combineAliases(Object.assign(nullObj, this.opts.aliases));
    this.newAliases = nullObj();
    this.defaulted = nullObj();
    this.configObjects = [];
    // this.configObjects = this.opts.configObjects || [];
    this.notFlags = [];
  }

  /** TODO */
  #setFlags(): void {
    ([] as ArrayOption[])
      .concat(this.opts.array || [])
      .filter(Boolean)
      .forEach(opt => {
        const key = typeof opt === 'object' ? opt.key : opt;

        // Assign to flags[bools|strings|numbers]
        const assignment: ArrayFlagsKey | undefined = Object.keys(opt)
          .map(key => {
            const arrayFlagKeys: Record<string, ArrayFlagsKey> = {
              boolean: 'bools',
              string: 'strings',
              number: 'numbers',
            };
            return arrayFlagKeys[key];
          })
          .filter(Boolean)
          .pop();

        // Assign key to be coerced
        if (assignment) {
          this.flags[assignment][key] = true;
        }

        this.flags.arrays[key] = true;
        this.flags.keys.push(key);
      });
    ([] as string[])
      .concat(this.opts.boolean || [])
      .filter(Boolean)
      .forEach(key => {
        this.flags.bools[key] = true;
        this.flags.keys.push(key);
      });
    ([] as string[])
      .concat(this.opts.string || [])
      .filter(Boolean)
      .forEach(key => {
        this.flags.strings[key] = true;
        this.flags.keys.push(key);
      });
    ([] as string[])
      .concat(this.opts.number || [])
      .filter(Boolean)
      .forEach(key => {
        this.flags.numbers[key] = true;
        this.flags.keys.push(key);
      });
    ([] as string[])
      .concat(this.opts.normalize || [])
      .filter(Boolean)
      .forEach(key => {
        this.flags.normalize[key] = true;
        this.flags.keys.push(key);
      });

    if (typeof this.opts.coerce === 'object') {
      Object.entries(this.opts.coerce).forEach(([key, value]) => {
        if (typeof value === 'function') {
          this.flags.coercions[key] = value;
          this.flags.keys.push(key);
        }
      });
    }
  }

  /** Set value on argv for key (and aliases) */
  #setArg(key: string, val: any): void {
    // Add camel-case alias of key (if kebab-case)
    if (/-/.test(key) && camelCaseExpansion) {
      const alias = key
        .split('.')
        .map(prop => camelCase(prop))
        .join('.');
      this.#addNewAlias(key, alias);
    }

    const value = this.#processValue(key, val);
    const splitKey = key.split('.');
    this.#setKey(this.argv, splitKey, value);

    // Handle populating aliases of the full key
    if (this.flags.aliases[key]) {
      this.flags.aliases[key].forEach(x => {
        const keyProperties = x.split('.');
        this.#setKey(this.argv, keyProperties, value);
      });
    }

    // Handle populating aliases of the first element of the dot-notation key
    if (splitKey.length > 1 && dotNotation) {
      (this.flags.aliases[splitKey[0]] || []).forEach(x => {
        let keyProperties = x.split('.');

        // Expand alias with nested objects in key
        const a = ([] as string[]).concat(splitKey);
        a.shift(); // nuke the old key.
        keyProperties = keyProperties.concat(a);

        // Populate alias only if is not already an alias of the full key
        // (Already populated above)
        if (
          !(this.flags.aliases[key] || []).includes(keyProperties.join('.'))
        ) {
          this.#setKey(this.argv, keyProperties, value);
        }
      });
    }

    // Set normalize getter/setter when key is in 'normalize' but isn't an array
    if (
      this.#checkAllAliases(key, this.flags.normalize) &&
      !this.#checkAllAliases(key, this.flags.arrays)
    ) {
      const keys = [key].concat(this.flags.aliases[key] || []);
      keys.forEach(key => {
        Object.defineProperty(this.argvReturn, key, {
          enumerable: true,
          get() {
            return val;
          },
          set(value) {
            val = typeof value === 'string' ? shim.normalize(value) : value;
          },
        });
      });
    }
  }

  /** Set relationship between key/alias. If key doesn't already have alias, set newAlias to true */
  #addNewAlias(key: string, alias: string): void {
    if (!(this.flags.aliases[key] && this.flags.aliases[key].length)) {
      this.flags.aliases[key] = [alias];
      this.newAliases[alias] = true;
    }
    if (!(this.flags.aliases[alias] && this.flags.aliases[alias].length)) {
      this.#addNewAlias(alias, key);
    }
  }

  /** Post-process parsed value */
  #processValue(key: string, val: any) {
    // Strings may be quoted, clean this up as we assign values.
    if (
      typeof val === 'string' &&
      (val[0] === "'" || val[0] === '"') &&
      val[val.length - 1] === val[0]
    ) {
      val = val.substring(1, val.length - 1);
    }

    // Handle parsing boolean arguments --foo=true --bar false.
    if (
      this.#checkAllAliases(key, this.flags.bools) ||
      this.#checkAllAliases(key, this.flags.counts)
    ) {
      if (typeof val === 'string') val = val === 'true';
    }

    // Maybe coerce number type (convert elements if array)
    let value = Array.isArray(val)
      ? val.map(v => this.#maybeCoerceNumber(key, v))
      : this.#maybeCoerceNumber(key, val);

    // Increment a count given as arg (either no value or value parsed as boolean)
    if (
      this.#checkAllAliases(key, this.flags.counts) &&
      (isUndefined(value) || typeof value === 'boolean')
    ) {
      value = increment();
    }

    // Set normalized value when key is in 'normalize' and in 'arrays'
    if (
      this.#checkAllAliases(key, this.flags.normalize) &&
      this.#checkAllAliases(key, this.flags.arrays)
    ) {
      value = Array.isArray(val)
        ? val.map(val => shim.normalize(val))
        : shim.normalize(val);
    }
    return value;
  }

  /** Convert value to number type if sensible */
  #maybeCoerceNumber(key: string, value: string | number | null | undefined) {
    if (!parsePositionalNumbers && key === '_') {
      return value;
    }
    if (
      !this.#checkAllAliases(key, this.flags.strings) &&
      !this.#checkAllAliases(key, this.flags.bools) &&
      !Array.isArray(value)
    ) {
      const shouldCoerceNumber =
        looksLikeNumber(value) &&
        parseNumbers &&
        Number.isSafeInteger(Math.floor(parseFloat(`${value}`)));
      if (
        shouldCoerceNumber ||
        (!isUndefined(value) && this.#checkAllAliases(key, this.flags.numbers))
      ) {
        value = Number(value);
      }
    }
    return value;
  }

  /** Set args from config object (recursively for nested objects) */
  #setConfigObject(config: {[key: string]: any}, prev?: string): void {
    Object.keys(config).forEach(key => {
      const value = config[key];
      const fullKey = prev ? prev + '.' + key : key;

      // if the value is an inner object and we have dot-notation
      // enabled, treat inner objects in config the same as
      // heavily nested dot notations (foo.bar.apple).
      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        dotNotation
      ) {
        // if the value is an object but not an array, check nested object
        this.#setConfigObject(value, fullKey);
      } else {
        // setting arguments via CLI takes precedence over
        // values within the config file.
        if (
          !this.#hasKey(this.argv, fullKey.split('.')) ||
          (this.#checkAllAliases(fullKey, this.flags.arrays) && combineArrays)
        ) {
          this.#setArg(fullKey, value);
        }
      }
    });
  }

  /** Set all config objects passed in opts */
  #setConfigObjects(): void {
    if (typeof this.configObjects !== 'undefined') {
      this.configObjects.forEach(configObject => {
        this.#setConfigObject(configObject);
      });
    }
  }

  /** Apply coercion middleware functions */
  #applyCoercions(argv: Arguments): void {
    let coerce: false | CoerceCallback;
    const applied: Set<string> = new Set();
    Object.keys(argv).forEach(key => {
      if (!applied.has(key)) {
        // If we haven't already coerced this option via one of its aliases
        coerce = this.#checkAllAliases(key, this.flags.coercions);
        if (typeof coerce === 'function') {
          try {
            const value = this.#maybeCoerceNumber(key, coerce(argv[key]));
            ([] as string[])
              .concat(this.flags.aliases[key] || [], key)
              .forEach(ali => {
                applied.add(ali);
                argv[ali] = value;
              });
          } catch (ex: any) {
            this.error = ex;
          }
        }
      }
    });
  }

  /** TODO */
  #setPlaceholderKeys(argv: Arguments): Arguments {
    this.flags.keys.forEach(key => {
      // don't set placeholder keys for dot notation options 'foo.bar'.
      if (key.includes('.')) return;
      if (typeof argv[key] === 'undefined') argv[key] = undefined;
    });
    return argv;
  }

  /** Apply defaults and aliases to keys */
  #applyDefaultsAndAliases(
    obj: {[key: string]: any},
    aliases: {[key: string]: string[]},
    defaults: {[key: string]: any},
    canLog = false
  ): void {
    Object.keys(defaults).forEach(key => {
      if (!this.#hasKey(obj, key.split('.'))) {
        this.#setKey(obj, key.split('.'), defaults[key]);
        if (canLog) this.defaulted[key] = true;
        (aliases[key] || []).forEach(x => {
          if (this.#hasKey(obj, x.split('.'))) return;
          this.#setKey(obj, x.split('.'), defaults[key]);
        });
      }
    });
  }

  /** Check if key (or path of keys) exist on object */
  #hasKey(obj: {[key: string]: any}, keys: string[]): boolean {
    let o = obj;

    if (!dotNotation) keys = [keys.join('.')];

    keys.slice(0, -1).forEach(key => {
      o = o[key] || {};
    });

    const key = keys[keys.length - 1];

    return typeof o !== 'object' ? false : key in o;
  }

  /** Given argv, a path of keys, and a value -- set the value on argv at the given path */
  #setKey(obj: {[key: string]: any}, keys: string[], value: any): void {
    let o = obj;

    if (!dotNotation) keys = [keys.join('.')];

    keys.slice(0, -1).forEach(key => {
      // TODO: in the next major version of ljos, switch to
      // Object.create(null) for dot notation:
      key = sanitizeKey(key);

      if (typeof o === 'object' && o[key] === undefined) {
        o[key] = {};
      }

      if (typeof o[key] !== 'object' || Array.isArray(o[key])) {
        // Ensure that o[key] is an array, and that the last item is an empty object.
        if (Array.isArray(o[key])) {
          o[key].push({});
        } else {
          o[key] = [o[key], {}];
        }

        // We want to update the empty object at the end of the o[key] array, so set o to that object
        o = o[key][o[key].length - 1];
      } else {
        o = o[key];
      }
    });

    // TODO: in the next major version of ljos, switch to
    // nullObj() for dot notation:
    const key = sanitizeKey(keys[keys.length - 1]);

    const isTypeArray = this.#checkAllAliases(
      keys.join('.'),
      this.flags.arrays
    );
    const isValueArray = Array.isArray(value);
    let duplicate = duplicateArgumentsArray;

    // Nargs has higher priority than duplicate
    if (!duplicate && this.#checkAllAliases(key, this.flags.nargs)) {
      duplicate = true;
      if (
        (!isUndefined(o[key]) && this.flags.nargs[key] === 1) ||
        (Array.isArray(o[key]) && o[key].length === this.flags.nargs[key])
      ) {
        o[key] = undefined;
      }
    }

    if (value === increment()) {
      o[key] = increment(o[key]);
    } else if (Array.isArray(o[key])) {
      if (duplicate && isTypeArray && isValueArray) {
        o[key] = flattenDuplicateArrays
          ? o[key].concat(value)
          : (Array.isArray(o[key][0]) ? o[key] : [o[key]]).concat([value]);
      } else if (!duplicate && Boolean(isTypeArray) === Boolean(isValueArray)) {
        o[key] = value;
      } else {
        o[key] = o[key].concat([value]);
      }
    } else if (o[key] === undefined && isTypeArray) {
      o[key] = isValueArray ? value : [value];
    } else if (
      duplicate &&
      !(
        o[key] === undefined ||
        this.#checkAllAliases(key, this.flags.counts) ||
        this.#checkAllAliases(key, this.flags.bools)
      )
    ) {
      o[key] = [o[key], value];
    } else {
      o[key] = value;
    }
  }

  // Extend the aliases list with inferred aliases.
  #extendAliases(...args: Array<{[key: string]: any} | undefined>) {
    args.forEach(obj => {
      Object.keys(obj || {}).forEach(key => {
        // short-circuit if we've already added a key
        // to the aliases array, for example it might
        // exist in both 'opts.default' and 'opts.key'.
        if (this.flags.aliases[key]) return;

        this.flags.aliases[key] = ([] as string[]).concat(
          this.aliases[key] || []
        );
        // For "--option-name", also set argv.optionName
        this.flags.aliases[key].concat(key).forEach(x => {
          if (/-/.test(x) && camelCaseExpansion) {
            const c = camelCase(x);
            if (c !== key && this.flags.aliases[key].indexOf(c) === -1) {
              this.flags.aliases[key].push(c);
              this.newAliases[c] = true;
            }
          }
        });
        // For "--optionName", also set argv['option-name']
        this.flags.aliases[key].concat(key).forEach(x => {
          if (x.length > 1 && /[A-Z]/.test(x) && camelCaseExpansion) {
            const c = decamelize(x, '-');
            if (c !== key && !this.flags.aliases[key].includes(c)) {
              this.flags.aliases[key].push(c);
              this.newAliases[c] = true;
            }
          }
        });
        this.flags.aliases[key].forEach(x => {
          this.flags.aliases[x] = [key].concat(
            this.flags.aliases[key].filter(y => {
              return x !== y;
            })
          );
        });
      });
    });
  }

  /** Return the 1st set flag for any of a key's aliases (or false if no flag set) */
  #checkAllAliases(key: string, flag: StringFlag): ValueOf<StringFlag> | false;

  #checkAllAliases(
    key: string,
    flag: BooleanFlag
  ): ValueOf<BooleanFlag> | false;

  #checkAllAliases(key: string, flag: NumberFlag): ValueOf<NumberFlag> | false;

  #checkAllAliases(
    key: string,
    flag: ConfigsFlag
  ): ValueOf<ConfigsFlag> | false;

  #checkAllAliases(
    key: string,
    flag: CoercionsFlag
  ): ValueOf<CoercionsFlag> | false;

  #checkAllAliases(key: string, flag: Flag): ValueOf<Flag> | false {
    const toCheck = ([] as string[]).concat(this.flags.aliases[key] || [], key);
    const keys = Object.keys(flag);
    const setAlias = toCheck.find(key => keys.includes(key));
    return setAlias ? flag[setAlias] : false;
  }

  // /** TODO */
  // #hasAnyFlag(key: string): boolean {
  //   const flagsKeys = Object.keys(this.flags) as FlagsKey[];
  //   const toCheck = ([] as Array<{[key: string]: any} | string[]>).concat(
  //     flagsKeys.map(k => this.flags[k])
  //   );
  //   return toCheck.some(flag => {
  //     return Array.isArray(flag) ? flag.includes(key) : flag[key];
  //   });
  // }

  // /** TODO */
  // #hasFlagsMatching(arg: string, ...patterns: RegExp[]): boolean {
  //   const toCheck = ([] as RegExp[]).concat(...patterns);
  //   return toCheck.some(pattern => {
  //     const match = arg.match(pattern);
  //     return match && this.#hasAnyFlag(match[1]);
  //   });
  // }

  // /** Based on a simplified version of the short flag group parsing logic */
  // #hasAllShortFlags(arg: string): boolean {
  //   // if this is a negative number, or doesn't start with a single hyphen, it's not a short flag group
  //   if (arg.match(NEGATIVE_REGEX) || !arg.match(/^-[^-]+/)) return false;
  //   let hasAllFlags = true;
  //   let next: string;
  //   const letters = arg.slice(1).split('');
  //   for (let j = 0; j < letters.length; j++) {
  //     next = arg.slice(j + 2);

  //     if (!this.#hasAnyFlag(letters[j])) {
  //       hasAllFlags = false;
  //       break;
  //     }

  //     if (
  //       (letters[j + 1] && letters[j + 1] === '=') ||
  //       next === '-' ||
  //       (/[A-Za-z]/.test(letters[j]) &&
  //         /^-?\d+(\.\d*)?(e-?\d+)?$/.test(next)) ||
  //       (letters[j + 1] && letters[j + 1].match(/\W/))
  //     ) {
  //       break;
  //     }
  //   }
  //   return hasAllFlags;
  // }

  // /** TODO */
  // #isUnknownOptionAsArg(arg: string): boolean {
  //   return unknownOptionsAsArgs && this.#isUnknownOption(arg);
  // }

  // /** TODO */
  // #isUnknownOption(arg: string): boolean {
  //   // ignore negative numbers
  //   if (arg.match(NEGATIVE_REGEX)) return false;
  //   // if this is a short option group and all of them are configured, it isn't unknown
  //   if (this.#hasAllShortFlags(arg)) return false;
  //   // e.g. '--count=2'
  //   const flagWithEquals = /^-+([^=]+?)=[\s\S]*$/;
  //   // e.g. '-a' or '--arg'
  //   const normalFlag = /^-+([^=]+?)$/;
  //   // e.g. '-a-'
  //   const flagEndingInHyphen = /^-+([^=]+?)-$/;
  //   // e.g. '-abc123'
  //   const flagEndingInDigits = /^-+([^=]+?\d+)$/;
  //   // e.g. '-a/usr/local'
  //   const flagEndingInNonWordCharacters = /^-+([^=]+?)\W+.*$/;
  //   // check the different types of flag styles, including negatedBoolean, a pattern defined near the start of the parse method
  //   return !this.#hasFlagsMatching(
  //     arg,
  //     flagWithEquals,
  //     NEGATED_BOOLEAN_REGEX,
  //     normalFlag,
  //     flagEndingInHyphen,
  //     flagEndingInDigits,
  //     flagEndingInNonWordCharacters
  //   );
  // }

  // /** Pick a default value for an option, based on name/type (best-effort) */
  // #defaultValue(key: string) {
  //   if (
  //     !this.#checkAllAliases(key, this.flags.bools) &&
  //     !this.#checkAllAliases(key, this.flags.counts) &&
  //     `${key}` in this.defaults
  //   ) {
  //     return this.defaults[key];
  //   } else {
  //     return this.#defaultForType(this.#guessType(key));
  //   }
  // }

  // /** Return a default value, given the type of a flag. */
  // #defaultForType<K extends DefaultValuesForTypeKey>(
  //   type: K
  // ): DefaultValuesForType[K] {
  //   const def: DefaultValuesForType = {
  //     [DefaultValuesForTypeKey.BOOLEAN]: true,
  //     [DefaultValuesForTypeKey.STRING]: '',
  //     [DefaultValuesForTypeKey.NUMBER]: undefined,
  //     [DefaultValuesForTypeKey.ARRAY]: [],
  //   };

  //   return def[type];
  // }

  // /** Given a flag, enforce a default type. */
  // #guessType(key: string): DefaultValuesForTypeKey {
  //   let type: DefaultValuesForTypeKey = DefaultValuesForTypeKey.BOOLEAN;
  //   if (this.#checkAllAliases(key, this.flags.strings)) {
  //     type = DefaultValuesForTypeKey.STRING;
  //   } else if (this.#checkAllAliases(key, this.flags.numbers)) {
  //     type = DefaultValuesForTypeKey.NUMBER;
  //   } else if (this.#checkAllAliases(key, this.flags.bools)) {
  //     type = DefaultValuesForTypeKey.BOOLEAN;
  //   } else if (this.#checkAllAliases(key, this.flags.arrays)) {
  //     type = DefaultValuesForTypeKey.ARRAY;
  //   }
  //   return type;
  // }

  /** Check user configuration settings for inconsistencies */
  #checkConfiguration(): void {
    // Count keys should not be set as array/narg
    Object.keys(this.flags.counts).find(key => {
      if (this.#checkAllAliases(key, this.flags.arrays)) {
        this.error = Error(
          this.__(
            'Invalid configuration: %s, opts.count excludes opts.array.',
            key
          )
        );
        return true;
      }
      // Neither should nargs
      if (this.#checkAllAliases(key, this.flags.nargs)) {
        this.error = Error(
          this.__(
            'Invalid configuration: %s, opts.count excludes opts.narg.',
            key
          )
        );
        return true;
      }
      return false;
    });
  }

  /** Push argument into positional array, applying numeric coercion: */
  #pushPositional(arg: string) {
    const maybeCoercedNumber = this.#maybeCoerceNumber('_', arg);
    if (
      typeof maybeCoercedNumber === 'string' ||
      typeof maybeCoercedNumber === 'number'
    ) {
      this.argv._.push(maybeCoercedNumber);
    }
  }

  /** Parse arguments using util.parseArgs */
  #parseArgv(args: string[]) {
    // https://github.com/yargs/yargs-parser/blob/main/lib/yargs-parser.ts#L394

    // If option terminator ('--'), remove and add following args to notFlags
    if (args.includes('--')) {
      const optionTerminatorIdx = args.indexOf('--');
      Array.prototype.push.apply(
        this.notFlags,
        args.slice(optionTerminatorIdx + 1)
      );
      args = args.slice(0, optionTerminatorIdx);
    }

    const options: any = {}; // ParseArgsOptionConfig

    // Boolean
    this.opts.boolean?.forEach(opt => {
      options[opt] = {type: 'boolean'};
    });
    // String
    this.opts.string?.forEach(opt => {
      options[opt] = {type: 'string'};
    });
    // Number
    this.opts.number?.forEach(opt => {
      options[opt] = {type: 'string'};
    });
    // Array -- set 'multiple' property for array opts
    this.opts.array?.forEach(opt => {
      const isObj = typeof opt === 'object';
      const k = isObj ? opt.key : opt;
      options[k] = {
        ...options[k],
        multiple: true,
      };
    });

    // Parse
    const {values, positionals} = parseArgs({
      args,
      options,
      strict: false,
    });

    // console.log({args, options, values, positionals}); // DELETE ME

    for (const [k, v] of Object.entries(values)) {
      this.#setArg(k, v);
    }
    positionals.forEach(p => this.#pushPositional(p));
  }

  /** Parse input and return  */
  parse(argsInput: ArgsInput, options?: Partial<Options>): DetailedArguments {
    // Allow for string | string[] input, but convert to string[]
    const args = tokenizeArgString(argsInput);

    // TODO: inputIsString & shouldStripQuotes
    // const inputIsString = typeof argsInput === 'string'

    // Reset class properties using options passed to parse
    this.opts = Object.assign(newOpts(), options);
    this.aliases = combineAliases(Object.assign(nullObj(), this.opts.aliases));
    this.defaults = Object.assign(nullObj(), this.opts.default);
    this.configObjects = this.opts.configObjects || []; // TODO: NEW
    this.newAliases = nullObj();
    this.defaulted = nullObj();
    this.argv = Object.assign(nullObj(), {_: []});
    this.notFlags = [];

    // // Allow an i18n handler to be passed in, default to a fake one (util.format).
    // const __ = opts.__ || shim.format;

    // Set flags
    this.#setFlags();

    // Create a lookup table of all alias combinations. Eg: {f: ['foo'], foo: ['f']}
    this.#extendAliases(
      this.opts.key,
      this.aliases,
      this.opts.default,
      this.flags.arrays
    );

    // Apply default values to all aliases
    Object.keys(this.defaults).forEach(key => {
      (this.flags.aliases[key] || []).forEach(alias => {
        this.defaults[alias] = this.defaults[key];
      });
    });

    // Check for conflicts between config objects and nargs/count options
    this.#checkConfiguration();

    // TODO: for the first pass at removing object prototype, we didn't
    // remove all prototypes from objects returned by this API, we might want
    // to gradually move towards doing so.
    const argvReturn: {[argName: string]: any} = {};

    this.#parseArgv(args);

    // order of precedence:
    // 1. command line arg
    // 2. [REMOVED] value from env var
    // 3. [REMOVED] value from config file
    // 4. value from config objects
    // 5. configured default value

    this.#setConfigObjects();
    this.#applyDefaultsAndAliases(
      this.argv,
      this.flags.aliases,
      this.defaults,
      true
    );
    this.#applyCoercions(this.argv);
    if (setPlaceholderKey) this.#setPlaceholderKeys(this.argv);

    // For any counts either not in args or without an explicit default, set to 0
    Object.keys(this.flags.counts).forEach(key => {
      if (!this.#hasKey(this.argv, key.split('.'))) this.#setArg(key, 0);
    });

    // '--' defaults to undefined.
    if (notFlagsOption && this.notFlags.length) this.argv[notFlagsArgv] = [];
    this.notFlags.forEach(key => {
      this.argv[notFlagsArgv].push(key);
    });

    if (camelCaseExpansion && stripDashed) {
      Object.keys(this.argv)
        .filter(key => key !== '--' && key.includes('-'))
        .forEach(key => {
          delete this.argv[key];
        });
    }

    if (stripAliased) {
      ([] as string[])
        .concat(...Object.keys(this.aliases).map(k => this.aliases[k]))
        .forEach(alias => {
          if (camelCaseExpansion && alias.includes('-')) {
            delete this.argv[
              alias
                .split('.')
                .map(prop => camelCase(prop))
                .join('.')
            ];
          }

          delete this.argv[alias];
        });
    }

    return {
      aliases: Object.assign({}, this.flags.aliases),
      argv: Object.assign(argvReturn, this.argv),
      defaulted: Object.assign({}, this.defaulted),
      error: this.error,
      newAliases: Object.assign({}, this.newAliases),
    };
  }
}

// ---
// Helper functions
// ---

/**
 * If any aliases reference each other, merge them.
 * Aliases might have transitive relationships, normalize this.
 */
function combineAliases(aliases: Dictionary<string[]>): Dictionary<string[]> {
  const aliasArrays: Array<string[]> = [];
  const combined: Dictionary<string[]> = nullObj();
  let change = true;

  // Convert {key: ['alias1', 'alias2']} -> ['key', 'alias1', 'alias2']
  Object.keys(aliases).forEach(key => {
    aliasArrays.push(([] as string[]).concat(aliases[key], key));
  });

  // Combine arrays until iteration results in no changes
  while (change) {
    change = false;
    for (let i = 0; i < aliasArrays.length; i++) {
      for (let ii = i + 1; ii < aliasArrays.length; ii++) {
        const intersect = aliasArrays[i].filter(v => {
          return aliasArrays[ii].indexOf(v) !== -1;
        });

        if (intersect.length) {
          aliasArrays[i] = aliasArrays[i].concat(aliasArrays[ii]);
          aliasArrays.splice(ii, 1);
          change = true;
          break;
        }
      }
    }
  }

  // Map arrays back to the hash-lookup (and de-dupe)
  aliasArrays.forEach(aliasArray => {
    aliasArray = aliasArray.filter((v, i, self) => {
      return self.indexOf(v) === i;
    });
    const lastAlias = aliasArray.pop();
    if (lastAlias !== undefined && typeof lastAlias === 'string') {
      combined[lastAlias] = aliasArray;
    }
  });

  return combined;
}

// this function should only be called when a count is given as an arg
// it is NOT called to set a default value
// thus we can start the count at 1 instead of 0
function increment(orig?: number | undefined): number {
  return orig !== undefined ? orig + 1 : 1;
}

// TODO: in the next major version of ljos, switch to
// nullObj() for dot notation:
function sanitizeKey(key: string): string {
  if (key === '__proto__') return '___proto___';
  return key;
}

function isUndefined(num: any): num is undefined {
  return num === undefined;
}

// ---
// Tokenize
// ---

/** Take argv string and tokenize it (Convert string -> string[]). */
export function tokenizeArgString(argString: string | string[]): string[] {
  if (Array.isArray(argString)) {
    return argString;
  }

  argString = argString.trim();

  let i = 0;
  let prevC: string | null = null;
  let c: string | null = null;
  let opening: string | null = null;
  const args: string[] = [];

  for (let ii = 0; ii < argString.length; ii++) {
    prevC = c;
    c = argString.charAt(ii);

    // split on spaces unless we're in quotes.
    if (c === ' ' && !opening) {
      if (!(prevC === ' ')) {
        i++;
      }
      continue;
    }

    // don't split the string if we're in matching
    // opening or closing single and double quotes.
    if (c === opening) {
      opening = null;
    } else if ((c === "'" || c === '"') && !opening) {
      opening = c;
    }

    if (!args[i]) args[i] = '';
    args[i] += c;
  }

  return args;
}

// ---
// Misc utils
// ---

/** Create a new object with null prototype */
function nullObj() {
  return Object.create(null);
}

/** Initialize Flags */
function newFlags(): Flags {
  return {
    aliases: nullObj(),
    arrays: nullObj(),
    bools: nullObj(),
    strings: nullObj(),
    numbers: nullObj(),
    counts: nullObj(),
    normalize: nullObj(),
    configs: nullObj(),
    nargs: nullObj(),
    coercions: nullObj(),
    keys: [],
  };
}

/** Initialize options */
function newOpts(): Partial<Options> {
  return Object.assign(nullObj(), {
    aliases: undefined,
    array: undefined,
    boolean: undefined,
    config: undefined,
    configObjects: undefined,
    // configuration: undefined,
    coerce: undefined,
    count: undefined,
    default: undefined,
    envPrefix: undefined,
    narg: undefined,
    normalize: undefined,
    string: undefined,
    number: undefined,
    __: undefined,
    key: undefined,
  });
}

// ---
// Index
// ---

// Creates a ljos-parser instance using Node.js standard libraries:
const parser = new LjosParser({format, normalize});

const ljosParser: Parser = function Parser(
  args: ArgsInput,
  opts?: Partial<Options>
): Arguments {
  const result = parser.parse(args.slice(), opts);
  return result.argv;
};

ljosParser.detailed = function (
  args: ArgsInput,
  opts?: Partial<Options>
): DetailedArguments {
  return parser.parse(args.slice(), opts);
};

ljosParser.reset = function () {
  parser.reset();
};

export default ljosParser;
