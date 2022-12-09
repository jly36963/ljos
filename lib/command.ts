import {
  assertNotStrictEqual,
  Dictionary,
  PlatformShim,
} from './typings/common-types.js';
import {isPromise} from './utils/is-promise.js';
import {
  applyMiddleware,
  MiddlwareInstance,
  Middleware,
  MiddlewareInput,
  checkFunc,
} from './middleware.js';
import {parseCommand, Positional} from './parse-command.js';
import {UsageInstance} from './usage.js';
import {ValidationInstance} from './validation.js';
import {
  Arguments,
  Context,
  DetailedArguments,
  isLjosInstance,
  LjosInstance,
  Options,
} from './ljos-factory.js';
import {maybeAsyncResult} from './utils/maybe-async-result.js';
import {camelCase} from './utils/strings';

const DEFAULT_MARKER = /(^\*)|(^\$0)/;
export type DefinitionOrCommandName = string | CommandHandlerDefinition;

interface AliasesAndInnerArgv {
  aliases: Dictionary<string[]>;
  innerArgv: Arguments;
}

export class CommandInstance {
  shim: PlatformShim;
  requireCache: Set<string> = new Set();
  handlers: Dictionary<CommandHandler> = {};
  aliasMap: Dictionary<string> = {};
  defaultCommand?: CommandHandler;
  usageInstance: UsageInstance;
  middlewareInstance: MiddlwareInstance;
  validationInstance: ValidationInstance;
  // Used to cache state from prior invocations of commands.
  // This allows the parser to push and pop state when running
  // a nested command:
  frozens: FrozenCommandInstance[] = [];
  constructor(
    usageInstance: UsageInstance,
    validationInstance: ValidationInstance,
    middlewareInstance: MiddlwareInstance,
    shim: PlatformShim
  ) {
    this.shim = shim;
    this.usageInstance = usageInstance;
    this.middlewareInstance = middlewareInstance;
    this.validationInstance = validationInstance;
  }

  // addDirectory(
  //   dir: string,
  //   req: Function,
  //   callerFile: string,
  //   opts?: RequireDirectoryOptions
  // ): void {
  //   opts = opts || {};

  //   // Disable recursion to support nested directories of subcommands
  //   if (typeof opts.recurse !== 'boolean') opts.recurse = false;
  //   // exclude 'json', 'coffee' from require-directory defaults
  //   if (!Array.isArray(opts.extensions)) opts.extensions = ['js'];
  //   // allow consumer to define their own visitor function
  //   const parentVisit =
  //     typeof opts.visit === 'function' ? opts.visit : (o: any) => o;
  //   // call addHandler via visitor function
  //   opts.visit = (obj, joined, filename) => {
  //     const visited = parentVisit(obj, joined, filename);
  //     // allow consumer to skip modules with their own visitor
  //     if (visited) {
  //       // check for cyclic reference:
  //       if (this.requireCache.has(joined)) return visited;
  //       else this.requireCache.add(joined);
  //       this.addHandler(visited);
  //     }
  //     return visited;
  //   };
  //   this.shim.requireDirectory({require: req, filename: callerFile}, dir, opts);
  // }

  addHandler(
    cmd: string,
    desc: CommandHandler['desc'],
    builder: CommandBuilderCallback,
    handler: CommandHandlerCallback,
    middleware: Middleware[] = [],
    deprecated = false,
    aliases: string[] = []
  ): void {
    // handler = handler || (() => {});
    // aliases = aliases || [];

    let commandAndAliases: string[] = [cmd];

    if (aliases?.length) {
      commandAndAliases = commandAndAliases.concat(aliases);
    }

    // The 'cmd' provided was a string, we apply the command DSL:
    // https://github.com/ljos/ljos/blob/main/docs/advanced.md#advanced-topics

    // Parse positionals out of cmd string
    const parsedCommand = parseCommand(cmd);

    // Remove positional args from aliases only
    aliases = aliases.map(alias => parseCommand(alias).cmd);

    // Check for default and filter out '*'
    let isDefault = false;
    const parsedAliases = [parsedCommand.cmd].concat(aliases).filter(c => {
      if (DEFAULT_MARKER.test(c)) {
        isDefault = true;
        return false;
      }
      return true;
    });

    // Standardize on $0 for default command.
    if (parsedAliases.length === 0 && isDefault) parsedAliases.push('$0');

    // Shift cmd and aliases after filtering out '*'
    if (isDefault) {
      parsedCommand.cmd = parsedAliases[0];
      aliases = parsedAliases.slice(1);
      cmd = cmd.replace(DEFAULT_MARKER, parsedCommand.cmd);
    }

    // Populate aliasMap
    aliases.forEach(alias => {
      this.aliasMap[alias] = parsedCommand.cmd;
    });

    if (desc !== false) {
      this.usageInstance.command(cmd, desc, isDefault, aliases, deprecated);
    }

    this.handlers[parsedCommand.cmd] = {
      original: cmd,
      desc,
      handler,
      builder,
      middleware,
      deprecated,
      demanded: parsedCommand.demanded,
      optional: parsedCommand.optional,
    };

    if (isDefault) this.defaultCommand = this.handlers[parsedCommand.cmd];
  }

