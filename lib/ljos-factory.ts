// Platform agnostic entrypoint for ljos, i.e., this factory is used to
// create an instance of ljos for CJS, ESM, Deno.
//
// Works by accepting a shim which shims methods that contain platform
// specific logic.
// import {camelCase} from './utils/strings';
import {
  command as Command,
  CommandHandler,
  CommandHandlerCallback,
  CommandHandlerDefinition,
  CommandInstance,
  CommandBuilderCallback,
} from './command.js';
import type {
  Dictionary,
  DictionaryKeyof,
  KeyOf,
  Nil,
  PlatformShim,
  ValueOf,
} from './typings/common-types.js';
import {
  assertNotStrictEqual,
  assertSingleKey,
  objectKeys,
} from './typings/common-types.js';
import {
  ArgsOutput,
  CoerceCallback,
  DetailedArguments as ParserDetailedArguments,
  Options as ParserOptions,
} from './typings/ljos-parser-types.js';
import {LError} from './lerror.js';
import {FailureFunction, usage as Usage, UsageInstance} from './usage.js';
import {argsert} from './argsert.js';
import {
  completion as Completion,
  CompletionFunction,
  CompletionInstance,
} from './completion.js';
import {
  // KeyOrPos,
  validation as Validation,
  ValidationInstance,
} from './validation.js';
import {objFilter} from './utils/obj-filter.js';
import {
  middlewareFunc,
  applyMiddleware,
  MiddlwareInstance,
  MiddlewareInput,
  globalMwFactory,
  checkMwFactory,
  commandMwFactory,
  Middleware,
} from './middleware.js';
import {isPromise} from './utils/is-promise.js';
import {maybeAsyncResult} from './utils/maybe-async-result.js';
import setBlocking from './utils/set-blocking.js';
import {looksLikeNumber} from './utils/strings';

export function LjosFactory(_shim: PlatformShim) {
  return (
    processArgs: string | string[] = [],
    cwd = _shim.process.cwd()
  ): LjosInstance => {
    const ljos = new LjosInstance(processArgs, cwd, _shim);
    // An app should almost always have --version and --help,
    // if you *really* want to disable this use .help(false)/.version(false).
    ljos.help();
    ljos.version();
    return ljos;
  };
}

export interface LjosInternalMethods {
  // ---
  // Internal actions/mutations
  // ---

  postProcess(
    argv: maybePromiseArgs,
    calledFromCommand: boolean,
    runGlobalMiddleware: boolean
  ): any;
  reset(aliases?: Aliases): LjosInstance;
  runValidation(
    aliases: Dictionary<string[]>,
    positionalMap: Dictionary<string[]>,
    parseErrors: Error | null,
    isDefaultCommand?: boolean
  ): (argv: Arguments) => void;
  runLjosParserAndExecuteCommands(
    args: string | string[] | null,
    shortCircuit?: boolean | null,
    calledFromCommand?: boolean,
    commandIndex?: number,
    helpOnly?: boolean
  ): maybePromiseArgs;
  setHasOutput(): void;

  // ---
  // Internal getters
  // ---

  getAliases(): Dictionary<string[]>;
  getCommandInstance(): CommandInstance;
  getContext(): Context;
  getDemandedOptions(): Dictionary<string | undefined>;
  getDemandedCommands(): DemandedCommandsMeta;
  getDeprecatedOptions(): Dictionary<string | boolean | undefined>;
  getDetectLocale(): boolean;
  getExitProcess(): boolean;
  getIsGlobalContext(): boolean;
  getGroups(): Dictionary<string[]>;
  getHasOutput(): boolean;
  getLoggerInstance(): LoggerInstance;
  getOptions(): Options;
  getParseContext(): Object;
  getParsed(): DetailedArguments | false;
  getStrict(): boolean;
  getStrictCommands(): boolean;
  getStrictOptions(): boolean;
  getUsageInstance(): UsageInstance;
  getValidationInstance(): ValidationInstance;
  hasParseCallback(): boolean;

  // ---
  // Options/Positionals
  // ---

  aliases(key: string, values: string[]): LjosInstance;
  array(key: string): LjosInstance;
  boolean(key: string): LjosInstance;
  demandOption(keys: string, msg?: string): LjosInstance;
  normalize(keys: string | string[]): LjosInstance;
  number(keys: string | string[]): LjosInstance;
  string(keys: string | string[]): LjosInstance;
}

export class LjosInstance {
  $0: string;
  argv?: Arguments;
  customScriptName = false;

  #commandInstance: CommandInstance;
  #cwd: string;
  // Use context object to keep track of resets, subcommand execution, etc.,
  // submodules should modify and check the state of context as necessary:
  #context: Context = {commands: [], fullCommands: []};
  #completion: CompletionInstance | null = null;
  #completionCommand: string | null = null;
  #defaultShowHiddenOpt = 'show-hidden';
  #exitError: LError | string | Nil = null;
  #detectLocale = true;
  #emittedWarnings: Dictionary<boolean> = {};
  #exitProcess = true;
  #frozens: FrozenLjosInstance[] = [];
  #groups: Dictionary<string[]> = {};
  #hasOutput = false;
  #helpOpt: string | null = null;
  #isGlobalContext = true;
  #loggerInstance: LoggerInstance;
  #middlewareInstance: MiddlwareInstance;
  #output = '';
  #options: Options;
  #parsed: DetailedArguments | false = false;
  #parseFn: ParseCallback | null = null;
  #parseContext: object | null = null;
  #pkgs: Dictionary<{[key: string]: string | {[key: string]: string}}> = {};
  #preservedGroups: Dictionary<string[]> = {};
  #processArgs: string | string[];
  #recommendCommands = false;
  #shim: PlatformShim;
  #strict = false;
  #strictCommands = false;
  #strictOptions = false;
  #usage: UsageInstance;
  #versionOpt: string | null = null;
  #validationInstance: ValidationInstance;

