# Ljos

Ljósið -- Light

## Description

Ljos aims to be like yargs, but simplified and built around parseArgs.

## Installation

TODO: put on npm once stable

```sh
npm i ljos
```

## Examples

### Simple

```js
const input = "greet Jimmy";

ljos()
  .command({
    cmd: "greet <name>",
    desc: "greet command description",
    builder: (ljos) =>
      ljos.positional("name", { type: "string", required: true }),
    handler: (argv) => {
      const { name } = argv;
      console.log(`Hey there, ${name}!`);
    },
  })
  .parse(input);
```

```
Hey there, Jimmy!
```

### Default command

```js
const input = "Carl";

ljos()
  .command({
    cmd: "$0 <name>",
    desc: "default command description",
    builder: (ljos) =>
      ljos.positional("name", { type: "string", required: true }),
    handler: (argv) => {
      const { name } = argv;
      console.log(`Hey there, ${name}!`);
    },
  })
  .parse(input);
```

```
Hey there, Carl!
```

### Optional

```js
const input = "greet";

ljos()
  .command({
    cmd: "greet [name]",
    desc: "greet command description",
    builder: (ljos) => ljos.positional("name", { type: "string" }),
    handler: (argv) => {
      const { name = "friend" } = argv;
      console.log(`Hey there, ${name}!`);
    },
  })
  .parse(input);
```

```
Hey there, friend!
```

### Input sources

```js
const inputs = {
  "from-process-argv": process.argv.slice(2), // node my-app.js add 3 4
  "from-string": "add 2 3",
  "from-array": ["add", "5", "6"],
};

const program = ljos()
  .command({
    cmd: "add <a> <b>",
    desc: "add command description",
    builder: (ljos) =>
      ljos
        .positional("a", { type: "number", required: true })
        .positional("b", { type: "number", required: true }),
    handler: (argv) => {
      const { a, b } = argv;
      const result = a + b;
      console.log(`${a} + ${b} = ${result}`);
    },
  });

for (const [name, input] of Object.entries(inputs)) {
  console.log(name);
  program.parse(input);
}
```

```
from-process-argv
3 + 4 = 7
from-string
2 + 3 = 5
from-array
5 + 6 = 11
```

### Middleware

```js
const input = "greet patrick star";

function stringToBase64(s) {
  return Buffer.from(s, "utf-8").toString("base64");
}

ljos()
  .command({
    cmd: "greet <first-name> <last-name>",
    desc: "greet command description",
    builder: (ljos) =>
      ljos
        .positional("first-name", { type: "string", required: true })
        .positional("last-name", { type: "string", required: true }),
    handler: (argv) => {
      // ljos will provide both kebab- and camel-case versions of args
      const { firstName, lastName } = argv;
      console.log(`Hey there, ${firstName} ${lastName}!`);
    },
    // Array of middleware objects with callbacks
    // Result of middleware callback will be merged with argv
    transforms: [
      // Just a callback function
      ({ firstName }) => ({ firstName: firstName.toUpperCase() }),
      // Or an object with additional configuration
      {
        f: ({ lastName }) => ({ lastName: stringToBase64(lastName) }),
        applyBeforeMiddleware: true,
      },
    ],
  })
  .parse(input);
```

```
Hey there, PATRICK c3Rhcg==!
```

### Check

```js
const input = "divide 1 2";

ljos()
  .command({
    cmd: "divide <a> <b>",
    desc: "divide command description",
    builder: (ljos) =>
      ljos
        .positional("a", {
          type: "number",
          required: true,
          desc: "numerator",
        })
        .positional("b", {
          type: "number",
          required: true,
          desc: "denominator",
        })
        .check((argv) => {
          const { b } = argv;
          if (b === 0) {
            // Fails validation, shows error messge
            throw new Error("Please do not divide by 0");
          }
          // Passes validation, continues with execution
          return;
        }),
    handler: (argv) => {
      const { a, b } = argv;
      const result = a / b;
      console.log(`${a} / ${b} = ${result}`);
    },
  })
  .parse(input);
```

```
1 / 2 = 0.5
```

### Subcommands

```js
const inputs = {
  sum: "math sum 1 2 3 4",
  product: "math product 1 2 3 4",
};

const program = ljos()
  .command({
    cmd: "math",
    desc: "math command description",
    builder: (ljos) =>
      ljos
        .demandCommand(1)
        .command({
          cmd: "sum <numbers..>",
          desc: "get the sum of numbers",
          builder: (ljos) =>
            ljos.positional("numbers", {
              array: true,
              type: "number",
              required: true,
            }),
          handler: (argv) => {
            const { numbers } = argv;
            const result = numbers.reduce((acc, curr) => acc + curr, 0);
            console.log(`The sum of ${numbers} is ${result}`);
          },
        })
        .command({
          cmd: "product <numbers..>",
          desc: "get the sum of numbers",
          builder: (ljos) =>
            ljos.positional("numbers", {
              array: true,
              type: "number",
              required: true,
            }),
          handler: (argv) => {
            const { numbers } = argv;
            const result = numbers.reduce((acc, curr) => acc * curr, 1);
            console.log(`The product of ${numbers} is ${result}`);
          },
        }),
    handler: (argv) => {
      const { name } = argv;
      console.log(`Hey there, ${name}!`);
    },
  });

for (const [name, input] of Object.entries(inputs)) {
  console.log(name);
  program.parse(input);
}
```