  getCommandHandlers(): Dictionary<CommandHandler> {
    return this.handlers;
  }

  getCommands(): string[] {
    return Object.keys(this.handlers).concat(Object.keys(this.aliasMap));
  }

  hasDefaultCommand(): boolean {
    return !!this.defaultCommand;
  }

  /** Apply builder, update usage, recursively parse, apply middleware, validate, get result */
  runCommand(
    command: string | null, // null if default command
    ljos: LjosInstance,
    parsed: DetailedArguments,
    commandIndex: number,
    helpOnly: boolean,
    helpOrVersionSet: boolean
  ): Arguments | Promise<Arguments> {
    const commandHandler =
      this.handlers[command!] ||
      this.handlers[this.aliasMap[command!]] ||
      this.defaultCommand;
    const currentContext = ljos.getInternalMethods().getContext();
    const parentCommands = currentContext.commands.slice();
    const isDefaultCommand = !command;
    if (command) {
      currentContext.commands.push(command);
      currentContext.fullCommands.push(commandHandler.original);
    }
    const builderResult = this.applyBuilderUpdateUsageAndParse(
      isDefaultCommand,
      commandHandler,
      ljos,
      parsed.aliases,
      parentCommands,
      commandIndex,
      helpOnly,
      helpOrVersionSet
    );
    // Will only reach here once recusive parse has reached the inner-most matching command
    return isPromise(builderResult)
      ? builderResult.then(result =>
          this.#applyMiddlewareAndGetResult(
            isDefaultCommand,
            commandHandler,
            result.innerArgv,
            currentContext,
            helpOnly,
            result.aliases,
            ljos
          )
        )
      : this.#applyMiddlewareAndGetResult(
          isDefaultCommand,
          commandHandler,
          builderResult.innerArgv,
          currentContext,
          helpOnly,
          builderResult.aliases,
          ljos
        );
  }

  /** Apply builder, update usage, recursively parse */
  private applyBuilderUpdateUsageAndParse(
    isDefaultCommand: boolean,
    commandHandler: CommandHandler,
    ljos: LjosInstance,
    aliases: Dictionary<string[]>,
    parentCommands: string[],
    commandIndex: number,
    helpOnly: boolean,
    helpOrVersionSet: boolean
  ): AliasesAndInnerArgv | Promise<AliasesAndInnerArgv> {
    const builder = commandHandler.builder;
    let innerLjos: LjosInstance = ljos;
    // A builder function, which builds up a ljos chain and possibly returns it.
    const builderOutput = builder(
      ljos.getInternalMethods().reset(aliases),
      helpOrVersionSet
    );
    return isPromise(builderOutput)
      ? builderOutput.then(output => {
          innerLjos = isLjosInstance(output) ? output : ljos;
          return this.updateUsageAndParse(
            isDefaultCommand,
            commandHandler,
            innerLjos,
            parentCommands,
            commandIndex,
            helpOnly
          );
        })
      : this.updateUsageAndParse(
          isDefaultCommand,
          commandHandler,
          innerLjos,
          parentCommands,
          commandIndex,
          helpOnly
        );
  }

  /** Update usage, recursively call runLjosParserAndExecuteCommands, return aliases and innerArgv */
  private updateUsageAndParse(
    isDefaultCommand: boolean,
    commandHandler: CommandHandler,
    innerLjos: LjosInstance,
    parentCommands: string[],
    commandIndex: number,
    helpOnly: boolean
  ): AliasesAndInnerArgv | Promise<AliasesAndInnerArgv> {
    // A null command indicates we are running the default command,
    // if this is the case, we should show the root usage instructions
    // rather than the usage instructions for the nested default command:
    if (isDefaultCommand) {
      innerLjos.getInternalMethods().getUsageInstance().unfreeze(true);
    }
    if (this.shouldUpdateUsage(innerLjos)) {
      innerLjos
        .getInternalMethods()
        .getUsageInstance()
        .usage(
          this.usageFromParentCommandsCommandHandler(
            parentCommands,
            commandHandler
          ),
          commandHandler.desc
        );
    }
    const innerArgv = innerLjos
      .getInternalMethods()
      .runLjosParserAndExecuteCommands(
        null,
        undefined,
        true,
        commandIndex,
        helpOnly
      );

    return isPromise(innerArgv)
      ? innerArgv.then(argv => ({
          aliases: (
            innerLjos.getInternalMethods().getParsed() as DetailedArguments
          ).aliases,
          innerArgv: argv,
        }))
      : {
          aliases: (
            innerLjos.getInternalMethods().getParsed() as DetailedArguments
          ).aliases,
          innerArgv,
        };
  }

  private shouldUpdateUsage(ljos: LjosInstance) {
    return (
      !ljos.getInternalMethods().getUsageInstance().getUsageDisabled() &&
      ljos.getInternalMethods().getUsageInstance().getUsage().length === 0
    );
  }

  private usageFromParentCommandsCommandHandler(
    parentCommands: string[],
    commandHandler: CommandHandler
  ) {
    const c = DEFAULT_MARKER.test(commandHandler.original)
      ? commandHandler.original.replace(DEFAULT_MARKER, '').trim()
      : commandHandler.original;
    const pc = parentCommands.filter(c => {
      return !DEFAULT_MARKER.test(c);
    });
    pc.push(c);
    return `$0 ${pc.join(' ')}`;
  }

  private handleValidationAndGetResult(
    isDefaultCommand: boolean,
    commandHandler: CommandHandler,
    innerArgv: Arguments | Promise<Arguments>,
    currentContext: Context,
    aliases: Dictionary<string[]>,
    ljos: LjosInstance,
    middlewares: Middleware[],
    positionalMap: Dictionary<string[]>
  ) {
    // we apply validation post-hoc, so that custom
    // checks get passed populated positional arguments.
    if (!ljos.getInternalMethods().getHasOutput()) {
      const validation = ljos
        .getInternalMethods()
        .runValidation(
          aliases,
          positionalMap,
          (ljos.getInternalMethods().getParsed() as DetailedArguments).error,
          isDefaultCommand
        );
      innerArgv = maybeAsyncResult<Arguments>(innerArgv, result => {
        validation(result);
        return result;
      });
    }

    if (commandHandler.handler && !ljos.getInternalMethods().getHasOutput()) {
      ljos.getInternalMethods().setHasOutput();
      // to simplify the parsing of positionals in commands,
      // we temporarily populate '--' rather than _, with arguments
      ljos.getInternalMethods().postProcess(innerArgv, false, false);

      innerArgv = applyMiddleware(innerArgv, ljos, middlewares, false);

      innerArgv = maybeAsyncResult<Arguments>(
        innerArgv,
        (result: Arguments) => {
          const handlerResult = commandHandler.handler(result as Arguments);
          return isPromise(handlerResult)
            ? handlerResult.then(() => result)
            : result;
        }
      );

      if (!isDefaultCommand) {
        ljos.getInternalMethods().getUsageInstance().cacheHelpMessage();
      }

      if (
        isPromise(innerArgv) &&
        !ljos.getInternalMethods().hasParseCallback()
      ) {
        innerArgv.catch(error => {
          try {
            ljos.getInternalMethods().getUsageInstance().fail(null, error);
          } catch (_err) {
            // If .fail(false) is not set, and no parse cb() has been
            // registered, run usage's default fail method.
          }
        });
      }
    }

    if (!isDefaultCommand) {
      currentContext.commands.pop();
      currentContext.fullCommands.pop();
    }

    return innerArgv;
  }

  #applyMiddlewareAndGetResult(
    isDefaultCommand: boolean,
    commandHandler: CommandHandler,
    innerArgv: Arguments,
    currentContext: Context,
    helpOnly: boolean,
    aliases: Dictionary<string[]>,
    ljos: LjosInstance
  ): Arguments | Promise<Arguments> {
    let positionalMap: Dictionary<string[]> = {};
    // If showHelp() or getHelp() is being run, we should not
    // execute middleware or handlers (these may perform expensive operations
    // like creating a DB connection).
    if (helpOnly) return innerArgv;
    if (!ljos.getInternalMethods().getHasOutput()) {
      positionalMap = this.populatePositionals(
        commandHandler,
        innerArgv as Arguments,
        currentContext,
        ljos
      );
    }
    const middlewares = this.middlewareInstance
      .getMiddleware()
      .slice(0)
      .concat(commandHandler.middleware);

    const maybePromiseArgv = applyMiddleware(
      innerArgv,
      ljos,
      middlewares,
      true
    );

    return isPromise(maybePromiseArgv)
      ? maybePromiseArgv.then(resolvedInnerArgv =>
          this.handleValidationAndGetResult(
            isDefaultCommand,
            commandHandler,
            resolvedInnerArgv,
            currentContext,
            aliases,
            ljos,
            middlewares,
            positionalMap
          )
        )
      : this.handleValidationAndGetResult(
          isDefaultCommand,
          commandHandler,
          maybePromiseArgv,
          currentContext,
          aliases,
          ljos,
          middlewares,
          positionalMap
        );
  }

  /** Transcribe all positional arguments "command <foo> <bar> [apple]" onto argv. */
  private populatePositionals(
    commandHandler: CommandHandler,
    argv: Arguments,
    context: Context,
    ljos: LjosInstance
  ) {
    argv._ = argv._.slice(context.commands.length); // nuke the current commands
    const demanded = commandHandler.demanded.slice(0);
    const optional = commandHandler.optional.slice(0);
    const positionalMap: Dictionary<string[]> = {};

    this.validationInstance.positionalCount(demanded.length, argv._.length);

    while (demanded.length) {
      const demand = demanded.shift()!;
      this.populatePositional(demand, argv, positionalMap);
    }

    while (optional.length) {
      const maybe = optional.shift()!;
      this.populatePositional(maybe, argv, positionalMap);
    }

    argv._ = context.commands.concat(argv._.map(a => '' + a));

    this.postProcessPositionals(
      argv,
      positionalMap,
      this.cmdToParseOptions(commandHandler.original),
      ljos
    );

    return positionalMap;
  }

  private populatePositional(
    positional: Positional,
    argv: Arguments,
    positionalMap: Dictionary<string[]>
  ) {
    const cmd = positional.cmd[0];
    if (positional.variadic) {
      positionalMap[cmd] = argv._.splice(0).map(String);
    } else {
      if (argv._.length) positionalMap[cmd] = [String(argv._.shift())];
    }
  }

  // Based on parsing variadic markers '...', demand syntax '<foo>', etc.,
  // populate parser hints:
  public cmdToParseOptions(cmdString: string): Positionals {
    const parseOptions: Positionals = {
      array: [],
      default: {},
      aliases: {},
      required: {},
    };

    const parsed = parseCommand(cmdString);
    parsed.demanded.forEach(d => {
      const [cmd, ...aliases] = d.cmd;
      if (d.variadic) {
        parseOptions.array.push(cmd);
        parseOptions.default[cmd] = [];
      }
      parseOptions.aliases[cmd] = aliases;
      parseOptions.required[cmd] = true;
    });

    parsed.optional.forEach(o => {
      const [cmd, ...aliases] = o.cmd;
      if (o.variadic) {
        parseOptions.array.push(cmd);
        parseOptions.default[cmd] = [];
      }
      parseOptions.aliases[cmd] = aliases;
    });

    return parseOptions;
  }

  // We run ljos-parser against the positional arguments
  // applying the same parsing logic used for flags.
  private postProcessPositionals(
    argv: Arguments,
    positionalMap: Dictionary<string[]>,
    parseOptions: Positionals, // TODO: convert string[] -> ArrayOption[]
    ljos: LjosInstance
  ) {
    // Combine the parsing hints we've inferred from the command
    // string with explicitly configured parsing hints.
    const options = Object.assign({}, ljos.getInternalMethods().getOptions());
    options.default = Object.assign(parseOptions.default, options.default);
    for (const key of Object.keys(parseOptions.aliases)) {
      options.aliases[key] = (options.aliases[key] || []).concat(
        parseOptions.aliases[key]
      );
    }
    options.array = options.array.concat(parseOptions.array);
    // options.config = {}; // Don't load config when processing positionals.

    const unparsed: string[] = [];
    Object.keys(positionalMap).forEach(key => {
      positionalMap[key].map(value => {
        unparsed.push(`--${key}`);
        unparsed.push(value);
      });
    });

    // Short-circuit parse.
    if (!unparsed.length) return;

    const parsed = this.shim.Parser.detailed(
      unparsed,
      Object.assign({}, options)
    );

    if (parsed.error) {
      ljos
        .getInternalMethods()
        .getUsageInstance()
        .fail(parsed.error.message, parsed.error);
    } else {
      // only copy over positional keys (don't overwrite
      // flag arguments that were already parsed).
      const positionalKeys = Object.keys(positionalMap);
      Object.keys(positionalMap).forEach(key => {
        positionalKeys.push(...parsed.aliases[key]);
      });

      Object.keys(parsed.argv).forEach(key => {
        if (positionalKeys.includes(key)) {
          // any new aliases need to be placed in positionalMap, which
          // is used for validation.
          if (!positionalMap[key]) positionalMap[key] = parsed.argv[key];
          // Addresses: https://github.com/ljos/ljos/issues/1637
          // If both positionals/options provided,
          // and no default or config values were set for that key,
          // and if at least one is an array: don't overwrite, combine.
          if (
            !this.isInConfigs(ljos, key) &&
            !this.isDefaulted(ljos, key) &&
            Object.prototype.hasOwnProperty.call(argv, key) &&
            Object.prototype.hasOwnProperty.call(parsed.argv, key) &&
            (Array.isArray(argv[key]) || Array.isArray(parsed.argv[key]))
          ) {
            argv[key] = ([] as string[]).concat(argv[key], parsed.argv[key]);
          } else {
            argv[key] = parsed.argv[key];
          }
        }
      });
    }
  }

  // Check defaults for key (and camel case version of key)
  isDefaulted(ljos: LjosInstance, key: string): boolean {
    const {default: defaults} = ljos.getInternalMethods().getOptions();
    return (
      Object.prototype.hasOwnProperty.call(defaults, key) ||
      Object.prototype.hasOwnProperty.call(defaults, camelCase(key))
    );
  }

  // Check each config for key (and camel case version of key)
  isInConfigs(ljos: LjosInstance, key: string): boolean {
    const {configObjects} = ljos.getInternalMethods().getOptions();
    return (
      configObjects.some(c => Object.prototype.hasOwnProperty.call(c, key)) ||
      configObjects.some(c =>
        Object.prototype.hasOwnProperty.call(c, camelCase(key))
      )
    );
  }

  runDefaultBuilderOn(ljos: LjosInstance): unknown | Promise<unknown> {
    if (!this.defaultCommand) return;
    if (this.shouldUpdateUsage(ljos)) {
      // build the root-level command string from the default string.
      const commandString = DEFAULT_MARKER.test(this.defaultCommand.original)
        ? this.defaultCommand.original
        : this.defaultCommand.original.replace(/^[^[\]<>]*/, '$0 ');
      ljos
        .getInternalMethods()
        .getUsageInstance()
        .usage(commandString, this.defaultCommand.desc);
    }
    const builder = this.defaultCommand.builder;
    return builder(ljos, true);
  }

  // // Lookup module object from require()d command and derive name
  // // if module was not require()d and no name given, throw error
  // private moduleName(obj: CommandHandlerDefinition) {
  //   const mod = whichModule(obj);
  //   if (!mod) {
  //     throw new Error(
  //       `No command name given for module: ${this.shim.inspect(obj)}`
  //     );
  //   }
  //   return this.commandFromFilename(mod.filename);
  // }

  // private commandFromFilename(filename: string) {
  //   return this.shim.path.basename(filename, this.shim.path.extname(filename));
  // }

  // private extractDesc({description}: CommandHandlerDefinition) {
  //   return typeof description === 'string' || description === false
  //     ? description
  //     : false;
  // }

  // Push/pop the current command configuration:
  freeze(): void {
    this.frozens.push({
      handlers: this.handlers,
      aliasMap: this.aliasMap,
      defaultCommand: this.defaultCommand,
    });
  }

  unfreeze(): void {
    const frozen = this.frozens.pop();
    assertNotStrictEqual(frozen, undefined, this.shim);
    ({
      handlers: this.handlers,
      aliasMap: this.aliasMap,
      defaultCommand: this.defaultCommand,
    } = frozen);
  }

  // Revert to initial state:
  reset(): CommandInstance {
    this.handlers = {};
    this.aliasMap = {};
    this.defaultCommand = undefined;
    this.requireCache = new Set();
    return this;
  }
}