  constructor(
    processArgs: string | string[] = [],
    cwd: string,
    shim: PlatformShim
  ) {
    this.#shim = shim;
    this.#processArgs = processArgs;
    this.#cwd = cwd;
    this.#middlewareInstance = new MiddlwareInstance(this);
    this.$0 = this.#getDollarZero();
    // #commandInstance, #validationInstance, and #usage are initialized on first reset:
    this.#reset();
    this.#commandInstance = this!.#commandInstance;
    this.#usage = this!.#usage;
    this.#validationInstance = this!.#validationInstance;
    this.#options = this!.#options;
    this.#options.showHiddenOpt = this.#defaultShowHiddenOpt;
    this.#loggerInstance = this.#createLogger();
  }
  /** Add help option, which if called, will return usage and exit early */
  help(opt = 'help', msg: string | undefined = undefined): LjosInstance {
    argsert('[string] [string|undefined]', [opt, msg], arguments.length);

    // Clear old help key
    this.#clearHelp();

    // Use arguments, fallback to defaults for opt and msg
    this.#helpOpt = opt;
    this.#boolean(this.#helpOpt);
    this.#describe(
      this.#helpOpt,
      msg || this.#usage.deferY18nLookup('Show help')
    );
    return this;
  }
  /** Disable help functionality */
  disableHelp(): LjosInstance {
    this.#clearHelp();
    return this;
  }
  /** TODO */
  addShowHiddenOpt(opt?: string | false, msg?: string): LjosInstance {
    argsert('[string|boolean] [string]', [opt, msg], arguments.length);
    if (opt === false && msg === undefined) return this;
    const showHiddenOpt =
      typeof opt === 'string' ? opt : this.#defaultShowHiddenOpt;
    this.#boolean(showHiddenOpt);
    this.#describe(
      showHiddenOpt,
      msg || this.#usage.deferY18nLookup('Show hidden options')
    );
    this.#options.showHiddenOpt = showHiddenOpt;
    return this;
  }
  /** Set an option that, when provided, will  */
  showHidden(opt?: string | false, msg?: string): LjosInstance {
    return this.addShowHiddenOpt(opt, msg);
  }
  /** Check that certain conditions are met in the provided args */
  check(
    checkCallback: (argv: Arguments, options: Options) => any,
    global = true
  ): LjosInstance {
    argsert('<function> [boolean]', [checkCallback, global], arguments.length);

    // Convert check to middleware
    const middlewareCallback = (
      argv: Arguments,
      _ljos: LjosInstance
    ): maybePromisePartialArgs =>
      maybeAsyncResult<maybePromisePartialArgs | any>(
        // Get result of check callback
        () => checkCallback(argv, _ljos.#getOptions()),
        // Handle result of check callback
        (result: any): maybePromisePartialArgs => {
          if (!result) {
            this.#usage.fail(
              this.#shim.y18n.__(
                'Argument check failed: %s',
                checkCallback.toString()
              )
            );
          } else if (typeof result === 'string' || result instanceof Error) {
            this.#usage.fail(result.toString(), result);
          }
          return argv;
        },
        // Handle error of check callback
        (err: Error): maybePromisePartialArgs => {
          this.#usage.fail(err.message ? err.message : err.toString(), err);
          return argv;
        }
      );

    // Add check middleware
    const middleware = checkMwFactory({f: middlewareCallback, global});
    return this.#middlewareInstance.addMiddleware(middleware);
  }
  /** Set config object keys/values on argv */
  config(obj: Dictionary): LjosInstance {
    argsert('[object]', [obj], arguments.length);
    // Allow a config object to be provided directly.
    this.#options.configObjects = (this.#options.configObjects || []).concat(
      obj
    );
    return this;
  }
  // TODO: simplify call signature
  /** Set arg that, when provided, will output bash/zsh completion script for use in .bashrc/.zshrc */
  completion(
    cmd?: string,
    desc?: string | false | CompletionFunction,
    fn?: CompletionFunction
  ): LjosInstance {
    argsert(
      '[string] [string|boolean|function] [function]',
      [cmd, desc, fn],
      arguments.length
    );

    // a function to execute when generating
    // completions can be provided as the second
    // or third argument to completion.
    if (typeof desc === 'function') {
      fn = desc;
      desc = undefined;
    }

    // register the completion command.
    this.#completionCommand = cmd || this.#completionCommand || 'completion';
    if (!desc && desc !== false) {
      desc = 'generate completion script';
    }
    this.#addCommand(this.#completionCommand, desc, noop, noop);

    // a function can be provided
    if (fn) this.#completion!.registerFunction(fn);

    return this;
  }
  /** Register command */
  #addCommand(
    cmd: string,
    desc: CommandHandler['desc'],
    builder: CommandBuilderCallback = noop,
    handler: CommandHandlerCallback = noop,
    config: Partial<CommandConfig> = {}
  ): LjosInstance {
    argsert('<string> <string|boolean> <function> <function> [object]', [
      cmd,
      desc,
      builder,
      handler,
      config,
    ]);

    const {aliases = [], middleware = [], deprecated = false} = config;
    argsert('[array] [array] [boolean]', [aliases, middleware, deprecated]);

    const fullMiddleware = middleware.map(commandMwFactory);

    this.#commandInstance.addHandler(
      cmd,
      desc,
      builder,
      handler,
      fullMiddleware,
      deprecated,
      aliases
    );
    return this;
  }
  /** Register a command */
  command({
    cmd,
    desc = false,
    builder = noop,
    handler = noop,
    middleware = [],
    deprecated = false,
    aliases = [],
  }: CommandHandlerDefinition): LjosInstance {
    return this.#addCommand(cmd, desc, builder, handler, {
      aliases,
      middleware,
      deprecated,
    });
  }
  /* Demand the min/max number of commands in a program */
  demandCommand(
    min = 1,
    max?: number | string,
    minMsg?: string | null,
    maxMsg?: string | null
  ): LjosInstance {
    argsert(
      '[number] [number|string|undefined|null] [string|null|undefined] [string|null|undefined]',
      [min, max, minMsg, maxMsg],
      arguments.length
    );

    if (typeof max !== 'number') {
      minMsg = max;
      max = Infinity;
    }

    this.global('_', false);

    this.#options.demandedCommands._ = {
      min,
      max,
      minMsg,
      maxMsg,
    };

    return this;
  }
  /** TODO */
  detectLocale(detect: boolean): LjosInstance {
    argsert('<boolean>', [detect], arguments.length);
    this.#detectLocale = detect;
    return this;
  }
  // // as long as options.envPrefix is not undefined,
  // // parser will apply env vars matching prefix to argv
  // env(prefix?: string | false): LjosInstance {
  //   argsert("[string|boolean]", [prefix], arguments.length);
  //   if (prefix === false) delete this.#options.envPrefix;
  //   else this.#options.envPrefix = prefix || "";
  //   return this;
  // }

  /** TODO */
  epilogue(msg: string): LjosInstance {
    argsert('<string>', [msg], arguments.length);
    this.#usage.epilog(msg);
    return this;
  }
  /** Set example invocations of program */
  example(cmd: string | [string, string?][], desc?: string): LjosInstance {
    argsert('<string|array> [string]', [cmd, desc], arguments.length);

    if (Array.isArray(cmd)) {
      cmd.forEach(exampleParams => this.example(...exampleParams));
    } else {
      this.#usage.example(cmd, desc);
    }

    return this;
  }

  // Maybe exit, always capture context about why we wanted to exit:
  exit(code: number, err?: LError | string): void {
    this.#hasOutput = true;
    this.#exitError = err;
    if (this.#exitProcess) this.#shim.process.exit(code);
  }
  /** TODO */
  exitProcess(enabled = true): LjosInstance {
    argsert('[boolean]', [enabled], arguments.length);
    this.#exitProcess = enabled;
    return this;
  }
  /** TODO */
  fail(f: FailureFunction | boolean): LjosInstance {
    argsert('<function|boolean>', [f], arguments.length);
    if (typeof f === 'boolean' && f !== false) {
      throw new LError(
        "Invalid first argument. Expected function or boolean 'false'"
      );
    }
    this.#usage.failFn(f);
    return this;
  }
  /** TODO */
  async getCompletion(
    args: string[],
    done?: (err: Error | null, completions: string[] | undefined) => void
  ): Promise<string[] | void> {
    argsert('<array> [function]', [args, done], arguments.length);
    if (!done) {
      return new Promise((resolve, reject) => {
        this.#completion!.getCompletion(args, (err, completions) => {
          if (err) reject(err);
          else resolve(completions);
        });
      });
    } else {
      return this.#completion!.getCompletion(args, done);
    }
  }
  /** TODO */
  getHelp(): Promise<string> {
    this.#hasOutput = true;
    if (!this.#usage.hasCachedHelpMessage()) {
      if (!this.#parsed) {
        // Run the parser as if --help was passed to it (this is what
        // the last parameter `true` indicates).
        const parse = this.#runLjosParserAndExecuteCommands(
          this.#processArgs,
          undefined,
          undefined,
          0,
          true
        );
        if (isPromise(parse)) {
          return parse.then(() => {
            return this.#usage.help();
          });
        }
      }
      // Ensure top level options/positionals have been configured:
      const builderResponse = this.#commandInstance.runDefaultBuilderOn(this);
      if (isPromise(builderResponse)) {
        return builderResponse.then(() => {
          return this.#usage.help();
        });
      }
    }
    return Promise.resolve(this.#usage.help());
  }
  /** TODO */
  global(globals: string | string[], global?: boolean): LjosInstance {
    argsert('<string|array> [boolean]', [globals, global], arguments.length);
    globals = ([] as string[]).concat(globals);
    if (global !== false) {
      this.#options.local = this.#options.local.filter(
        l => globals.indexOf(l) === -1
      );
    } else {
      globals.forEach(g => {
        if (!this.#options.local.includes(g)) this.#options.local.push(g);
      });
    }
    return this;
  }
  /** TODO */
  group(opts: string | string[], groupName: string): LjosInstance {
    argsert('<string|array> <string>', [opts, groupName], arguments.length);
    const existing =
      this.#preservedGroups[groupName] || this.#groups[groupName];
    if (this.#preservedGroups[groupName]) {
      // we now only need to track this group name in groups.
      delete this.#preservedGroups[groupName];
    }
    const seen: Dictionary<boolean> = {};
    this.#groups[groupName] = (existing || []).concat(opts).filter(key => {
      if (seen[key]) return false;
      return (seen[key] = true);
    });
    return this;
  }
  /** TODO */
  locale(locale?: string): LjosInstance | string {
    argsert('[string]', [locale], arguments.length);
    if (locale === undefined) {
      this.#guessLocale();
      return this.#shim.y18n.getLocale();
    }
    this.#detectLocale = false;
    this.#shim.y18n.setLocale(locale);
    return this;
  }
  /** Register a middleware */
  middleware(mw: middlewareFunc | MiddlewareInput): LjosInstance {
    const middleware = globalMwFactory(mw);
    return this.#middlewareInstance.addMiddleware(middleware);
  }
  /** Register an option argument */
  option(key: string, opt: OptionDefinition): LjosInstance {
    argsert('<string> <object>', [key, opt], arguments.length);

    this.#trackManuallySetKeys(key);

    // Warn about version name-collision
    if (
      this.#versionOpt &&
      (key === 'version' || opt?.aliases?.includes('version'))
    ) {
      this.#emitWarning(
        [
          '"version" is a reserved word.',
          'Please do one of the following:',
          '- Disable version with `ljos.version(false)` if using "version" as an option',
          '- Use the built-in `ljos.version` method instead (if applicable)',
          '- Use a different option key',
          'https://yargs.js.org/docs/#api-reference-version', // TODO: remove
        ].join('\n'),
        undefined,
        'versionWarning' // TODO: better dedupeId
      );
    }

    this.#options.key[key] = true; // track manually set keys.

    if (opt.aliases) this.#aliases(key, opt.aliases);

    const deprecated = opt.deprecated;

    if (deprecated) {
      this.#deprecateOption(key, deprecated);
    }

    const required = opt.required;

    // // A required option can be specified via "demand: true".
    // if (required) {
    //   this.#demand(key, required);
    // }

    if (required) {
      this.#demandOption(
        key,
        typeof opt.required === 'string' ? opt.required : undefined
      );
    }

    if (opt.conflicts) {
      this.#conflicts(key, opt.conflicts);
    }

    if ('default' in opt) {
      this.#default(key, opt.default);
    }

    if (opt.implies !== undefined) {
      this.#implies(key, opt.implies);
    }

    if (opt.normalize) {
      this.#normalize(key);
    }

    if (opt.choices) {
      this.#choices(key, opt.choices);
    }

    if (opt.coerce) {
      this.#coerce(key, opt.coerce);
    }

    if (opt.group) {
      this.group(key, opt.group);
    }

    if (opt.boolean || opt.type === 'boolean') {
      this.#boolean(key);
      if (opt.aliases) {
        if (typeof opt.aliases === 'object') {
          opt.aliases.forEach(a => this.#boolean(a));
        } else {
          this.#boolean(opt.aliases);
        }
      }
    }

    if (opt.array || opt.type === 'array') {
      this.#array(key);
      if (opt.aliases) {
        if (typeof opt.aliases === 'object') {
          opt.aliases.forEach(a => this.#array(a));
        } else {
          this.#array(opt.aliases);
        }
      }
    }

    if (opt.number || opt.type === 'number') {
      this.#number(key);
      if (opt.aliases) this.#number(opt.aliases);
    }

    if (opt.string || opt.type === 'string') {
      this.#string(key);
      if (opt.aliases) this.#string(opt.aliases);
    }

    if (typeof opt.global === 'boolean') {
      this.global(key, opt.global);
    }

    if (opt.defaultDescription) {
      this.#options.defaultDescription[key] = opt.defaultDescription;
    }

    if (opt.skipValidation) {
      this.skipValidation(key);
    }

    const {desc} = opt;
    const descriptions = this.#usage.getDescriptions();
    if (
      !Object.prototype.hasOwnProperty.call(descriptions, key) ||
      typeof desc === 'string'
    ) {
      this.#describe(key, desc);
    }

    if (opt.hidden) {
      this.#hide(key);
    }

    // if (opt.requiresArg) {
    //   this.#requiresArg(key);
    // }

    return this;
  }
  /** TODO */
  options(optionMap: Dictionary<OptionDefinition>): LjosInstance {
    for (const [key, opt] of Object.entries(optionMap)) {
      this.option(key, opt);
    }
    return this;
  }

  // TODO: new method -- parse with arbitrary arguments
  /** Execute ljos program against arguments */
  parse(
    args?: string | string[],
    shortCircuit?: boolean
  ): Arguments | Promise<Arguments> {
    argsert(
      '[string|array] [function|boolean|object]',
      [args, shortCircuit],
      arguments.length
    );

    // Push current state of parser onto stack.
    this.#freeze();
    if (typeof args === 'undefined') {
      args = this.#processArgs;
    }

    // Completion short-circuits the parsing process, skipping validation, etc.
    if (!shortCircuit) this.#processArgs = args;

    // TODO: do something with this
    // if (this.#parseFn) this.#exitProcess = false;

    const parsed = this.#runLjosParserAndExecuteCommands(args, shortCircuit);
    const tmpParsed = this.#parsed;
    this.#completion!.setParsed(this.#parsed as DetailedArguments);

    if (isPromise(parsed)) {
      return parsed
        .then(argv => argv)
        .catch(err => {
          throw err;
        })
        .finally(() => {
          this.#unfreeze(); // Pop the stack.
          this.#parsed = tmpParsed;
        });
    }
    this.#unfreeze(); // Pop the stack.
    this.#parsed = tmpParsed;
    return parsed;
  }

  /** Parse, but always return a promise */
  parseAsync(
    args?: string | string[],
    shortCircuit?: boolean
  ): Promise<Arguments> {
    const maybePromise = this.parse(args, shortCircuit);
    return !isPromise(maybePromise)
      ? Promise.resolve(maybePromise)
      : maybePromise;
  }

  /** Parse, but throw an error if builder, handler, or middleware are async */
  parseSync(args?: string | string[], shortCircuit?: boolean): Arguments {
    const maybePromise = this.parse(args, shortCircuit);
    if (isPromise(maybePromise)) {
      throw new LError(
        '.parseSync() must not be used with asynchronous builders, handlers, or middleware'
      );
    }
    return maybePromise;
  }

  /** Define positional arguments for a command */
  positional(key: string, opts: PositionalDefinition): LjosInstance {
    argsert('<string> <object>', [key, opts], arguments.length);
    // .positional() only supports a subset of the configuration
    // options available to .option():
    const supportedOpts: (keyof PositionalDefinition)[] = [
      'default',
      'defaultDescription',
      'implies',
      'normalize',
      'choices',
      'conflicts',
      'coerce',
      'type',
      'desc',
      'aliases',
    ];
    opts = objFilter(opts, (k, v) => {
      // type can be one of string|number|boolean.
      if (k === 'type' && !['string', 'number', 'boolean'].includes(v)) {
        return false;
      }
      return supportedOpts.includes(k);
    });

    // Copy over any settings that can be inferred from the command string.
    const fullCommand =
      this.#context.fullCommands[this.#context.fullCommands.length - 1];
    const parseOptions = fullCommand
      ? this.#commandInstance.cmdToParseOptions(fullCommand)
      : {
          array: [],
          aliases: {},
          default: {},
          required: {},
        };
    objectKeys(parseOptions).forEach(pk => {
      const parseOption = parseOptions[pk];
      if (Array.isArray(parseOption)) {
        if (parseOption.indexOf(key) !== -1) opts[pk] = true;
      } else {
        if (parseOption[key] && !(pk in opts)) opts[pk] = parseOption[key];
      }
    });
    this.group(key, this.#usage.getPositionalGroupName());
    return this.option(key, opts);
  }

  /** TODO */
  recommendCommands(recommend = true): LjosInstance {
    argsert('[boolean]', [recommend], arguments.length);
    this.#recommendCommands = recommend;
    return this;
  }

  /** TODO */
  showCompletionScript($0?: string, cmd?: string): LjosInstance {
    argsert('[string] [string]', [$0, cmd], arguments.length);
    $0 = $0 || this.$0;
    this.#loggerInstance.log(
      this.#completion!.generateCompletionScript(
        $0,
        cmd || this.#completionCommand || 'completion'
      )
    );
    return this;
  }

  /** TODO */
  showHelp(level: 'error' | 'log' | ((message: string) => void)): LjosInstance {
    argsert('[string|function]', [level], arguments.length);
    this.#hasOutput = true;
    if (!this.#usage.hasCachedHelpMessage()) {
      if (!this.#parsed) {
        // Run the parser as if --help was passed to it (this is what
        // the last parameter `true` indicates).
        const parse = this.#runLjosParserAndExecuteCommands(
          this.#processArgs,
          undefined,
          undefined,
          0,
          true
        );
        if (isPromise(parse)) {
          parse.then(() => {
            this.#usage.showHelp(level);
          });
          return this;
        }
      }
      // Ensure top level options/positionals have been configured:
      const builderResponse = this.#commandInstance.runDefaultBuilderOn(this);
      if (isPromise(builderResponse)) {
        builderResponse.then(() => {
          this.#usage.showHelp(level);
        });
        return this;
      }
    }
    this.#usage.showHelp(level);
    return this;
  }

  /** Set the name of the script ($0) */
  scriptName(scriptName: string): LjosInstance {
    this.customScriptName = true;
    this.$0 = scriptName;
    return this;
  }

  /** Customize usage logging on fail */
  showHelpOnFail(enabled?: string | boolean, message?: string): LjosInstance {
    argsert('[boolean|string] [string]', [enabled, message], arguments.length);
    this.#usage.showHelpOnFail(enabled, message);
    return this;
  }

  /** Log version data */
  showVersion(
    level: 'error' | 'log' | ((message: string) => void)
  ): LjosInstance {
    argsert('[string|function]', [level], arguments.length);
    this.#usage.showVersion(level);
    return this;
  }

  /** Skip validation on a key (or keys) */
  skipValidation(keys: string | string[]): LjosInstance {
    argsert('<array|string>', [keys], arguments.length);
    this.#populateParserHintArray('skipValidation', keys);
    return this;
  }

  /** Return an error when unknown/extra commands, positionals, or options are passed */
  strict(enabled?: boolean): LjosInstance {
    argsert('[boolean]', [enabled], arguments.length);
    this.#strict = enabled !== false;
    return this;
  }

  /** Return an error when unknown commands/positionals are provided */
  strictCommands(enabled?: boolean): LjosInstance {
    argsert('[boolean]', [enabled], arguments.length);
    this.#strictCommands = enabled !== false;
    return this;
  }

  /** Return an error when unknown options are provided */
  strictOptions(enabled?: boolean): LjosInstance {
    argsert('[boolean]', [enabled], arguments.length);
    this.#strictOptions = enabled !== false;
    return this;
  }

  /** Get terminal width (if applicable) */
  terminalWidth(): number | null {
    argsert([], 0);
    return this.#shim.process.stdColumns;
  }

  /** TODO */
  updateLocale(obj: Dictionary<string>): LjosInstance {
    return this.updateStrings(obj);
  }

  /** Override usage words/phrases in ljos usage */
  updateStrings(obj: Dictionary<string>): LjosInstance {
    argsert('<object>', [obj], arguments.length);
    this.#detectLocale = false;
    this.#shim.y18n.updateLocale(obj);
    return this;
  }

  // /** TODO */
  // usage(
  //   msg: string | null,
  //   description: CommandHandler['description'],
  //   builder: CommandBuilderCallback,
  //   handler: CommandHandlerCallback
  // ): LjosInstance {
  //   argsert(
  //     '<string|null|undefined> [string|boolean] [function|object] [function]',
  //     [msg, description, builder, handler],
  //     arguments.length
  //   );

  //   if (description !== undefined) {
  //     assertNotStrictEqual(msg, null, this.#shim);
  //     // .usage() can be used as an alias for defining
  //     // a default command.
  //     if ((msg || '').match(/^\$0( |$)/)) {
  //       return this.command(msg, description, builder, handler);
  //     } else {
  //       throw new LError(
  //         '.usage() description must start with $0 if being used as alias for .command()'
  //       );
  //     }
  //   } else {
  //     this.#usage.usage(msg);
  //     return this;
  //   }
  // }

  /** TODO */
  version(opt?: string | false, msg?: string, ver?: string): LjosInstance {
    const defaultVersionOpt = 'version';
    argsert(
      '[boolean|string] [string] [string]',
      [opt, msg, ver],
      arguments.length
    );

    // Nuke the key previously configured
    // to return version #.
    if (this.#versionOpt) {
      this.#deleteFromParserHintObject(this.#versionOpt);
      this.#usage.version(undefined);
      this.#versionOpt = null;
    }

    if (arguments.length === 0) {
      ver = this.#guessVersion();
      opt = defaultVersionOpt;
    } else if (arguments.length === 1) {
      if (opt === false) {
        // disable default 'version' key.
        return this;
      }
      ver = opt;
      opt = defaultVersionOpt;
    } else if (arguments.length === 2) {
      ver = msg;
      msg = undefined;
    }

    this.#versionOpt = typeof opt === 'string' ? opt : defaultVersionOpt;
    msg = msg || this.#usage.deferY18nLookup('Show version number');

    this.#usage.version(ver || undefined);
    this.#boolean(this.#versionOpt);
    this.#describe(this.#versionOpt, msg);
    return this;
  }

  /** TODO */
  wrap(cols: number | Nil): LjosInstance {
    argsert('<number|null|undefined>', [cols], arguments.length);
    this.#usage.wrap(cols);
    return this;
  }

  // ---
  // Private
  // ---

  /** Set an alias (or multiple) for a given argument */
  #aliases(key: string, values: string[]): LjosInstance {
    argsert('<string> <string|array>', [key, values], arguments.length);
    this.#populateParserHintArrayDictionary(
      this.#aliases.bind(this),
      'aliases',
      key,
      values
    );
    return this;
  }

  // #aliasMultiple(aliasMap: Dictionary<string | string[]>): LjosInstance {
  //   argsert(
  //     "<object>",
  //     [aliasMap],
  //     arguments.length,
  //   );
  //   for (const [key, values] of Object.entries(aliasMap)) {
  //     this.#alias(key, values);
  //   }
  //   return this;
  // }

  /** Inform the parser that multiple values can be provided for an argument  */
  #array(key: string): LjosInstance {
    argsert('<string>', [key], arguments.length);
    this.#populateParserHintArray('array', key);
    this.#trackManuallySetKeys(key);
    return this;
  }

  /** Set the type of an argument as boolean */
  #boolean(key: string): LjosInstance {
    argsert('<string>', [key], arguments.length);
    this.#populateParserHintArray('boolean', key);
    this.#trackManuallySetKeys(key);
    return this;
  }

  /** Define a finite number of choices for an argument */
  #choices(key: string, value: string[]): LjosInstance {
    argsert('<string> <array>', [key, value], arguments.length);
    this.#populateParserHintArrayDictionary(
      this.#choices.bind(this),
      'choices',
      key,
      value
    );
    return this;
  }

  /** Nuke the previously-configured help key. */
  #clearHelp(): void {
    if (this.#helpOpt) {
      this.#deleteFromParserHintObject(this.#helpOpt);
      this.#helpOpt = null;
    }
  }

  #coerce(key: string, coerceCallback: CoerceCallback): LjosInstance {
    argsert('<string> <function>', [key, coerceCallback], arguments.length);
    if (!coerceCallback) {
      throw new LError('coerce callback must be provided');
    }
    // This noop tells ljos-parser about the existence of the option
    // represented by "keys", so that it can apply camel-case expansion
    // if needed:
    this.#options.key[key] = true;
    // Create coerce middleware
    const coerceMiddleware = (
      argv: Arguments,
      ljos: LjosInstance
    ): maybePromisePartialArgs => {
      let aliases: Dictionary<string[]>;

      // Skip coerce logic if related arg was not provided
      const shouldCoerce = Object.prototype.hasOwnProperty.call(argv, key);
      if (!shouldCoerce) {
        return argv;
      }

      return maybeAsyncResult<maybePromisePartialArgs | any>(
        // Get result of coerce callback
        () => {
          aliases = ljos.#getAliases();
          const result = coerceCallback(argv[key]);
          return result;
        },
        // Handle result of coerce callback
        (result: any): Partial<Arguments> => {
          argv[key] = result;
          for (const alias of aliases[key]) {
            argv[alias] = result;
          }
          return argv;
        },
        // Handle error of result callback
        (err: Error): maybePromisePartialArgs => {
          throw new LError(err.message);
        }
      );
    };
    // Set coerce middleware
    this.#middlewareInstance.addCoerceMiddleware(coerceMiddleware, key);
    return this;
  }

  /** Set conflicts for a key and other key(s) that should not be used with it */
  #conflicts(key1: string, conflictKeys: string[]): LjosInstance {
    argsert('<string> <array>', [key1, conflictKeys], arguments.length);
    this.#validationInstance.conflicts(key1, conflictKeys);
    return this;
  }

  // // To simplify the parsing of positionals in commands,
  // // we temporarily populate '--' rather than _, with arguments
  // // after the '--' directive. After the parse, we copy these back.
  // #copyDoubleDash(argv: Arguments): any {
  //   if (!argv._ || !argv['--']) return argv;
  //   // eslint-disable-next-line prefer-spread
  //   argv._.push.apply(argv._, argv['--']);
  //   // We catch an error here, in case someone has called Object.seal()
  //   // on the parsed object, see: https://github.com/babel/babel/pull/10733
  //   try {
  //     delete argv['--'];
  //     // eslint-disable-next-line no-empty
  //   } catch (_err) {}

  //   return argv;
  // }

  #createLogger(): LoggerInstance {
    return {
      log: (...args: any[]) => {
        if (!this.#hasParseCallback()) console.log(...args);
        this.#hasOutput = true;
        if (this.#output.length) this.#output += '\n';
        this.#output += args.join(' ');
      },
      error: (...args: any[]) => {
        if (!this.#hasParseCallback()) console.error(...args);
        this.#hasOutput = true;
        if (this.#output.length) this.#output += '\n';
        this.#output += args.join(' ');
      },
    };
  }

  #default(
    key: string | string[] | Dictionary<any>,
    value?: any,
    defaultDescription?: string
  ): LjosInstance {
    argsert(
      '<object|string|array> [*] [string]',
      [key, value, defaultDescription],
      arguments.length
    );
    if (defaultDescription) {
      assertSingleKey(key, this.#shim);
      this.#options.defaultDescription[key] = defaultDescription;
    }
    if (typeof value === 'function') {
      assertSingleKey(key, this.#shim);
      if (!this.#options.defaultDescription[key]) {
        this.#options.defaultDescription[key] =
          this.#usage.functionDescription(value);
      }
      value = value.call();
    }
    this.#populateParserHintSingleValueDictionary<'default'>(
      this.#default.bind(this),
      'default',
      key,
      value
    );
    return this;
  }

  #deleteFromParserHintObject(optionKey: string) {
    // delete from all parsing hints:
    // boolean, array, key, alias, etc.
    objectKeys(this.#options).forEach((hintKey: keyof Options) => {
      // configObjects is not a parsing hint array
      if (((key): key is 'configObjects' => key === 'configObjects')(hintKey)) {
        return;
      }
      const hint = this.#options[hintKey];
      if (Array.isArray(hint)) {
        if (hint.includes(optionKey)) hint.splice(hint.indexOf(optionKey), 1);
      } else if (typeof hint === 'object') {
        delete (hint as Dictionary)[optionKey];
      }
    });
    // now delete the description from usage.js.
    delete this.#usage.getDescriptions()[optionKey];
  }
  // /** Demand commands/options */
  // #demand(
  //   keys: string | string[] | Dictionary<string | undefined> | number,
  //   max?: number | string[] | string | true,
  //   msg?: string | true
  // ): LjosInstance {
  //   // You can optionally provide a 'max' key,
  //   // which will raise an exception if too many '_'
  //   // options are provided.
  //   if (Array.isArray(max)) {
  //     max.forEach(key => {
  //       assertNotStrictEqual(msg, true as const, this.#shim);
  //       this.#demandOption(key, msg);
  //     });
  //     max = Infinity;
  //   } else if (typeof max !== 'number') {
  //     msg = max;
  //     max = Infinity;
  //   }

  //   if (typeof keys === 'number') {
  //     assertNotStrictEqual(msg, true as const, this.#shim);
  //     this.demandCommand(keys, max, msg, msg);
  //   } else if (Array.isArray(keys)) {
  //     keys.forEach(key => {
  //       assertNotStrictEqual(msg, true as const, this.#shim);
  //       this.#demandOption(key, msg);
  //     });
  //   } else {
  //     if (typeof msg === 'string') {
  //       this.#demandOption(keys, msg);
  //     } else if (msg === true || typeof msg === 'undefined') {
  //       this.#demandOption(keys);
  //     }
  //   }

  //   return this;
  // }

  /** Demand an option */
  #demandOption(
    // keys: string | string[] | Dictionary<string | undefined>,
    key: string,
    msg?: string
  ): LjosInstance {
    argsert('<string> [string]', [key, msg], arguments.length);
    this.#populateParserHintSingleValueDictionary(
      this.#demandOption.bind(this),
      'demandedOptions',
      key,
      msg
    );
    return this;
  }

  #deprecateOption(option: string, message: string | boolean): LjosInstance {
    argsert('<string> [string|boolean]', [option, message], arguments.length);
    this.#options.deprecatedOptions[option] = message;
    return this;
  }

  #describe(
    key: string,
    description?: string
    // keys: string | string[] | Dictionary<string>,
  ): LjosInstance {
    argsert('<string> [string]', [key, description], arguments.length);
    this.#setKey(key, true);
    this.#usage.describe(key, description);
    return this;
  }

  #emitWarning(
    warning: string,
    type: string | undefined,
    deduplicationId: string
  ) {
    // prevent duplicate warning emissions
    if (!this.#emittedWarnings[deduplicationId]) {
      this.#shim.process.emitWarning(warning, type);
      this.#emittedWarnings[deduplicationId] = true;
    }
  }

  #freeze() {
    this.#frozens.push({
      options: this.#options,
      configObjects: this.#options.configObjects.slice(0),
      exitProcess: this.#exitProcess,
      groups: this.#groups,
      strict: this.#strict,
      strictCommands: this.#strictCommands,
      strictOptions: this.#strictOptions,
      completionCommand: this.#completionCommand,
      output: this.#output,
      exitError: this.#exitError!,
      hasOutput: this.#hasOutput,
      parsed: this.#parsed,
      parseFn: this.#parseFn!,
      parseContext: this.#parseContext,
    });
    this.#usage.freeze();
    this.#validationInstance.freeze();
    this.#commandInstance.freeze();
    this.#middlewareInstance.freeze();
  }

  #getAliases(): Dictionary<string[]> {
    return this.#parsed ? this.#parsed.aliases : {};
  }

  #getDemandedOptions(): Dictionary<string | undefined> {
    argsert([], 0);
    return this.#options.demandedOptions;
  }

  #getDemandedCommands(): DemandedCommandsMeta {
    argsert([], 0);
    return this.#options.demandedCommands;
  }

  #getDeprecatedOptions(): Dictionary<string | boolean | undefined> {
    argsert([], 0);
    return this.#options.deprecatedOptions;
  }

  #getDetectLocale(): boolean {
    return this.#detectLocale;
  }

  #getDollarZero(): string {
    let $0 = '';
    // ignore the node bin, specify this in your
    // bin file with #!/usr/bin/env node
    let default$0: string[];
    if (/\b(node|iojs|electron)(\.exe)?$/.test(this.#shim.process.argv()[0])) {
      default$0 = this.#shim.process.argv().slice(1, 2);
    } else {
      default$0 = this.#shim.process.argv().slice(0, 1);
    }

    $0 = default$0
      .map(x => {
        const b = this.#rebase(this.#cwd, x);
        return x.match(/^(\/|([a-zA-Z]:)?\\)/) && b.length < x.length ? b : x;
      })
      .join(' ')
      .trim();

    if (
      this.#shim.getEnv('_') &&
      this.#shim.getProcessArgvBin() === this.#shim.getEnv('_')
    ) {
      $0 = this.#shim
        .getEnv('_')!
        .replace(
          `${this.#shim.path.dirname(this.#shim.process.execPath())}/`,
          ''
        );
    }
    return $0;
  }

  #getExitProcess(): boolean {
    return this.#exitProcess;
  }

  /** Combine explicit and preserved groups. explicit groups should be first */
  #getGroups(): Dictionary<string[]> {
    return Object.assign({}, this.#groups, this.#preservedGroups);
  }

  #getOptions(): Options {
    return this.#options;
  }

  #getStrict(): boolean {
    return this.#strict;
  }

  #getStrictCommands(): boolean {
    return this.#strictCommands;
  }

  #getStrictOptions(): boolean {
    return this.#strictOptions;
  }

  #guessLocale() {
    if (!this.#detectLocale) return;
    const locale =
      this.#shim.getEnv('LC_ALL') ||
      this.#shim.getEnv('LC_MESSAGES') ||
      this.#shim.getEnv('LANG') ||
      this.#shim.getEnv('LANGUAGE') ||
      'en_US';
    this.locale(locale.replace(/[.:].*/, ''));
  }

  #guessVersion(): string {
    const obj = this.#pkgUp();
    return (obj.version as string) || 'unknown';
  }

  #hide(key: string): LjosInstance {
    argsert('<string>', [key], arguments.length);
    this.#options.hiddenOptions.push(key);
    return this;
  }

  // TODO: implies (position -- number)
  #implies(key: string, values: string[]): LjosInstance {
    argsert('<string> [array]', [key, values], arguments.length);
    this.#validationInstance.implies(key, values);
    return this;
  }

  #number(keys: string | string[]): LjosInstance {
    argsert('<array|string>', [keys], arguments.length);
    this.#populateParserHintArray('number', keys);
    this.#trackManuallySetKeys(keys);
    return this;
  }

  #normalize(keys: string | string[]): LjosInstance {
    argsert('<array|string>', [keys], arguments.length);
    this.#populateParserHintArray('normalize', keys);
    return this;
  }

  // We wait to coerce numbers for positionals until after the initial parse.
  // This allows commands to configure number parsing on a positional by
  // positional basis:
  #parsePositionalNumbers(argv: Arguments): any {
    const args: (string | number)[] = argv['--'] ? argv['--'] : argv._;

    for (let i = 0, arg; (arg = args[i]) !== undefined; i++) {
      if (
        looksLikeNumber(arg) &&
        Number.isSafeInteger(Math.floor(parseFloat(`${arg}`)))
      ) {
        args[i] = Number(arg);
      }
    }
    return argv;
  }

  #pkgUp(rootPath?: string) {
    const npath = rootPath || '*';
    if (this.#pkgs[npath]) return this.#pkgs[npath];

    let obj = {};
    try {
      let startDir = rootPath || this.#shim.mainFilename;

      // When called in an environment that lacks require.main.filename, such as a jest test runner,
      // startDir is already process.cwd(), and should not be shortened.
      // Whether or not it is _actually_ a directory (e.g., extensionless bin) is irrelevant, find-up handles it.
      if (!rootPath && this.#shim.path.extname(startDir)) {
        startDir = this.#shim.path.dirname(startDir);
      }

      const pkgJsonPath = this.#shim.findUp(
        startDir,
        (dir: string[], names: string[]) => {
          if (names.includes('package.json')) {
            return 'package.json';
          } else {
            return undefined;
          }
        }
      );
      assertNotStrictEqual(pkgJsonPath, undefined, this.#shim);
      obj = JSON.parse(this.#shim.readFileSync(pkgJsonPath, 'utf8'));
      // eslint-disable-next-line no-empty
    } catch (_noop) {}

    this.#pkgs[npath] = obj || {};
    return this.#pkgs[npath];
  }

  #populateParserHintArray<T extends KeyOf<Options, string[]>>(
    type: T,
    keys: string | string[]
  ) {
    keys = ([] as string[]).concat(keys);
    keys.forEach(key => {
      key = this.#santizeKey(key);
      this.#options[type].push(key);
    });
  }

  #populateParserHintSingleValueDictionary<
    T extends
      | Exclude<DictionaryKeyof<Options>, DictionaryKeyof<Options, any[]>>
      | 'default',
    K extends keyof Options[T] & string = keyof Options[T] & string,
    V extends ValueOf<Options[T]> = ValueOf<Options[T]>
  >(
    builder: (key: K, value: V, ...otherArgs: any[]) => LjosInstance,
    type: T,
    key: K | K[] | {[key in K]: V},
    value?: V
  ) {
    this.#populateParserHintDictionary<T, K, V>(
      builder,
      type,
      key,
      value,
      (type, key, value) => {
        this.#options[type][key] = value as ValueOf<Options[T]>;
      }
    );
  }

  #populateParserHintArrayDictionary<
    T extends DictionaryKeyof<Options, any[]>,
    K extends keyof Options[T] & string = keyof Options[T] & string,
    V extends ValueOf<ValueOf<Options[T]>> | ValueOf<ValueOf<Options[T]>>[] =
      | ValueOf<ValueOf<Options[T]>>
      | ValueOf<ValueOf<Options[T]>>[]
  >(
    builder: (key: K, value: V, ...otherArgs: any[]) => LjosInstance,
    type: T,
    key: K,
    // key: K | K[] | {[key in K]: V},
    value?: V
  ) {
    this.#populateParserHintDictionary<T, K, V>(
      builder,
      type,
      key,
      value,
      (type, key, value) => {
        this.#options[type][key] = (
          this.#options[type][key] || ([] as Options[T][keyof Options[T]])
        ).concat(value);
      }
    );
  }

  #populateParserHintDictionary<
    T extends keyof Options,
    K extends keyof Options[T],
    V
  >(
    builder: (key: K, value: V, ...otherArgs: any[]) => LjosInstance,
    type: T,
    key: K | K[] | {[key in K]: V},
    value: V | undefined,
    singleKeyHandler: (type: T, key: K, value?: V) => void
  ) {
    if (Array.isArray(key)) {
      // an array of keys with one value ['x', 'y', 'z'], function parse () {}
      key.forEach(k => {
        builder(k, value!);
      });
    } else if (
      ((key): key is {[key in K]: V} => typeof key === 'object')(key)
    ) {
      // an object of key value pairs: {'x': parse () {}, 'y': parse() {}}
      for (const k of objectKeys(key)) {
        builder(k, key[k]);
      }
    } else {
      singleKeyHandler(type, this.#santizeKey(key), value);
    }
  }

  // #require(
  //   keys: string | string[] | Dictionary<string | undefined> | number,
  //   max?: number | string[] | string | true,
  //   msg?: string | true
  // ): LjosInstance {
  //   return this.#demand(keys, max, msg);
  // }

  // // TODO: remove this ???
  // #requiresArg(keys: string | string[] | Dictionary): LjosInstance {
  //   // the 2nd paramter [number] in the argsert the assertion is mandatory
  //   // as populateParserHintSingleValueDictionary recursively calls requiresArg
  //   // with Nan as a 2nd parameter, although we ignore it
  //   argsert('<array|string|object> [number]', [keys], arguments.length);
  //   // If someone configures nargs at the same time as requiresArg,
  //   // nargs should take precedence,
  //   // TODO: make this work with aliases, using a check similar to
  //   // checkAllAliases() in ljos-parser.
  //   this.#populateParserHintSingleValueDictionary(
  //     this.#requiresArg.bind(this),
  //     'narg',
  //     keys,
  //     NaN
  //   );
  //   return this;
  // }

  #santizeKey(key: any) {
    if (key === '__proto__') return '___proto___';
    return key;
  }

  #setKey(
    key: string,
    set: boolean | string
    // set?: boolean | string
    // key: string | string[] | Dictionary<string | boolean>,
  ) {
    this.#populateParserHintSingleValueDictionary(
      this.#setKey.bind(this),
      'key',
      key,
      set
    );
    return this;
  }

  #string(keys: string | string[]): LjosInstance {
    argsert('<array|string>', [keys], arguments.length);
    this.#populateParserHintArray('string', keys);
    this.#trackManuallySetKeys(keys);
    return this;
  }

  #unfreeze() {
    const frozen = this.#frozens.pop();
    assertNotStrictEqual(frozen, undefined, this.#shim);
    let configObjects: Dictionary[];
    ({
      options: this.#options,
      configObjects,
      exitProcess: this.#exitProcess,
      groups: this.#groups,
      output: this.#output,
      exitError: this.#exitError,
      hasOutput: this.#hasOutput,
      parsed: this.#parsed,
      strict: this.#strict,
      strictCommands: this.#strictCommands,
      strictOptions: this.#strictOptions,
      completionCommand: this.#completionCommand,
      parseContext: this.#parseContext,
    } = frozen);
    this.#options.configObjects = configObjects;
    this.#usage.unfreeze();
    this.#validationInstance.unfreeze();
    this.#commandInstance.unfreeze();
    this.#middlewareInstance.unfreeze();
  }

  // If argv is a promise (which is possible if async middleware is used)
  // delay applying validation until the promise has resolved:
  #validateAsync(
    validation: (argv: Arguments) => void,
    argv: Arguments | Promise<Arguments>
  ): Arguments | Promise<Arguments> {
    return maybeAsyncResult<Arguments>(argv, result => {
      validation(result);
      return result;
    });
  }

  /** Note: methods used internally, do not depend on these externally */
  getInternalMethods(): LjosInternalMethods {
    return {
      // Options/positionals
      aliases: this.#aliases.bind(this),
      array: this.#array.bind(this),
      boolean: this.#boolean.bind(this),
      demandOption: this.#demandOption.bind(this),
      normalize: this.#normalize.bind(this),
      number: this.#number.bind(this),
      string: this.#string.bind(this),

      // Actions & mutations
      postProcess: this.#postProcess.bind(this),
      reset: this.#reset.bind(this),
      runValidation: this.#runValidation.bind(this),
      runLjosParserAndExecuteCommands:
        this.#runLjosParserAndExecuteCommands.bind(this),
      setHasOutput: this.#setHasOutput.bind(this),

      // Getters
      getAliases: this.#getAliases.bind(this),
      getCommandInstance: this.#getCommandInstance.bind(this),
      getContext: this.#getContext.bind(this),
      getDemandedOptions: this.#getDemandedOptions.bind(this),
      getDemandedCommands: this.#getDemandedCommands.bind(this),
      getDeprecatedOptions: this.#getDeprecatedOptions.bind(this),
      getDetectLocale: this.#getDetectLocale.bind(this),
      getExitProcess: this.#getExitProcess.bind(this),
      getGroups: this.#getGroups.bind(this),
      getHasOutput: this.#getHasOutput.bind(this),
      getIsGlobalContext: this.#getIsGlobalContext.bind(this),
      getLoggerInstance: this.#getLoggerInstance.bind(this),
      getOptions: this.#getOptions.bind(this),
      getParseContext: this.#getParseContext.bind(this),
      getParsed: this.#getParsed.bind(this),
      getStrict: this.#getStrict.bind(this),
      getStrictCommands: this.#getStrictCommands.bind(this),
      getStrictOptions: this.#getStrictOptions.bind(this),
      getUsageInstance: this.#getUsageInstance.bind(this),
      getValidationInstance: this.#getValidationInstance.bind(this),
      hasParseCallback: this.#hasParseCallback.bind(this),
    };
  }

  #getCommandInstance(): CommandInstance {
    return this.#commandInstance;
  }

  #getContext(): Context {
    return this.#context;
  }

  #getHasOutput(): boolean {
    return this.#hasOutput;
  }

  #getLoggerInstance(): LoggerInstance {
    return this.#loggerInstance;
  }

  #getParseContext(): Object {
    return this.#parseContext || {};
  }

  #getParsed(): DetailedArguments | false {
    return this.#parsed;
  }

  #getUsageInstance(): UsageInstance {
    return this.#usage;
  }

  #getValidationInstance(): ValidationInstance {
    return this.#validationInstance;
  }

  #hasParseCallback(): boolean {
    return !!this.#parseFn;
  }

  #getIsGlobalContext(): boolean {
    return this.#isGlobalContext;
  }

  // #postProcess<T extends Arguments | Promise<Arguments>>
  #postProcess(
    argv: Arguments | Promise<Arguments>,
    calledFromCommand: boolean,
    runGlobalMiddleware: boolean
  ): any {
    if (calledFromCommand) return argv;
    if (isPromise(argv)) return argv;
    argv = this.#parsePositionalNumbers(argv as Arguments);
    if (runGlobalMiddleware) {
      argv = applyMiddleware(
        argv,
        this,
        this.#middlewareInstance.getMiddleware(),
        false
      );
    }
    return argv;
  }

  /** Put ljos back into an initial state */
  #reset(aliases: Aliases = {}): LjosInstance {
    // This is used mainly for running commands in a breadth first manner
    this.#options = this.#options || ({} as Options);
    const tmpOptions = {} as Options;
    tmpOptions.local = this.#options.local || [];
    tmpOptions.configObjects = this.#options.configObjects || [];

    // If a key has been explicitly set as local,
    // we should reset it before passing options to command.
    const localLookup: Dictionary<boolean> = {};
    tmpOptions.local.forEach(l => {
      localLookup[l] = true;
      (aliases[l] || []).forEach(a => {
        localLookup[a] = true;
      });
    });

    // Add all groups not set to local to preserved groups
    Object.assign(
      this.#preservedGroups,
      Object.keys(this.#groups).reduce((acc, groupName) => {
        const keys = this.#groups[groupName].filter(
          key => !(key in localLookup)
        );
        if (keys.length > 0) {
          acc[groupName] = keys;
        }
        return acc;
      }, {} as Dictionary<string[]>)
    );
    // groups can now be reset
    this.#groups = {};

    const arrayOptions: KeyOf<Options, string[]>[] = [
      'array',
      'boolean',
      'string',
      'skipValidation',
      'count',
      'normalize',
      'number',
      'hiddenOptions',
    ];

    const objectOptions: DictionaryKeyof<Options>[] = [
      // 'narg',
      'key',
      'aliases',
      'default',
      'defaultDescription',
      // 'config',
      'choices',
      'demandedOptions',
      'demandedCommands',
      'deprecatedOptions',
    ];

    arrayOptions.forEach(k => {
      tmpOptions[k] = (this.#options[k] || []).filter(
        (k: string) => !localLookup[k]
      );
    });

    objectOptions.forEach(<K extends DictionaryKeyof<Options>>(k: K) => {
      tmpOptions[k] = objFilter(
        this.#options[k],
        k => !localLookup[k as string]
      );
    });

    // tmpOptions.envPrefix = this.#options.envPrefix;
    this.#options = tmpOptions;

    // If this is the first time being executed, create
    // instances of all our helpers -- otherwise just reset.
    this.#usage = this.#usage
      ? this.#usage.reset(localLookup)
      : Usage(this, this.#shim);
    this.#validationInstance = this.#validationInstance
      ? this.#validationInstance.reset(localLookup)
      : Validation(this, this.#usage, this.#shim);
    this.#commandInstance = this.#commandInstance
      ? this.#commandInstance.reset()
      : Command(
          this.#usage,
          this.#validationInstance,
          this.#middlewareInstance,
          this.#shim
        );
    if (!this.#completion) {
      this.#completion = Completion(
        this,
        this.#usage,
        this.#commandInstance,
        this.#shim
      );
    }
    this.#middlewareInstance.reset();

    this.#completionCommand = null;
    this.#output = '';
    this.#exitError = null;
    this.#hasOutput = false;
    this.#parsed = false;

    // Reset parser state
    this.#shim.Parser.reset();

    return this;
  }

  #rebase(base: string, dir: string): string {
    return this.#shim.path.relative(base, dir);
  }

  /** Recursively called to parse and update usage, will eventually run middleware and command handlers */
  #runLjosParserAndExecuteCommands(
    args: string | string[] | null,
    shortCircuit?: boolean | null,
    calledFromCommand?: boolean,
    commandIndex = 0,
    helpOnly = false
  ): Arguments | Promise<Arguments> {
    let skipValidation = !!calledFromCommand || helpOnly;
    args = args || this.#processArgs;

    this.#options.__ = this.#shim.y18n.__;

    // Parse executions
    // Check for help & version opts
    // (Conditional: shortCircuit) Check for completions

    const parsed = this.#shim.Parser.detailed(
      args,
      Object.assign({}, this.#options)
    ) as DetailedArguments;

    const argv: Arguments = Object.assign(
      parsed.argv,
      this.#parseContext
    ) as Arguments;
    let argvPromise: Arguments | Promise<Arguments> | undefined;
    const aliases = parsed.aliases;

    let helpOptSet = false;
    let versionOptSet = false;
    Object.keys(argv).forEach(key => {
      if (key === this.#helpOpt && argv[key]) {
        helpOptSet = true;
      } else if (key === this.#versionOpt && argv[key]) {
        versionOptSet = true;
      }
    });

    argv.$0 = this.$0;
    this.#parsed = parsed;

    // A single ljos instance may be used multiple times, e.g.
    // const l = ljos(); l.parse('foo --bar'); l.parse('bar --foo').
    // When a prior parse has completed and a new parse is beginning, we
    // need to clear the cached help message from the previous parse:
    if (commandIndex === 0) {
      this.#usage.clearCachedHelpMessage();
    }

    try {
      // Guess locale lazily, so that it can be turned off in chain.
      this.#guessLocale();

      // While building up the argv object, there are two passes through the parser.
      // If completion is being performed, short-circuit on the first pass.
      // Don't run global middleware when figuring out completion.
      if (shortCircuit) {
        return this.#postProcess(argv, !!calledFromCommand, false);
      }

      // if there's a handler associated with a command, defer processing to it.
      if (this.#helpOpt) {
        // Consider any multi-char helpOpt alias as a valid help command,
        // unless all helpOpt aliases are single-char
        // NOTE: parsed.aliases is a normalized bidirectional map :)
        const helpCmds = [this.#helpOpt]
          .concat(aliases[this.#helpOpt] || [])
          .filter(k => k.length > 1);
        // Check if help should trigger and strip it from _.
        if (helpCmds.includes('' + argv._[argv._.length - 1])) {
          argv._.pop();
          helpOptSet = true;
        }
      }

      this.#isGlobalContext = false;

      const handlerKeys = this.#commandInstance.getCommands();
      const requestCompletions = this.#completion!.completionKey in argv;
      const skipRecommendation = helpOptSet || requestCompletions || helpOnly;
      if (argv._.length) {
        if (handlerKeys.length) {
          let firstUnknownCommand;
          for (let i = commandIndex || 0, cmd; argv._[i] !== undefined; i++) {
            cmd = String(argv._[i]);
            if (handlerKeys.includes(cmd) && cmd !== this.#completionCommand) {
              // Commands are executed using a recursive algorithm that executes
              // the deepest command first; we keep track of the position in the
              // argv._ array that is currently being executed.
              const innerArgv = this.#commandInstance.runCommand(
                cmd,
                this,
                parsed,
                i + 1,
                // Don't run a handler, just figure out the help string:
                helpOnly,
                // Passed to builder so that expensive commands can be deferred:
                helpOptSet || versionOptSet || helpOnly
              );
              return this.#postProcess(innerArgv, !!calledFromCommand, false);
            } else if (
              !firstUnknownCommand &&
              cmd !== this.#completionCommand
            ) {
              firstUnknownCommand = cmd;
              break;
            }
          }
          // Recommend a command if recommendCommands() has
          // been enabled, and no commands were found to execute
          if (
            !this.#commandInstance.hasDefaultCommand() &&
            this.#recommendCommands &&
            firstUnknownCommand &&
            !skipRecommendation
          ) {
            this.#validationInstance.recommendCommands(
              firstUnknownCommand,
              handlerKeys
            );
          }
        }

        // Generate a completion script for adding to ~/.bashrc.
        if (
          this.#completionCommand &&
          argv._.includes(this.#completionCommand) &&
          !requestCompletions
        ) {
          if (this.#exitProcess) setBlocking(true);
          this.showCompletionScript();
          this.exit(0);
        }
      }

      if (this.#commandInstance.hasDefaultCommand() && !skipRecommendation) {
        const innerArgv = this.#commandInstance.runCommand(
          null,
          this,
          parsed,
          0,
          helpOnly,
          helpOptSet || versionOptSet || helpOnly
        );
        return this.#postProcess(innerArgv, !!calledFromCommand, false);
      }

      // We must run completions first, a user might
      // want to complete the --help or --version option.
      if (requestCompletions) {
        if (this.#exitProcess) setBlocking(true);

        // We allow for asynchronous completions,
        // eg: loading in a list of commands from an API.
        args = ([] as string[]).concat(args);
        const completionArgs = args.slice(
          args.indexOf(`--${this.#completion!.completionKey}`) + 1
        );
        this.#completion!.getCompletion(completionArgs, (err, completions) => {
          if (err) throw new LError(err.message);
          (completions || []).forEach(completion => {
            this.#loggerInstance.log(completion);
          });
          this.exit(0);
        });
        return this.#postProcess(
          argv,
          !!calledFromCommand,
          false // Don't run middleware when figuring out completion.
        );
      }

      // Handle 'help' and 'version' options
      // if we haven't already output help!
      if (!this.#hasOutput) {
        if (helpOptSet) {
          if (this.#exitProcess) setBlocking(true);
          skipValidation = true;
          this.showHelp('log');
          this.exit(0);
        } else if (versionOptSet) {
          if (this.#exitProcess) setBlocking(true);
          skipValidation = true;
          this.#usage.showVersion('log');
          this.exit(0);
        }
      }

      // Check if any of the options to skip validation were provided
      if (!skipValidation && this.#options.skipValidation.length > 0) {
        skipValidation = Object.keys(argv).some(
          key =>
            this.#options.skipValidation.indexOf(key) >= 0 && argv[key] === true
        );
      }

      // If the help or version options were used and exitProcess is false,
      // or if explicitly skipped, we won't run validations.
      if (!skipValidation) {
        if (parsed.error) throw new LError(parsed.error.message);

        // If executed via bash completion, don't bother with validation.
        if (!requestCompletions) {
          const validation = this.#runValidation(aliases, {}, parsed.error);
          if (!calledFromCommand) {
            argvPromise = applyMiddleware(
              argv,
              this,
              this.#middlewareInstance.getMiddleware(),
              true
            );
          }
          argvPromise = this.#validateAsync(validation, argvPromise ?? argv);
          if (isPromise(argvPromise) && !calledFromCommand) {
            argvPromise = argvPromise.then(() => {
              return applyMiddleware(
                argv,
                this,
                this.#middlewareInstance.getMiddleware(),
                false
              );
            });
          }
        }
      }
    } catch (err) {
      if (err instanceof LError) this.#usage.fail(err.message, err);
      else throw err;
    }

    return this.#postProcess(argvPromise ?? argv, !!calledFromCommand, true);
  }

  #runValidation(
    aliases: Dictionary<string[]>,
    positionalMap: Dictionary<string[]>,
    parseErrors: Error | null,
    isDefaultCommand?: boolean
  ): (argv: Arguments) => void {
    const demandedOptions = {...this.#getDemandedOptions()};
    return (argv: Arguments) => {
      if (parseErrors) throw new LError(parseErrors.message);
      this.#validationInstance.nonOptionCount(argv);
      this.#validationInstance.requiredArguments(argv, demandedOptions);
      let failedStrictCommands = false;
      if (this.#strictCommands) {
        failedStrictCommands = this.#validationInstance.unknownCommands(argv);
      }
      if (this.#strict && !failedStrictCommands) {
        this.#validationInstance.unknownArguments(
          argv,
          aliases,
          positionalMap,
          !!isDefaultCommand
        );
      } else if (this.#strictOptions) {
        this.#validationInstance.unknownArguments(
          argv,
          aliases,
          {},
          false,
          false
        );
      }
      this.#validationInstance.limitedChoices(argv);
      this.#validationInstance.implications(argv);
      this.#validationInstance.conflicting(argv);
    };
  }

  #setHasOutput() {
    this.#hasOutput = true;
  }

  #trackManuallySetKeys(keys: string | string[]) {
    if (typeof keys === 'string') {
      this.#options.key[keys] = true;
    } else {
      for (const k of keys) {
        this.#options.key[k] = true;
      }
    }
  }
}

