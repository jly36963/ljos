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
  .cmd({
    command: "greet <name>",
    description: "greet command description",
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

### Simple (legacy)

```js
const input = "greet Timmy";

ljos()
  .command(
    "greet <name>",
    "greet command description",
    (ljos) => ljos.positional("name", { type: "string", required: true }),
    (argv) => {
      const { name } = argv;
      console.log(`Hey there, ${name}!`);
    },
  )
  .parse(input);
```

```
Hey there, Timmy!
```

### Default command

```js
const input = "Carl";

ljos()
  .cmd({
    command: "$0 <name>",
    description: "default command description",
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
    command: "greet [name]",
    description: "greet command description",
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
  .command(
    "add <a> <b>",
    "add command description",
    (ljos) =>
      ljos
        .positional("a", { type: "number", required: true })
        .positional("b", { type: "number", required: true }),
    (argv) => {
      const { a, b } = argv;
      const result = a + b;
      console.log(`${a} + ${b} = ${result}`);
    },
  );

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
  .cmd({
    command: "greet <first-name> <last-name>",
    description: "greet command description",
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
    middleware: [
      // Result of middleware callback will be merged with argv
      { f: ({ firstName }) => ({ firstName: firstName.toUpperCase() }) },
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
  .cmd({
    command: "divide <a> <b>",
    description: "divide command description",
    builder: (ljos) =>
      ljos
        .positional("a", {
          type: "number",
          required: true,
          description: "numerator",
        })
        .positional("b", {
          type: "number",
          required: true,
          description: "denominator",
        })
        .check((argv) => {
          const { b } = argv;
          if (b === 0) {
            // Fails validation, shows error messge
            throw new Error("Please do not divide by 0");
          }
          // Passes validation, continues with execution
          return true;
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
  .cmd({
    command: "math",
    description: "math command description",
    builder: (ljos) =>
      ljos
        .demandCommand(1)
        .cmd({
          command: "sum <numbers..>",
          description: "get the sum of numbers",
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
        .cmd({
          command: "product <numbers..>",
          description: "get the sum of numbers",
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

## Tasks

- unknown option/positional
  - parseArgs will treat unknown option as boolean
  - not sure what happens with positional
    - eg: `cmd1 <pos1>`with no corresponding `ljos.positional()`
- argsert for object params
- fix/remove/address TODO tests
- strict by default, only return first unknown?
- demand / requiresArg logic
- Don't allow mixture of option/positional for a given key
  - might not be possible,
  - options/positionals are run through the parser as options (separately)
- Integrate @types/yargs types
- Update handling of positionals (allow more flexibility with variadic args)
  - Determine number of args before/after?
  - Pick/remove before ones, pick/remove after ones, remaining are variadic.
  - Raise error if too many are expected

## Differences from yargs

- unknown options are treated as bool opt and positional
  - builder (`.option`/`positional`) must be used
  - make strict by default?
- no nargs, count, or fs-related logic (config, etc)
  - nargs might not be easy or possible (maybe use tokens from parseArgs)
  - is there a compelling reason to keep count?
  - I would like to keep fs logic out
    - cjs/esm/deno handle all differently
    - does it really need to be the concern of ljos?
    - can people do it themselves?
    - export helper functions instead?
- use option definition object properties, not yargs methods
  - no `yargs.string()`, use `.option('opt1', {type: 'string'})`
- one call signature per function (where possible)
  - hard to maintain, hard to learn
  - param names don't communicate intention
  - use objects intead
- commands
  - command: cmd, desc, builder, handler
  - cmd:
    `{ command: str, description: str, builder: function, handler: function }`
- explicit options
  - `cmd1 <pos1>` will need a corresponding
    `yargs.positional('pos1', { /* ... */ })`

```
```