// Adds support to ljos for lazy loading a hierarchy of commands:
export function command(
  usage: UsageInstance,
  validation: ValidationInstance,
  middlewareInstance: MiddlwareInstance,
  shim: PlatformShim
): CommandInstance {
  return new CommandInstance(usage, validation, middlewareInstance, shim);
}

/** User-provided command handler, to be converted into internal command handler */
export interface CommandHandlerDefinition
  extends Pick<CommandHandler, 'deprecated' | 'desc' | 'handler'> {
  cmd: string;
  builder: CommandBuilderCallback;
  aliases?: string[];
  transforms?: MiddlewareInput[];
  checks: checkFunc[];
}

// export interface CommandBuilderDefinition {
//   builder?: CommandBuilderCallback;
//   deprecated?: boolean;
//   handler: CommandHandlerCallback;
//   middlewares?: Middleware[];
// }

// export function isCommandBuilderDefinition(
//   builder?: CommandBuilder | CommandBuilderDefinition
// ): builder is CommandBuilderDefinition {
//   return (
//     typeof builder === 'object' &&
//     !!(builder as CommandBuilderDefinition).builder &&
//     typeof (builder as CommandBuilderDefinition).handler === 'function'
//   );
// }

export interface CommandHandlerCallback {
  (argv: Arguments): any;
}

