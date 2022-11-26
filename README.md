# Ljos

Ljósið -- Light

## Description

Ljos aims to be like yargs, but simplified and built around parseArgs.

## Installation

TODO: put on npm once stable

```sh
npm i ljos
```

## Usage

TODO

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