```
sum
The sum of 1,2,3,4 is 10
product
The product of 1,2,3,4 is 24
```

## Documentation

TODO

## Contributing

TODO

## Differences from yargs

- no browser or deno
  - Deno has node/npm compatibility, not sure if they have util.parseArgs yet
- middlewares are more specific:
  - transform:
    - modify argv
    - same behavior around errors
  - check:
    - do not modify argv
    - raise errors if conditions aren't met, show usage
- unknown options are treated as bool opt and positional
  - yargs
    - can figure out bool vs string vs number without configuration
      - I think this is the case, but I need to double-check
    - can only figure out greedy arrays, nargs, and count with config
  - ljos
    - config is needed for the parser to correctly
    - builder (`.option`/`positional`) must be used
    - TODO: this is fundamentally different than yargs
      - reconcile difference with pre-processing?
      - require the use of builder for all options and make strict by default?
- no nargs, count, or fs-related logic (config, etc)
  - nargs might not be easy or possible using `util.parseArgs`
    - maybe preprocessing?
    - maybe use tokens from parseArgs?
  - is there a compelling reason to keep count?
  - I would like to keep fs logic out
    - cjs/esm/deno handle all differently
    - does it really need to be the concern of ljos?
    - can people do it themselves?
    - Maybe export helper functions instead, or provide examples in docs?
      - eg: recursively reading directories as commands/subcommands
- use option definition object properties, not yargs methods
  - no `yargs.string()`
  - use `.option('opt1', {type: 'string'})`
- one call signature per function (where possible)
  - I dislike overloads
    - hard to maintain & hard to learn
    - param names don't communicate intention
  - if multiple optional args, use config objects intead
- reduce number of aliases for config params, commands, etc
  - smaller mental load, less exceptions to handle
- no parser config
  - boolean-negation
    - would need pre-processing (eg: `no-save` -> `{save: false}`)
  - camel-case expansion, strip-aliased, strip-dashed
    - all could be middleware instead?
    - I want to eventually ship types with ljos, and this makes it painful
    - I dreaded working around these in yargs, as tracking keys becomes complex
      - eg: which keys have defaults?
      - I'm guessing that there are a bunch of unsolved corner case bugs in
        yargs because of this
  - greedy-arrays
    - This is where a lot of complex/unsolvable bugs are in yargs
    - I would rather people not use greedy options
    - Am I wrong to think that variadic args should be positional?
- commands
  - command module only:
    - `ljos.cmd({ cmd: str, desc: str, builder: function, handler: function })`
  - no legacy builder
    - `yargs.command('cmd', 'cmd desc', ljos => ljos, argv => argv)`
- explicit options/positionals
  - `cmd1 <pos1>` will need a corresponding
    `yargs.positional('pos1', { /* ... */ })`

## Tasks

- adjust argsert for object params
- strict by default, only return first unknown?
  - unknown/misspelled cmd causes unknown args (subcommands, positionals, etc)
- remove as many deprecated methods as possible
  - furthermore, simplify existing ones
  - demand
    - is really complicated
    - I don't think the docs show every possible use case
    - solutions
      - use object param instead?
        - simpler than having 10+ overloads based on len(args) and types
      - split into smaller methods?
      - convert to `check` middleware function factories?
      - provide examples for people to create their own `check` middlewares?
- fix/remove/address TODO tests
- middleware
  - convert validation methods to check middleware helpers
    - demand / requiresArg logic
  - accept check cb & middleware
  - remove coerce? (just use a transform middleware?)
- Integrate @types/yargs types
- unknown option/positional
  - parseArgs will treat unknown option as boolean
  - not sure what happens with positional
    - eg: `cmd1 <pos1>`with no corresponding `ljos.positional()`
- Don't allow mixture of option/positional for a given key
  - might not be possible,
  - options/positionals are run through the parser as options (separately)
- More flexibility around variadic positionals
  - eg: `mv <src..> <dst>` does not work in yargs
  - solution
    - Determine number of args before/after?
    - Pick/remove before ones, pick/remove after ones, remaining are variadic.
    - Raise error if expected > provided
- only keep camel-case variants
  - middleware
- esbuild (or some future native build tool with type checking)?