export interface CommandHandler {
  builder: CommandBuilderCallback;
  demanded: Positional[];
  deprecated?: boolean;
  desc: string | false;
  handler: CommandHandlerCallback;
  middleware: Middleware[];
  optional: Positional[];
  original: string;
}

// // To be completed later with other CommandBuilder flavours
// export type CommandBuilder =
//   | CommandBuilderCallback
//   | Dictionary<OptionDefinition>;

export interface CommandBuilderCallback {
  (y: LjosInstance, helpOrVersionSet: boolean): LjosInstance | void;
}

// function isCommandAndAliases(
//   cmd: DefinitionOrCommandName[]
// ): cmd is [CommandHandlerDefinition, ...string[]] {
//   return cmd.every(c => typeof c === 'string');
// }

// export function isCommandBuilderCallback(
//   builder: CommandBuilder
// ): builder is CommandBuilderCallback {
//   return typeof builder === 'function';
// }

// function isCommandBuilderOptionDefinitions(
//   builder: CommandBuilder
// ): builder is Dictionary<OptionDefinition> {
//   return typeof builder === 'object';
// }

/** Checks that command handler is an object, but not an array */
export function isCommandHandlerDefinition(
  cmd: DefinitionOrCommandName | [DefinitionOrCommandName, ...string[]]
): cmd is CommandHandlerDefinition {
  return typeof cmd === 'object' && !Array.isArray(cmd);
}

interface Positionals extends Pick<Options, 'aliases' | 'array' | 'default'> {
  required: Dictionary<boolean>;
}

type FrozenCommandInstance = {
  handlers: Dictionary<CommandHandler>;
  aliasMap: Dictionary<string>;
  defaultCommand: CommandHandler | undefined;
};