export function isLjosInstance(y: LjosInstance | void): y is LjosInstance {
  return !!y && typeof y.getInternalMethods === 'function';
}

/** Ljos' context. */
export interface Context {
  commands: string[];
  fullCommands: string[];
}

interface LoggerInstance {
  error: Function;
  log: Function;
}

type DemandedCommandsMeta = Dictionary<{
  min: number;
  max: number;
  minMsg?: string | null;
  maxMsg?: string | null;
}>;

export interface Options extends ParserOptions {
  __: (format: any, ...param: any[]) => string;
  aliases: Dictionary<string[]>;
  array: string[];
  boolean: string[];
  choices: Dictionary<string[]>;
  // config: Dictionary<boolean>;
  configObjects: Dictionary[];
  count: string[];
  defaultDescription: Dictionary<string | undefined>;
  demandedCommands: DemandedCommandsMeta;
  demandedOptions: Dictionary<string | undefined>;
  deprecatedOptions: Dictionary<string | boolean | undefined>;
  hiddenOptions: string[];
  /** Manually set keys */
  key: Dictionary<boolean | string>;
  local: string[];
  normalize: string[];
  number: string[];
  showHiddenOpt: string;
  skipValidation: string[];
  string: string[];
}

export interface OptionDefinition {
  aliases?: string[];
  array?: boolean;
  boolean?: boolean;
  choices?: string[];
  coerce?: CoerceCallback;
  conflicts?: string[];
  count?: boolean;
  default?: any;
  defaultDescription?: string;
  deprecated?: string | boolean;
  desc?: string;
  global?: boolean;
  group?: string;
  hidden?: boolean;
  implies?: string[];
  nargs?: number;
  normalize?: boolean;
  number?: boolean;
  required?: string | true;
  // requiresArg?: boolean;
  skipValidation?: boolean;
  string?: boolean;
  type?: 'array' | 'boolean' | 'count' | 'number' | 'string';
}

