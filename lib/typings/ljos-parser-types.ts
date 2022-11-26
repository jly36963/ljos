import type {Dictionary, Nil, ValueOf} from './common-types.js';

export declare type KeyOf<T> = {
  [K in keyof T]: string extends K ? never : number extends K ? never : K;
} extends {[_ in keyof T]: infer U}
  ? U
  : never;

export declare type ArgsInput = string | any[];
export declare type ArgsOutput = (string | number)[];
export interface Arguments {
  /** Non-option arguments */
  _: ArgsOutput;
  /** Arguments after the end-of-options flag `--` */
  '--'?: ArgsOutput;
  /** All remaining options */
  [argName: string]: any;
}
export interface DetailedArguments {
  /** An object representing the parsed value of `args` */
  argv: Arguments;
  /** Populated with an error object if an exception occurred during parsing. */
  error: Error | null;
  /** The inferred list of aliases built by combining lists in opts.alias. */
  aliases: Dictionary<string[]>;
  /** Any new aliases added via camel-case expansion. */
  newAliases: Dictionary<boolean>;
  /** Any new argument created by opts.default, no aliases included. */
  defaulted: Dictionary<boolean>;
}

export declare type ArrayOption =
  | string
  | {
      key: string;
      boolean?: boolean;
      string?: boolean;
      number?: boolean;
      integer?: boolean;
    };
export declare type CoerceCallback = (arg: any) => any;
export interface Options {
  /** An object representing the set of aliases for a key: `{ alias: { foo: ['f']} }`. */
  aliases: Dictionary<string[]>;
  /**
   * Indicate that keys should be parsed as an array: `{ array: ['foo', 'bar'] }`.
   * Indicate that keys should be parsed as an array and coerced to booleans / numbers:
   * { array: [ { key: 'foo', boolean: true }, {key: 'bar', number: true} ] }`.
   */
  array: ArrayOption[];
  /** Arguments should be parsed as booleans: `{ boolean: ['x', 'y'] }`. */
  boolean: string[];
  // /** Indicate a key that represents a path to a configuration file (this file will be loaded and parsed). */
  // config: Dictionary<boolean>;
  /** configuration objects to parse, their properties will be set as arguments */
  configObjects: Dictionary<any>[];
  /**
   * Provide a custom synchronous function that returns a coerced value from the argument provided (or throws an error), e.g.
   * `{ coerce: { foo: function (arg) { return modifiedArg } } }`.
   */
  coerce: Dictionary<CoerceCallback>;
  // /** Indicate a key that should be used as a counter, e.g., `-vvv = {v: 3}`. */
  // count: string[];
  /** Provide default values for keys: `{ default: { x: 33, y: 'hello world!' } }`. */
  default: Dictionary<any>;
  // /** Environment variables (`process.env`) with the prefix provided should be parsed. */
  // envPrefix?: string;
  // /** Specify that a key requires n arguments: `{ narg: {x: 2} }`. */
  // narg: Dictionary<number>;
  /** `path.normalize()` will be applied to values set to this key. */
  normalize: string[];
  /** Keys should be treated as strings (even if they resemble a number `-x 33`). */
  string: string[];
  /** Keys should be treated as numbers. */
  number: string[];
  /** i18n handler, defaults to util.format */
  __: (format: any, ...param: any[]) => string;
  /** alias lookup table defaults */
  key: Dictionary<any>;
}
export interface PlatformShim {
  format: Function;
  normalize: Function;
}
export type OptionsDefault = ValueOf<Pick<Required<Options>, 'default'>>;
export interface Parser {
  (args: ArgsInput, opts?: Partial<Options>): Arguments;
  detailed(args: ArgsInput, opts?: Partial<Options>): DetailedArguments;
  reset(): void;
}
export declare type StringFlag = Dictionary<string[]>;
export declare type BooleanFlag = Dictionary<boolean>;
export declare type NumberFlag = Dictionary<number>;
export declare type ConfigsFlag = Dictionary<boolean>;
export declare type CoercionsFlag = Dictionary<CoerceCallback>;
export declare type KeysFlag = string[];
export interface Flags {
  aliases: StringFlag;
  arrays: BooleanFlag;
  bools: BooleanFlag;
  strings: BooleanFlag;
  numbers: BooleanFlag;
  counts: BooleanFlag;
  normalize: BooleanFlag;
  configs: ConfigsFlag;
  nargs: NumberFlag;
  coercions: CoercionsFlag;
  keys: KeysFlag;
}
export declare type Flag = ValueOf<Omit<Flags, 'keys'>>;
export declare type FlagValue = ValueOf<Flag>;
export declare type FlagsKey = KeyOf<Omit<Flags, 'keys'>>;
export declare type ArrayFlagsKey = Extract<
  FlagsKey,
  'bools' | 'strings' | 'numbers'
>;
export enum DefaultValuesForTypeKey {
  BOOLEAN = 'boolean',
  STRING = 'string',
  NUMBER = 'number',
  ARRAY = 'array',
}
export interface DefaultValuesForType {
  [DefaultValuesForTypeKey.BOOLEAN]: boolean;
  [DefaultValuesForTypeKey.STRING]: string;
  [DefaultValuesForTypeKey.NUMBER]: undefined;
  [DefaultValuesForTypeKey.ARRAY]: any[];
}
