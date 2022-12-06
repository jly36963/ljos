const {describe, it, beforeEach} = require('mocha');
/* eslint-disable no-unused-vars */

// const checkUsage = require('./helpers/utils.cjs').checkOutput;
const expect = require('chai').expect;
const english = require('../locales/en.json');
let ljos = require('../index.cjs');

require('chai').should();

describe('validation tests', () => {
  beforeEach(() => {
    ljos.getInternalMethods().reset();
  });

  describe('check', () => {
    it('fails if error is thrown in check callback', done => {
      ljos
        .command({
          cmd: '$0',
          desc: 'default command desc',
          builder: ljos =>
            ljos
              .option('name', {
                desc: 'name desc',
                type: 'string',
                alias: 'n',
              })
              .check(argv => {
                const {name} = argv;
                if (typeof name !== 'string' || !name.length) {
                  throw new Error('Option "name" must be a non-empty string');
                }
                return true;
              }),
          handler: () => {
            expect.fail();
          },
        })
        .fail(() => {
          return done();
        })
        .parse('--name');
    });

    it('does not fail if error is not thrown in check callback, and true is returned', () => {
      ljos
        .command({
          cmd: '$0',
          desc: 'default command desc',
          builder: ljos =>
            ljos
              .option('name', {
                desc: 'version desc',
                type: 'string',
                alias: 'n',
              })
              .check(argv => {
                const {name} = argv;
                if (typeof name !== 'string' || !name.length) {
                  throw new Error('Option "name" must be a non-empty string');
                }
                return true;
              }),
          handler: argv => argv,
        })
        .fail(() => {
          expect.fail();
        })
        .parse('--name Itachi');
    });

    it('callback has access to options', () => {
      ljos
        .command({
          cmd: '$0',
          desc: 'default command desc',
          builder: ljos =>
            ljos
              .option('name', {
                desc: 'name desc',
                type: 'string',
                alias: 'n',
              })
              .check((_, options) => {
                if (
                  typeof options !== 'object' ||
                  !Object.prototype.hasOwnProperty.call(options, 'string') ||
                  !options.string.includes('name')
                ) {
                  throw new Error(
                    'Check callback should have access to options'
                  );
                }
                return true;
              }),
          handler: argv => argv,
        })
        .fail(() => {
          expect.fail();
        })
        .parse('--name Itachi');
    });
  });

  describe('implies', () => {
    const implicationsFailedPattern = new RegExp(
      english['Implications failed:']
    );

    it("fails if '_' populated, and implied argument not set", () => {
      let failed = false;

      ljos(['cat'])
        .command({
          cmd: '$0 <animal>',
          desc: 'default command',
          builder: ljos =>
            ljos
              .positional('animal', {
                type: 'string',
                required: true,
                implies: ['foo'],
              })
              .option('foo', {type: 'string'}),
        })
        .fail(msg => {
          msg.should.match(implicationsFailedPattern);
          failed = true;
        })
        .parse();

      failed.should.equal(true);
    });

    it("fails if key implies values in '_', but '_' is not populated", () => {
      let failed = false;
      ljos(['--foo'])
        .command({
          cmd: '$0',
          desc: 'default desc',
          builder: ljos =>
            ljos
              .option('foo', {type: 'boolean', implies: ['animal']})
              .positional('animal', {type: 'string'}),
        })
        .fail(msg => {
          msg.should.match(implicationsFailedPattern);
          failed = true;
        })
        .parse();

      failed.should.equal(true);
    });

    it('fails if either implied argument is not set and displays only failed', () => {
      const testConfigs = [
        {
          args: ['-f', '-b'],
          failMessageMatch: /f -> c/,
          failMessageNotMatch: /f -> b/,
        },
        {
          args: ['-f', '-c'],
          failMessageMatch: /f -> b/,
          failMessageNotMatch: /f -> c/,
        },
      ];

      testConfigs.forEach(({args, failMessageMatch, failMessageNotMatch}) => {
        let failed = false;
        let msg;

        const program = ljos().command({
          cmd: '$0',
          desc: 'default desc',
          builder: ljos =>
            ljos
              .option('b', {type: 'boolean'})
              .option('c', {type: 'boolean'})
              .option('f', {type: 'boolean', implies: ['b', 'c']})
              .fail(m => {
                msg = m;
                failed = true;
              }),
        });
        program.parse(args);
        msg.should.match(failMessageMatch);
        msg.should.not.match(failMessageNotMatch);
        failed.should.equal(true);
      });
    });

    // // TODO: create .either() method?
    // it("fails if --no-foo's implied argument is not set", done => {
    //   ljos([])
    //     .conflicts({
    //       '--no-bar': 'foo', // when --bar is not given, --foo is required
    //     })
    //     .fail(msg => {
    //       msg.should.match(implicationsFailedPattern);
    //       return done();
    //     })
    //     .parse();
    // });

    // // TODO: convert to conflicts
    // it('fails if a key is set, along with a key that it implies should not be set', done => {
    //   ljos(['--bar', '--foo'])
    //     .implies({
    //       bar: '--no-foo', // --bar means --foo cannot be given
    //     })
    //     .fail(msg => {
    //       msg.should.match(implicationsFailedPattern);
    //       return done();
    //     })
    //     .parse();
    // });

    // // TODO: yo, wtf
    // it('fails if implied key (with "no" in the name) is not set', () => {
    //   let failCalled = false;
    //   ljos('--bar')
    //     .implies({
    //       bar: 'noFoo', // --bar means --noFoo (or --no-foo with boolean-negation disabled) is required
    //       // note that this has nothing to do with --foo
    //     })
    //     .fail(msg => {
    //       failCalled = true;
    //       msg.should.match(implicationsFailedPattern);
    //     })
    //     .parse();
    //   failCalled.should.equal(true);
    // });

    it("doesn't fail if implied key exists with value 0", () => {
      ljos('--foo --bar 0')
        .command({
          cmd: '$0',
          desc: 'default desc',
          builder: ljos =>
            ljos
              .option('foo', {type: 'boolean', implies: ['bar']})
              .option('bar', {type: 'number'}),
        })
        .fail(() => {
          expect.fail();
        })
        .parse();
    });

    it("doesn't fail if implied key exists with value false", () => {
      ljos('--foo --bar false')
        .command({
          cmd: '$0',
          desc: 'default desc',
          builder: ljos =>
            ljos
              .option('foo', {type: 'boolean', implies: ['bar']})
              .option('foo', {type: 'boolean'}),
        })
        .fail(() => {
          expect.fail();
        })
        .parse();
    });

    // // TODO: figure out what to do with this
    // it('doesn\'t fail if implied key (with "no" in the name) is set', () => {
    //   const argv = ljos('--bar --noFoo')
    //     .implies({
    //       bar: 'noFoo', // --bar means --noFoo (or --no-foo with boolean-negation disabled) is required
    //       // note that this has nothing to do with --foo
    //     })
    //     .fail(() => {
    //       expect.fail();
    //     })
    //     .parse();
    //   expect(argv.bar).to.equal(true);
    //   expect(argv.noFoo).to.equal(true);
    //   expect(argv.foo).to.equal(undefined);
    // });

    // // TODO: figure out what to do with this
    // it('fails if implied key (with "no" in the name) is given when it should not', () => {
    //   let failCalled = false;
    //   ljos('--bar --noFoo')
    //     .implies({
    //       bar: '--no-noFoo', // --bar means --noFoo (or --no-foo with boolean-negation disabled) cannot be given
    //       // note that this has nothing to do with --foo
    //     })
    //     .fail(msg => {
    //       failCalled = true;
    //       msg.should.match(implicationsFailedPattern);
    //     })
    //     .parse();
    //   failCalled.should.equal(true);
    // });

    // // TODO: figure out how to deal with this
    // it('doesn\'t fail if implied key (with "no" in the name) that should not be given is not set', () => {
    //   const argv = ljos('--bar')
    //     .implies({
    //       bar: '--no-noFoo', // --bar means --noFoo (or --no-foo with boolean-negation disabled) cannot be given
    //       // note that this has nothing to do with --foo
    //     })
    //     .fail(() => {
    //       expect.fail();
    //     })
    //     .parse();
    //   expect(argv.bar).to.equal(true);
    //   expect(argv.noFoo).to.equal(undefined);
    //   expect(argv.foo).to.equal(undefined);
    // });

    it('allows key to be specified with option shorthand', () => {
      let failed = false;
      ljos('--bar')
        .command({
          cmd: '$0',
          desc: 'default desc',
          builder: ljos =>
            ljos.option('bar', {
              implies: ['foo'],
            }),
        })
        .fail(msg => {
          msg.should.match(implicationsFailedPattern);
          failed = true;
        })
        .parse();

      failed.should.equal(true);
    });
  });

  describe('conflicts', () => {
    it('fails if both arguments are supplied', () => {
      let failed = false;
      ljos(['-f', '-b'])
        .command({
          cmd: '$0',
          desc: 'default desc',
          builder: ljos =>
            ljos
              .option('f', {type: 'boolean', conflicts: ['b']})
              .option('b', {type: 'boolean'}),
        })
        .fail(msg => {
          msg.should.equal('Arguments f and b are mutually exclusive');
          failed = true;
        })
        .parse();

      failed.should.equal(true);
    });

    it('fails if argument is supplied along with either conflicting argument', () => {
      const testConfigs = [
        {
          args: ['-f', '-b'],
          failMessage: 'Arguments f and b are mutually exclusive',
        },
        {
          args: ['-f', '-c'],
          failMessage: 'Arguments f and c are mutually exclusive',
        },
      ];

      testConfigs.forEach(({args, failMessage}) => {
        let msg;
        let failed = false;

        const program = ljos().command({
          cmd: '$0',
          desc: 'default desc',
          builder: ljos =>
            ljos
              .option('f', {type: 'boolean', conflicts: ['b', 'c']})
              .option('b', {type: 'boolean'})
              .option('c', {type: 'boolean'})
              .fail(m => {
                msg = m;
                failed = true;
              }),
        });
        program.parse(args);
        msg.should.equal(failMessage);
        failed.should.equal(true);
      });
    });

    it('fails if conflicting arguments are provided', () => {
      let failed = false;
      ljos('--foo-foo a --bar-bar b')
        .command({
          cmd: '$0',
          desc: 'default desc',
          builder: ljos =>
            ljos
              .option('foo-foo', {
                type: 'string',
                conflicts: ['bar-bar'],
              })
              .option('bar-bar', {
                type: 'string',
              }),
        })
        .fail(msg => {
          expect(msg).to.not.equal(null);
          msg.should.match(
            /Arguments foo-foo and bar-bar are mutually exclusive/
          );
          failed = true;
        })
        .parse();

      failed.should.equal(true);
    });

    it('should not fail if no conflicting arguments are provided', () => {
      ljos(['-b', '-c'])
        .command({
          cmd: '$0',
          desc: 'default desc',
          builder: ljos =>
            ljos
              .option('b', {type: 'boolean'})
              .option('c', {type: 'boolean'})
              .option('f', {type: 'boolean', conflicts: ['b', 'c']}),
        })
        .fail(_msg => {
          expect.fail();
        })
        .parse();
    });

    it('should not fail if argument with conflict is provided, but not the argument it conflicts with', () => {
      ljos(['cmd1', '-f', '-c'])
        .command({
          cmd: 'cmd1',
          desc: 'cmd1 desc',
          builder: ljos =>
            ljos
              .option('b', {type: 'boolean'})
              .option('c', {type: 'boolean'})
              .option('f', {type: 'boolean', conflicts: ['b']}),
        })
        .fail(_msg => {
          expect.fail();
        })
        .parse();
    });

    it('should not fail if conflicting argument is provided, without argument with conflict', () => {
      ljos(['command', '-b', '-c'])
        .command({
          cmd: 'cmd1',
          desc: 'cmd1 desc',
          builder: ljos =>
            ljos
              .option('b', {type: 'boolean'})
              .option('c', {type: 'boolean'})
              .option('f', {type: 'boolean', conflicts: ['b']}),
        })
        .fail(_msg => {
          expect.fail();
        })
        .parse();
    });

    // // TODO: unnecessary (no dict usage anymore)
    // it('allows an object to be provided defining conflicting option pairs', done => {
    //   ljos(['-t', '-s'])
    //     .conflicts({
    //       c: 'a',
    //       s: 't',
    //     })
    //     .fail(msg => {
    //       msg.should.equal('Arguments s and t are mutually exclusive');
    //       return done();
    //     })
    //     .parse();
    // });

    it('takes into account aliases when applying conflicts logic', () => {
      let failed = false;
      ljos(['-t', '-c'])
        .command({
          cmd: '$0',
          desc: 'default desc',
          builder: ljos =>
            ljos
              .option('a', {type: 'boolean'})
              .option('c', {type: 'boolean', aliases: ['s'], conflicts: ['a']})
              .option('t', {type: 'boolean', conflicts: ['s']}),
        })
        .fail(msg => {
          msg.should.equal('Arguments t and s are mutually exclusive');
          failed = true;
        })
        .parse();

      failed.should.equal(true);
    });

    it('allows key to be specified with option shorthand', () => {
      let failed = false;
      ljos(['-f', '-b'])
        .command({
          cmd: '$0',
          desc: 'default desc',
          builder: ljos =>
            ljos
              .option('b', {type: 'boolean'})
              .option('f', {type: 'boolean', conflicts: ['b']}),
        })
        .fail(msg => {
          msg.should.equal('Arguments f and b are mutually exclusive');
          failed = true;
        })
        .parse();

      failed.should.equal(true);
    });

    it('should fail if alias of conflicting argument is provided', () => {
      let failed = false;
      ljos(['-f', '--batman=99'])
        .command({
          cmd: '$0',
          desc: 'default desc',
          builder: ljos =>
            ljos
              .option('f', {type: 'boolean', conflicts: ['b']})
              .option('batman', {type: 'number', aliases: ['b']}),
        })
        .fail(msg => {
          msg.should.equal('Arguments f and b are mutually exclusive');
          failed = true;
        })
        .parse();
      failed.should.equal(true);
    });

    it('should fail if alias of argument with conflict is provided', () => {
      let failed = false;
      ljos(['--f', '-b'])
        .command({
          cmd: '$0',
          desc: 'default desc',
          builder: ljos =>
            ljos
              .option('foo', {
                type: 'boolean',
                aliases: ['f'],
                conflicts: ['b'],
              })
              .option('b', {type: 'boolean'}),
        })
        .fail(msg => {
          msg.should.equal('Arguments foo and b are mutually exclusive');
          failed = true;
        })
        .parse();

      failed.should.equal(true);
    });

    function loadLocale(locale) {
      delete require.cache[require.resolve('../')];
      ljos = require('../');
      process.env.LC_ALL = locale;
    }

    it('should use appropriate translation', () => {
      let failed = false;
      loadLocale('pirate');
      try {
        ljos(['-f', '-b'])
          .command({
            cmd: '$0',
            desc: 'default desc',
            builder: ljos =>
              ljos
                .option('f', {type: 'boolean', conflicts: ['b']})
                .option('b', {type: 'boolean'}),
          })
          .fail(msg => {
            msg.should.equal(
              'Yon scurvy dogs f and b be as bad as rum and a prudish wench'
            );
            failed = true;
          })
          .parse();
      } finally {
        loadLocale('en_US.UTF-8');
      }

      failed.should.equal(true);
    });
  });

  describe('demand', () => {
    it('fails with standard error message if msg is not defined', () => {
      let failed = false;
      ljos([])
        .demandCommand(1)
        .fail(msg => {
          msg.should.equal(
            'Not enough non-option arguments: got 0, need at least 1'
          );
          failed = true;
        })
        .parse();
      failed.should.equal(true);
    });

    // addresses: https://github.com/ljos/ljos/issues/1861
    it('fails in strict mode when no commands defined but command is passed', () => {
      let failed = false;
      ljos('foo')
        .strict()
        .fail(msg => {
          msg.should.equal('Unknown argument: foo');
          failed = true;
        })
        .parse();
      failed.should.equal(true);
    });

    it('fails because of undefined command and not because of argument after --', () => {
      let failed = false;
      ljos('foo -- hello')
        .strict()
        .fail(msg => {
          msg.should.equal('Unknown argument: foo');
          failed = true;
        })
        .parse();
      failed.should.equal(true);
    });

    it('fails in strict mode with invalid command', () => {
      let failed = false;
      ljos(['koala'])
        .command({cmd: 'wombat', desc: 'wombat burrows'})
        .command({cmd: 'kangaroo', desc: 'kangaroo handlers'})
        .demandCommand(1)
        .strict()
        .fail(msg => {
          msg.should.equal('Unknown argument: koala');
          failed = true;
        })
        .parse();
      failed.should.equal(true);
    });

    it('fails in strict mode with extra positionals', done => {
      ljos(['kangaroo', 'jumping', 'fast'])
        .command({cmd: 'kangaroo <status>', desc: 'kangaroo handlers'})
        .strict()
        .fail(msg => {
          msg.should.equal('Unknown argument: fast');
          return done();
        })
        .parse();
      expect.fail('no parsing failure');
    });

    it('fails in strict mode with extra positionals for default command', done => {
      ljos(['jumping', 'fast'])
        .command({cmd: '$0 <status>', desc: 'kangaroo handlers'})
        .strict()
        .fail(msg => {
          msg.should.equal('Unknown argument: fast');
          return done();
        })
        .parse();
      expect.fail('no parsing failure');
    });

    it('does not fail in strict mode when no commands configured', () => {
      const argv = ljos('koala')
        .demandCommand(1)
        .strict()
        .fail(_msg => {
          expect.fail();
        })
        .parse();
      argv._[0].should.equal('koala');
    });

    // addresses: https://github.com/ljos/ljos/issues/791
    it('should recognize config variables in strict mode', () => {
      const argv = ljos('foo 99')
        .command({
          cmd: 'foo <y>',
          desc: 'foo desc',
          builder: ljos =>
            ljos.positional('y', {type: 'number', required: true}),
        })
        .strict()
        .option('x', {type: 'number'})
        .config({x: 33})
        .parse();

      argv.y.should.equal(99);
      argv.x.should.equal(33);
      argv._.should.include('foo');
    });

    // addresses: https://github.com/ljos/ljos/issues/791
    it('should recognize config variables in strict mode, when running sub-commands', () => {
      const argv = ljos('cmd1 subcmd1 --y=22')
        .command({
          cmd: 'cmd1',
          desc: 'cmd1 desc',
          builder: ljos => {
            ljos
              .command({cmd: 'subcmd1', desc: 'subcmd1 desc'})
              .option('y', {
                desc: 'y inner option',
                type: 'number',
              })
              .fail(_msg => {
                expect.fail();
              });
          },
        })
        .option('x', {type: 'number'})
        .config({x: 33})
        .strict()
        .parse();

      argv.y.should.equal(22);
      argv.x.should.equal(33);
      argv._.should.include('cmd1');
      argv._.should.include('subcmd1');
    });

    // // TODO: keep this behavior? split it out? (demand positional and options)
    // it('fails when a required argument is missing', done => {
    //   ljos('-w 10 marsupial')
    //     .demand(1, ['w', 'b'])
    //     .fail(msg => {
    //       msg.should.equal('Missing required argument: b');
    //       return done();
    //     })
    //     .parse();
    // });

    // // TODO: keep this behavior? split it out? (demand positional and options)
    // it('fails when required arguments are present, but a command is missing', done => {
    //   ljos('-w 10 -m wombat')
    //     .demand(1, ['w', 'm'])
    //     .fail(msg => {
    //       msg.should.equal(
    //         'Not enough non-option arguments: got 0, need at least 1'
    //       );
    //       return done();
    //     })
    //     .parse();
    // });

    it('fails without a message if msg is null', () => {
      let failed = false;
      ljos([])
        .demandCommand(1, null)
        .fail(msg => {
          expect(msg).to.equal(null);
          failed = true;
        })
        .parse();
      failed.should.equal(true);
    });

    // address regression in: https://github.com/ljos/ljos/pull/740
    it('custom failure message should be printed for both min and max constraints', () => {
      let failed = false;
      ljos(['foo'])
        .demandCommand(2, 4, 'hey! give me a custom exit message')
        .fail(msg => {
          expect(msg).to.equal('hey! give me a custom exit message');
          failed = true;
        })
        .parse();
      failed.should.equal(true);
    });

    it('interprets min relative to command', () => {
      let failureMsg;
      ljos('lint')
        .command({
          cmd: 'lint',
          desc: 'Lint a file',
          builder: ljos => {
            ljos.demandCommand(1).fail(msg => {
              failureMsg = msg;
            });
          },
        })
        .parse();
      expect(failureMsg).to.equal(
        'Not enough non-option arguments: got 0, need at least 1'
      );
    });

    it('interprets max relative to command', () => {
      let failureMsg;
      ljos('lint one.js two.js')
        .command({
          cmd: 'lint',
          desc: 'Lint a file',
          builder: ljos => {
            ljos.demandCommand(0, 1).fail(msg => {
              failureMsg = msg;
            });
          },
        })
        .parse();
      expect(failureMsg).to.equal(
        'Too many non-option arguments: got 2, maximum of 1'
      );
    });
  });

  describe('required', () => {
    // // TODO: getting treated as boolaen option instead of a number
    // it('fails when a required argument value of type number is missing', () => {
    //   let failed = false;
    //   ljos('-w')
    //     .command('$0', 'default desc', ljos =>
    //       ljos.option('w', {type: 'number', required: true})
    //     )
    //     .fail(msg => {
    //       msg.should.equal('Not enough arguments following: w');
    //       failed = true;
    //     })
    //     .parse();
    //   failed.should.equal(true);
    // });

    // // TODO: getting treated as boolean option instead of string
    // it('fails when a required argument value of type string is missing', () => {
    //   let failed = false;
    //   ljos('-w')
    //     .command('$0', 'default desc', ljos =>
    //       ljos.option('w', {type: 'string', required: true})
    //     )
    //     .fail(msg => {
    //       msg.should.equal('Not enough arguments following: w');
    //       failed = true;
    //     })
    //     .parse();
    //   failed.should.equal(true);
    // });

    // // TODO: removing requiresArg logic
    // it('fails when a required argument value of type boolean is missing', () => {
    //   let failed = false;
    //   ljos('-w')
    //     .command('$0', 'default desc', ljos =>
    //       ljos.option('w', {type: 'boolean', required: true})
    //     )
    //     .fail(msg => {
    //       msg.should.equal('Not enough arguments following: w');
    //       failed = true;
    //     })
    //     .parse();
    //   failed.should.equal(true);
    // });

    // // TODO: string option without arg is getting treated as Array<boolean>
    // it('fails when a required argument value of type array is missing', () => {
    //   let failed = false;
    //   ljos('-w')
    //     .command(
    //       '$0',
    //       'default desc',
    //       ljos =>
    //         ljos
    //           .option('w', {array: true, type: 'string', required: true})
    //           .fail(msg => {
    //             msg.should.equal('Not enough arguments following: w');
    //             failed = true;
    //           }),
    //       () => {}
    //     )
    //     .parse();
    //   failed.should.equal(true);
    // });

    // TODO: removing requiresArg
    // // see: https://github.com/ljos/ljos/issues/1041
    // it('does not fail if argument with required value is not provided', done => {
    //   ljos()
    //     .command('$0', 'default desc', ljos =>
    //       ljos.option('w', {type: 'number', required: true})
    //     )
    //     .command('woo')
    //     .parse('', (err, argv, output) => {
    //       expect(err).to.equal(null);
    //       return done();
    //     });
    // });

    it('does not fail if argument with required value is not provided to subcommand', () => {
      ljos('woo')
        .command({
          cmd: '$0',
          desc: 'default desc',
          builder: ljos => ljos.option('w', {type: 'number', required: true}),
        })
        .command({cmd: 'woo', desc: 'woo desc'})
        .fail(_msg => expect.fail())
        .parse();
    });
  });

  describe('choices', () => {
    it('fails with one invalid value', () => {
      let failed = false;
      ljos(['--state', 'denial'])
        .command({
          cmd: '$0',
          desc: 'default desc',
          builder: ljos =>
            ljos
              .option('state', {
                type: 'string',
                choices: ['happy', 'sad', 'hungry'],
              })
              .fail(msg => {
                msg
                  .split('\n')
                  .should.deep.equal([
                    'Invalid values:',
                    '  Argument: state, Given: "denial", Choices: "happy", "sad", "hungry"',
                  ]);
                failed = true;
              }),
        })
        .parse();

      failed.should.equal(true);
    });

    it('fails with one valid and one invalid value', () => {
      let failed = false;
      ljos(['--characters', 'susie', '--characters', 'linus'])
        .command({
          cmd: '$0',
          desc: 'default desc',
          builder: ljos =>
            ljos
              .option('characters', {
                type: 'string',
                choices: ['calvin', 'hobbes', 'susie', 'moe'],
              })
              .fail(msg => {
                msg
                  .split('\n')
                  .should.deep.equal([
                    'Invalid values:',
                    '  Argument: characters, Given: "linus", Choices: "calvin", "hobbes", "susie", "moe"',
                  ]);
                failed = true;
              }),
        })
        .parse();
      failed.should.equal(true);
    });

    it('fails with multiple invalid values for same argument', () => {
      let failed = false;
      ljos(['--category', 'comedy', '--category', 'drama'])
        .command({
          cmd: '$0',
          desc: 'default command',
          builder: ljos =>
            ljos
              .option('category', {
                array: true,
                type: 'string',
                choices: ['animal', 'vegetable', 'mineral'],
              })
              .fail(msg => {
                msg
                  .split('\n')
                  .should.deep.equal([
                    'Invalid values:',
                    '  Argument: category, Given: "comedy", "drama", Choices: "animal", "vegetable", "mineral"',
                  ]);
                failed = true;
              }),
        })
        .parse();
      failed.should.equal(true);
    });

    it('fails with case-sensitive mismatch', () => {
      let failed = false;
      ljos(['--env', 'DEV'])
        .command({
          cmd: '$0',
          desc: 'default desc',
          builder: ljos =>
            ljos
              .option('env', {
                type: 'string',
                choices: ['dev', 'prd'],
              })
              .fail(msg => {
                msg
                  .split('\n')
                  .should.deep.equal([
                    'Invalid values:',
                    '  Argument: env, Given: "DEV", Choices: "dev", "prd"',
                  ]);
                failed = true;
              }),
        })
        .parse();
      failed.should.equal(true);
    });

    it('fails with multiple invalid arguments', () => {
      let failed = false;
      ljos(['--system', 'osx', '--arch', '64'])
        .command({
          cmd: '$0',
          desc: 'default desc',
          builder: ljos =>
            ljos
              .option('system', {
                type: 'string',
                choices: ['linux', 'mac', 'windows'],
              })
              .option('arch', {
                type: 'string',
                choices: ['x86', 'x64', 'arm'],
              })
              .fail(msg => {
                msg
                  .split('\n')
                  .should.deep.equal([
                    'Invalid values:',
                    '  Argument: system, Given: "osx", Choices: "linux", "mac", "windows"',
                    '  Argument: arch, Given: "64", Choices: "x86", "x64", "arm"',
                  ]);
                failed = true;
              }),
        })
        .parse();
      failed.should.equal(true);
    });

    // addresses: https://github.com/ljos/ljos/issues/849
    it('succeeds when required is true and valid choice is provided', () => {
      ljos('one -a 10 marsupial')
        .command({
          cmd: 'cmd1',
          desc: 'cmd1 desc',
          builder: ljos => {
            ljos.option('a', {
              required: true,
              type: 'number',
              choices: [10, 20],
            });
          },
          handler: argv => {
            argv._[0].should.equal('cmd1');
            argv.a.should.equal(10);
          },
        })
        .fail(_msg => {
          expect.fail();
        })
        .parse();
    });

    // addresses: https://github.com/ljos/ljos/issues/849
    it('fails when required is true and choice is not provided', () => {
      let failed = false;
      ljos('cmd1 --opt1 10 marsupial')
        .command({
          cmd: 'cmd1 <animal>',
          desc: 'cmd1 desc',
          builder: ljos => {
            ljos
              .positional('animal', {type: 'string', required: true})
              .option('opt1', {type: 'number'})
              .option('opt2', {
                type: 'string',
                required: true,
                choices: ['1', '2'],
              });
          },
        })
        .fail(msg => {
          msg.should.equal('Missing required argument: opt2');
          failed = true;
        })
        .parse();
      failed.should.equal(true);
    });

    // addresses: https://github.com/ljos/ljos/issues/849
    it('succeeds when required is false and no choice is provided', () => {
      ljos('cmd1')
        .command({
          cmd: 'cmd1',
          desc: 'cmd1 desc',
          builder: ljos => {
            ljos.option('a', {
              required: false,
              type: 'number',
              choices: [10, 20],
            });
          },
          handler: argv => {
            argv._[0].should.equal('cmd1');
          },
        })
        .fail(_msg => {
          expect.fail();
        })
        .parse();
    });

    // addresses: https://github.com/ljos/ljos/issues/849
    it('succeeds when required is not provided and no choice is provided', () => {
      ljos('one')
        .command({
          cmd: 'cmd1',
          desc: 'level cmd1',
          builder: ljos => {
            ljos.option('a', {
              type: 'number',
              choices: [10, 20],
            });
          },
          handler: argv => {
            argv._[0].should.equal('cmd1');
          },
        })
        .fail(_msg => {
          expect.fail();
        })
        .parse();
    });
  });

  // // TODO: removed config (from file)
  // describe('config', () => {
  //   it('should raise an appropriate error if JSON file is not found', done => {
  //     ljos(['--settings', 'fake.json', '--foo', 'bar'])
  //       .alias('z', 'zoom')
  //       .config('settings')
  //       .fail(msg => {
  //         msg.should.eql('Invalid JSON config file: fake.json');
  //         return done();
  //       })
  //       .parse();
  //   });

  //   // see: https://github.com/ljos/ljos/issues/172
  //   it('should not raise an exception if config file is set as default argument value', () => {
  //     let fail = false;
  //     ljos([])
  //       .option('config', {
  //         default: 'foo.json',
  //       })
  //       .config('config')
  //       .fail(() => {
  //         fail = true;
  //       })
  //       .parse();

  //     fail.should.equal(false);
  //   });

  //   it('should be displayed in the help message', () => {
  //     const r = checkUsage(() =>
  //       ljos(['--help'])
  //         .config('settings')
  //         .help('help')
  //         .version(false)
  //         .wrap(null)
  //         .parse()
  //     );
  //     r.should.have.property('logs').with.length(1);
  //     r.logs
  //       .join('\n')
  //       .split(/\n+/)
  //       .should.deep.equal([
  //         'Options:',
  //         '  --settings  Path to JSON config file',
  //         '  --help      Show help  [boolean]',
  //       ]);
  //   });

  //   it('should be displayed in the help message with its default name', () => {
  //     const checkUsage = require('./helpers/utils.cjs').checkOutput;
  //     const r = checkUsage(() =>
  //       ljos(['--help']).config().help('help').version(false).wrap(null).parse()
  //     );
  //     r.should.have.property('logs').with.length(1);
  //     r.logs
  //       .join('\n')
  //       .split(/\n+/)
  //       .should.deep.equal([
  //         'Options:',
  //         '  --config  Path to JSON config file',
  //         '  --help    Show help  [boolean]',
  //       ]);
  //   });

  //   it('should allow help message to be overridden', () => {
  //     const checkUsage = require('./helpers/utils.cjs').checkOutput;
  //     const r = checkUsage(() =>
  //       ljos(['--help'])
  //         .config('settings', 'pork chop sandwiches')
  //         .help('help')
  //         .version(false)
  //         .wrap(null)
  //         .parse()
  //     );
  //     r.should.have.property('logs').with.length(1);
  //     r.logs
  //       .join('\n')
  //       .split(/\n+/)
  //       .should.deep.equal([
  //         'Options:',
  //         '  --settings  pork chop sandwiches',
  //         '  --help      Show help  [boolean]',
  //       ]);
  //   });

  //   it('outputs an error returned by the parsing function', () => {
  //     const checkUsage = require('./helpers/utils.cjs').checkOutput;
  //     const r = checkUsage(() =>
  //       ljos(['--settings=./package.json'])
  //         .config('settings', 'path to config file', configPath =>
  //           Error('someone set us up the bomb')
  //         )
  //         .help('help')
  //         .wrap(null)
  //         .parse()
  //     );

  //     r.errors
  //       .join('\n')
  //       .split(/\n+/)
  //       .should.deep.equal([
  //         'Options:',
  //         '  --version   Show version number  [boolean]',
  //         '  --settings  path to config file',
  //         '  --help      Show help  [boolean]',
  //         'someone set us up the bomb',
  //       ]);
  //   });

  //   it('outputs an error if thrown by the parsing function', () => {
  //     const checkUsage = require('./helpers/utils.cjs').checkOutput;
  //     const r = checkUsage(() =>
  //       ljos(['--settings=./package.json'])
  //         .config('settings', 'path to config file', configPath => {
  //           throw Error('someone set us up the bomb');
  //         })
  //         .wrap(null)
  //         .parse()
  //     );

  //     r.errors
  //       .join('\n')
  //       .split(/\n+/)
  //       .should.deep.equal([
  //         'Options:',
  //         '  --help      Show help  [boolean]',
  //         '  --version   Show version number  [boolean]',
  //         '  --settings  path to config file',
  //         'someone set us up the bomb',
  //       ]);
  //   });
  // });

  describe('defaults', () => {
    // See https://github.com/chevex/ljos/issues/31
    it('should not fail when demanded options with defaults are missing', () => {
      ljos()
        .fail(msg => {
          throw new Error(msg);
        })
        .option('some-option', {
          desc: 'some option',
          required: true,
          default: 88,
        })
        .strict()
        .parse([]);
    });
  });

  describe('strict mode', () => {
    it('does not fail when command with subcommands called', () => {
      ljos('one')
        .command({
          cmd: 'one',
          desc: 'level one',
          builder: ljos =>
            ljos
              .command({cmd: 'twoA', desc: 'level two A'})
              .command({cmd: 'twoB', desc: 'level two B'})
              .strict()
              .fail(_msg => {
                expect.fail();
              }),
          handler: argv => {
            argv._[0].should.equal('one');
          },
        })
        .parse();
    });

    it('does not fail for hidden options', () => {
      const args = ljos('--foo')
        .strict()
        .option('foo', {type: 'boolean', hidden: true})
        .fail(_msg => {
          expect.fail();
        })
        .parse();
      args.foo.should.equal(true);
    });

    it('does not fail for hidden options but does for unknown arguments', () => {
      let failed = false;
      ljos('--foo hey')
        .strict()
        .option('foo', {type: 'boolean', hidden: true})
        .fail(msg => {
          msg.should.equal('Unknown argument: hey');
          failed = true;
        })
        .parse();
      failed.should.equal(true);
    });

    it('does not fail if an alias is provided, rather than option itself', () => {
      const args = ljos('--cat')
        .strict()
        .command({
          cmd: '$0',
          desc: 'default desc',
          builder: ljos =>
            ljos.option('foo', {type: 'boolean', aliases: ['bar', 'cat']}),
        })
        .fail(_msg => {
          console.log({_msg});
          expect.fail();
        })
        .parse();
      args.cat.should.equal(true);
      args.foo.should.equal(true);
      args.bar.should.equal(true);
    });

    // // TODO: fix this, not being parsed correctly
    // it('does not fail when unrecognized option is passed after --', () => {
    //   const args = ljos('ahoy patrick -- --arrr')
    //     .strict()
    //     .command('ahoy <matey>', 'piratical courtesy', ljos =>
    //       ljos.positional('matey', {type: 'string', required: true})
    //     )
    //     .option('arrr', {boolean: true})
    //     .fail(msg => {
    //       expect.fail(msg);
    //     })
    //     .parse();
    //   args.matey.should.equal('patrick');
    //   args._.should.deep.equal(['ahoy', '--arrr']);
    // });

    it('does not fail with options of various types', () => {
      ljos
        .command({
          cmd: 'cmd',
          desc: 'cmd desc',
          builder: ljos =>
            ljos
              .option('opt1', {type: 'boolean'})
              .option('opt2', {type: 'string', array: true})
              .option('opt3', {type: 'number'})
              .option('opt4', {type: 'string'})
              .fail(() => {
                expect.fail();
              }),
          handler: ({opt1, opt2, opt3, opt4}) => {
            opt1.should.equal(true);
            opt2.should.deep.equal(['foo', 'bar']);
            opt3.should.equal(5);
            opt4.should.equal('baz');
          },
        })
        .help()
        .strict()
        .parse('cmd --opt1 --opt2 foo --opt2 bar --opt3 5 --opt4 baz');
    });
  });

  describe('option (required)', () => {
    it('allows multiple options to be required', () => {
      let failed = false;
      ljos('-a 10 marsupial')
        .command({
          cmd: '$0 <animal>',
          desc: 'default command',
          builder: ljos =>
            ljos
              .option('a', {type: 'number', required: true})
              .option('b', {type: 'number', required: true})
              .positional('animal', {type: 'string', required: true}),
        })
        .fail(msg => {
          msg.should.equal('Missing required argument: b');
          failed = true;
        })
        .parse();

      failed.should.equal(true);
    });

    it('allows required in option definition', () => {
      let failed = false;
      ljos('-a 10 marsupial')
        .option('c', {
          required: true,
        })
        .fail(msg => {
          msg.should.equal('Missing required argument: c');
          failed = true;
        })
        .parse();

      failed.should.equal(true);
    });
  });

  describe('demandCommand', () => {
    // TODO: I removed usage
    // it('should return a custom failure message when too many non-hyphenated arguments are found after a demand count', () => {
    //   const r = checkUsage(() =>
    //     ljos(['src', 'dest'])
    //       .usage(
    //         'Usage: $0 [x] [y] [z] {OPTIONS} <src> <dest> [extra_files...]'
    //       )
    //       .demandCommand(
    //         0,
    //         1,
    //         'src and dest files are both required',
    //         'too many arguments are provided'
    //       )
    //       .wrap(null)
    //       .help(false)
    //       .version(false)
    //       .parse()
    //   );
    //   r.should.have.property('result');
    //   r.should.have.property('logs').with.length(0);
    //   r.should.have.property('exit').and.to.equal(true);
    //   r.result.should.have.property('_').and.deep.equal(['src', 'dest']);
    //   r.errors
    //     .join('\n')
    //     .split(/\n+/)
    //     .should.deep.equal([
    //       'Usage: usage [x] [y] [z] {OPTIONS} <src> <dest> [extra_files...]',
    //       'too many arguments are provided',
    //     ]);
    // });

    // see: https://github.com/ljos/ljos/pull/438
    it('allows a custom min message to be provided', () => {
      let failed = false;
      ljos('-a 10 marsupial')
        .option('a', {type: 'number'})
        .demandCommand(2, 'totes got $0 totes expected $1')
        .fail(msg => {
          msg.should.equal('totes got 1 totes expected 2');
          failed = true;
        })
        .parse();

      failed.should.equal(true);
    });

    // see: https://github.com/ljos/ljos/pull/438
    it('allows a custom min and max message to be provided', () => {
      let failed = false;
      ljos('-a 10 marsupial mammal bro')
        .option('a', {type: 'number'})
        .demandCommand(
          1,
          2,
          'totes too few, got $0 totes expected $1',
          'totes too many, got $0 totes expected $1'
        )
        .fail(msg => {
          msg.should.equal('totes too many, got 3 totes expected 2');
          failed = true;
        })
        .parse();
      failed.should.equal(true);
    });

    it('defaults to demanding 1 command', () => {
      let failed = false;
      ljos('-a 10')
        .command({cmd: 'cmd1', desc: 'cmd1 desc'})
        .option('a', {type: 'number'})
        .demandCommand()
        .fail(msg => {
          msg.should.equal(
            'Not enough non-option arguments: got 0, need at least 1'
          );
          failed = true;
        })
        .parse();

      failed.should.equal(true);
    });

    // See: https://github.com/ljos/ljos/issues/1732
    it('treats positionals in "--" towards count requirement', () => {
      ljos('--cool man -- batman robin')
        .demandCommand(2)
        .fail(msg => {
          throw Error(msg);
        })
        .parse();
    });
  });

  describe('strictCommands', () => {
    it('succeeds in parse if command is known', () => {
      const parsed = ljos('foo -a 10')
        .strictCommands()
        .command({
          cmd: 'foo',
          desc: 'foo command',
          builder: ljos => ljos.option('a', {type: 'number'}),
        })
        .parse();
      parsed.a.should.equal(10);
      parsed._.should.eql(['foo']);
    });

    it('succeeds in parse if top level and inner command are known', () => {
      const parsed = ljos('foo bar --cool beans')
        .strictCommands()
        .command({
          cmd: 'foo',
          desc: 'foo command',
          builder: ljos => {
            ljos.command({
              cmd: 'bar',
              desc: 'bar desc',
              builder: ljos => ljos.option('cool', {type: 'string'}),
            });
          },
        })
        .parse();
      parsed.cool.should.equal('beans');
      parsed._.should.eql(['foo', 'bar']);
    });

    // // TODO: wrong command, a treated as bool opt, 10 treated as positional
    // it('fails with error if command is unknown', () => {
    //   let failed = false;
    //   ljos('blerg -a 10')
    //     .strictCommands()
    //     .command('foo', 'foo command', ljos =>
    //       ljos.option('a', {type: 'number'})
    //     )
    //     .fail(msg => {
    //       msg.should.equal('Unknown command: blerg');
    //       failed = true;
    //     })
    //     .parse();
    //   failed.should.equal(true);
    // });

    // // TODO: wrong command, cool treated as boolean opt, beans treated as positional
    // it('fails with error if inner command is unknown', () => {
    //   let failed = false;
    //   ljos('foo blarg --cool beans')
    //     .strictCommands()
    //     .command('foo', 'foo command', ljos => {
    //       ljos.command('bar', 'bar desc', ljos =>
    //         ljos.option('cool', {type: 'number'})
    //       );
    //     })
    //     .fail(msg => {
    //       msg.should.equal('Unknown command: blarg');
    //       failed = true;
    //     })
    //     .parse();
    //   failed.should.equal(true);
    // });

    // // TODO: wrong command, cool treated as boolean opt, beans treated as positional
    // it('does not apply implicit strictCommands to inner commands', () => {
    //   const argv = ljos('foo blarg --cool beans')
    //     .demandCommand()
    //     .command('foo', 'foo command', ljos => {
    //       ljos.command('bar', 'bar desc', ljos =>
    //         ljos.option('cool', {type: 'string'})
    //       );
    //     })
    //     .parse();
    //   argv.cool.should.equal('beans');
    //   argv._.should.eql(['foo', 'blarg']);
    // });

    it('allows strictCommands to be applied to inner commands', () => {
      let failed = false;
      ljos('foo blarg')
        .command({
          cmd: 'foo',
          desc: 'foo command',
          builder: ljos => {
            ljos.command({cmd: 'bar', desc: 'bar desc'}).strictCommands();
          },
        })
        .fail(msg => {
          msg.should.equal('Unknown command: blarg');
          failed = true;
        })
        .parse();
      failed.should.equal(true);
    });
  });

  describe('strictOptions', () => {
    it('succeeds if option is known and command is unknown', () => {
      const argv = ljos('bar -a 10')
        .command({cmd: 'foo', desc: 'foo command'})
        .option('a', {
          desc: 'a is for option',
          type: 'number',
        })
        .strictOptions()
        .parse();
      argv.a.should.equal(10);
    });

    it('fails if option is unknown', () => {
      let failed = false;
      const argv = ljos('bar -a 10')
        .strictOptions()
        .fail(msg => {
          expect(msg).to.match(/Unknown argument: a/);
          failed = true;
        })
        .parse();
      // argv.a.should.equal(10); // TODO: "a" is unknown so it is treated as boolean
      failed.should.equal(true);
    });

    it('applies strict options when commands are invoked', () => {
      ljos()
        .strictOptions()
        .parse('foo --cool --awesome', err => {
          expect(err).to.match(/Unknown arguments: cool, awesome/);
        });
    });

    it('allows strict options to be turned off', () => {
      const y = ljos()
        .strictOptions()
        .command({
          cmd: 'foo',
          desc: 'foo command',
          builder: ljos => {
            ljos.strictOptions(false);
          },
        });
      y.parse('foo --cool --awesome', err => {
        expect(err).to.equal(null);
      });
      y.parse('--cool --awesome', err => {
        expect(err).to.match(/Unknown arguments: cool, awesome/);
      });
    });
  });
});