interface PositionalDefinition
  extends Pick<
    OptionDefinition,
    | 'aliases'
    | 'array'
    | 'coerce'
    | 'choices'
    | 'conflicts'
    | 'default'
    | 'defaultDescription'
    | 'desc'
    | 'implies'
    | 'normalize'
    | 'required'
  > {
  type?: 'boolean' | 'number' | 'string';
}

interface FrozenLjosInstance {
  options: Options;
  configObjects: Dictionary[];
  exitProcess: boolean;
  groups: Dictionary<string[]>;
  strict: boolean;
  strictCommands: boolean;
  strictOptions: boolean;
  completionCommand: string | null;
  output: string;
  exitError: LError | string | Nil;
  hasOutput: boolean;
  parsed: DetailedArguments | false;
  parseFn: ParseCallback | null;
  parseContext: object | null;
}

interface CommandConfig {
  // middleware: Middleware[];
  middleware: MiddlewareInput[];
  aliases: string[];
  deprecated: boolean;
}

interface ParseCallback {
  (err: LError | string | Nil, argv: Arguments, output: string): void;
}

interface Aliases {
  [key: string]: string[];
}

export interface Arguments {
  /** The script name or node command */
  $0: string;
  /** Non-option arguments */
  _: ArgsOutput;
  /** Arguments after the end-of-options flag `--` */
  '--'?: ArgsOutput;
  /** All remaining options */
  [argName: string]: any;
}

export interface DetailedArguments extends ParserDetailedArguments {
  argv: Arguments;
  aliases: Dictionary<string[]>;
}

function noop() {}

export type maybePromisePartialArgs =
  | Partial<Arguments>
  | Promise<Partial<Arguments>>;
export type maybePromiseArgs = Arguments | Promise<Arguments>;
