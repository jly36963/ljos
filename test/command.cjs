'use strict';
const {describe, it, beforeEach} = require('mocha');
const assert = require('assert');
const ljos = require('../index.cjs');
const expect = require('chai').expect;
const {checkOutput, noop} = require('./helpers/utils.cjs');
const {stringify} = require('querystring');

/* eslint-disable no-unused-vars */

// TODO: use .exitProcess(false)

require('chai').should();

async function wait() {
  return new Promise(resolve => {
    setTimeout(resolve, 10);
  });
}

describe('Command', () => {
  beforeEach(() => {
    ljos.getInternalMethods().reset();
  });

  describe('positional arguments', () => {
    it('parses command string and populates optional and required positional arguments', () => {
      const y = ljos([]).command(
        'foo <bar> [awesome]',
        'my awesome command',
        ljos => ljos
      );
      const command = y.getInternalMethods().getCommandInstance();
      const handlers = command.getCommandHandlers();
      handlers.foo.demanded.should.deep.include({
        cmd: ['bar'],
        variadic: false,
      });
      handlers.foo.optional.should.deep.include({
        cmd: ['awesome'],
        variadic: false,
      });
    });

    it('populates inner argv with positional arguments', () => {
      let called = false;
      ljos('foo hello world')
        .command(
          'foo <bar> [awesome]',
          'my awesome command',
          ljos =>
            ljos
              .positional('bar', {type: 'string', required: true})
              .positional('awesome', {type: 'string'}),
          argv => {
            argv._.should.include('foo');
            argv.bar.should.equal('hello');
            argv.awesome.should.equal('world');
            called = true;
          }
        )
        .parse();
      expect(called).to.equal(true);
    });

    it('populates outer argv with positional arguments when unknown-options-as-args is not set', () => {
      const argv = ljos('foo hello world')
        .command('foo <bar> [awesome]', 'foo desc', ljos =>
          ljos
            .positional('bar', {type: 'string', required: true})
            .positional('awesome', {type: 'string'})
        )
        .parse();

      argv._.should.include('foo');
      argv.should.have.property('bar', 'hello');
      argv.should.have.property('awesome', 'world');
    });

    // // TODO: convert keys to camel-case
    // it('populates argv with camel-case variants of arguments when possible', () => {
    //   const argv = ljos('foo hello world')
    //     .command('foo <foo-bar> [baz-qux]', 'foo desc', ljos =>
    //       ljos
    //         .positional('foo-bar', {type: 'string', required: true})
    //         .positional('baz-qux', {type: 'string'})
    //     )
    //     .parse();

    //   argv._.should.include('foo');
    //   // argv['foo-bar'].should.equal('hello');
    //   argv.fooBar.should.equal('hello');
    //   argv.bazQux.should.equal('world');
    //   // argv['baz-qux'].should.equal('world');
    // });

    // // TODO: convert keys to camel-case
    // it('populates argv with camel-case variants of variadic args when possible', () => {
    //   const argv = ljos('foo hello world !')
    //     .command('foo <foo-bar> [baz-qux..]', 'foo desc', ljos =>
    //       ljos
    //         .positional('foo-bar', {type: 'string', required: true})
    //         .positional('baz-qux', {type: 'string', array: true})
    //     )
    //     .parse();

    //   argv._.should.include('foo');
    //   argv['foo-bar'].should.equal('hello');
    //   argv.fooBar.should.equal('hello');
    //   argv.bazQux.should.deep.equal(['world', '!']);
    //   argv['baz-qux'].should.deep.equal(['world', '!']);
    // });

    it("populates subcommand's inner argv with positional arguments", () => {
      ljos('foo bar hello world')
        .command('foo', 'my awesome command', ljos =>
          ljos.command(
            'bar <greeting> [recipient]',
            'subcommands are cool',
            ljos =>
              ljos
                .positional('greeting', {type: 'string', required: true})
                .positional('recipient', {type: 'string'}),
            argv => {
              argv._.should.deep.equal(['foo', 'bar']);
              argv.greeting.should.equal('hello');
              argv.recipient.should.equal('world');
            }
          )
        )
        .parse();
    });

    // // TODO: wtf are they doing here?
    // it('ignores positional args for aliases', () => {
    //   const y = ljos([]).command(
    //     ['foo [awesome]', 'wat <yo>'],
    //     'my awesome command',
    //     ljos => ljos.positional('awesome', {type: 'string'})
    //   );
    //   const command = y.getInternalMethods().getCommandInstance();
    //   const handlers = command.getCommandHandlers();
    //   handlers.foo.optional.should.deep.include({
    //     cmd: ['awesome'],
    //     variadic: false,
    //   });
    //   handlers.foo.demanded.should.deep.equal([]);
    //   expect(handlers.wat).to.equal(undefined);
    //   command.getCommands().should.deep.equal(['foo', 'wat']);
    // });

    it('does not overwrite existing values in argv for keys that are not positional', () => {
      const argv = ljos('foo foo.js --reporter=html')
        .command('foo <file>', 'foo desc', ljos =>
          ljos
            .positional('file', {type: 'string', required: true})
            .option('reporter', {type: 'string', default: 'text'})
        )
        // .default('reporter', 'text')
        .parse();
      argv.file.should.equal('foo.js');
      argv.reporter.should.equal('html');
    });

    // see: https://github.com/ljos/ljos/issues/1457
    it('handles -- in conjunction with positional arguments', () => {
      let called = false;
      const argv = ljos('foo hello world series -- apple banana')
        .command(
          'foo <bar> [awesome...]',
          'my awesome command',
          ljos =>
            ljos
              .positional('bar', {type: 'string', required: true})
              .positional('awesome', {
                type: 'string',
                array: true,
              }),
          argv2 => {
            argv2.bar.should.eql('hello');
            argv2.awesome.should.eql(['world', 'series']);
            argv2._.should.eql(['foo']);
            argv2['--'].should.eql(['apple', 'banana']);
            called = true;
          }
        )
        .parse();
      argv.bar.should.eql('hello');
      argv.awesome.should.eql(['world', 'series']);
      argv._.should.eql(['foo']);
      argv['--'].should.eql(['apple', 'banana']);
      called.should.equal(true);
    });

    // Addresses: https://github.com/ljos/ljos/issues/1637
    it('supports variadic positionals', () => {
      ljos
        .cmd({
          command: 'cmd1 <foods..>',
          description: 'cmd1 desc',
          builder: ljos =>
            ljos.positional('foods', {
              description: 'foods desc',
              type: 'string',
              array: true,
            }),
          handler: argv => {
            argv.foods.should.deep.equal(['apples', 'cherries', 'grapes']);
          },
        })
        .parse('cmd1 apples cherries grapes');
    });

    it('supports array options', () => {
      ljos
        .cmd({
          command: 'cmd1',
          description: 'cmd1 desc',
          builder: ljos =>
            ljos.option('foods', {
              description: 'foods desc',
              type: 'string',
              array: true,
            }),
          handler: argv => {
            argv.foods.should.deep.equal(['apples', 'cherries', 'grapes']);
          },
        })
        .parse('cmd apples cherries grapes');
    });

    it('does not overwrite options in argv if variadic and when using default command', () => {
      ljos
        .cmd({
          command: '$0 [foods..]',
          description: 'default desc',
          builder: ljos =>
            ljos.positional('foods', {
              description: 'foods desc',
              type: 'string',
              array: true,
            }),
          handler: argv => {
            argv.foods.should.deep.equal(['apples', 'cherries', 'grapes']);
          },
        })
        .parse('apples cherries grapes');
    });

    it('does not combine positional default and provided values', () => {
      ljos()
        .cmd({
          command: 'cmd [foods..]',
          description: 'cmd desc',
          builder: ljos =>
            ljos.positional('foods', {
              description: 'foods desc',
              type: 'string',
              default: ['pizza', 'wings'],
            }),
          handler: argv => {
            argv.foods.should.deep.equal(['apples', 'cherries', 'grapes']);
            argv.foods.should.not.include('pizza');
          },
        })
        .parse('cmd apples cherries grapes');
    });

    // TODO: convert to camel-case
    // it('does not combine config values and provided values', () => {
    //   ljos('foo bar baz qux')
    //     .cmd({
    //       command: '$0 <arg-1> [arg-2] [arg-3..]',
    //       description: 'default description',
    //       builder: ljos =>
    //         ljos
    //           .option('arg-1', {type: 'string', required: true})
    //           .option('arg-2', {type: 'string'})
    //           .option('arg-3', {type: 'string', array: true})
    //           .config({
    //             arg2: 'bar',
    //             arg3: ['baz', 'qux'],
    //           }),
    //       handler: argv => {
    //         argv.arg1.should.equal('foo');
    //         argv.arg2.should.equal('bar');
    //         argv.arg3.should.deep.equal(['baz', 'qux']);
    //         argv['arg-3'].should.deep.equal(['baz', 'qux']);
    //       },
    //     })
    //     .strict()
    //     .parse();
    // });

    it('does not overwrite options in argv if variadic and preserves falsy values', () => {
      ljos
        .cmd({
          command: '$0 [numbers..]',
          description: 'default desc',
          builder: ljos =>
            ljos.positional('numbers', {
              description: 'numbers desc',
              type: 'number',
              array: true,
            }),
          handler: argv => {
            argv.numbers.should.deep.equal([0, 1, 2]);
          },
        })
        .parse('--numbers 0 1 2');
    });
  });

  describe('variadic', () => {
    it('allows required arguments to be variadic', () => {
      const argv = ljos('foo /root file1 file2 file3')
        .command('foo <root> <files..>', 'foo desc', ljos =>
          ljos
            .positional('root', {type: 'string', required: true})
            .positional('files', {type: 'string', required: true})
        )
        .parse();

      argv.root.should.equal('/root');
      argv.files.should.deep.equal(['file1', 'file2', 'file3']);
    });

    it('allows optional arguments to be variadic', () => {
      const argv = ljos('foo /root file1 file2 file3')
        .command('foo <root> [files..]', 'foo desc', ljos =>
          ljos
            .positional('root', {type: 'string', required: true})
            .positional('files', {type: 'string', array: true})
        )
        .parse();

      argv.root.should.equal('/root');
      argv.files.should.deep.equal(['file1', 'file2', 'file3']);
    });

    it('fails if required arguments are missing', () => {
      ljos('foo /root')
        .command('foo <root> <files..>', 'foo desc', ljos =>
          ljos
            .positional('root', {type: 'string', required: true})
            .positional('files', {type: 'string', required: true, array: true})
        )
        .fail(err => {
          err.should.match(/Not enough non-option arguments/);
        })
        .parse();
    });

    it('does not fail if zero optional arguments are provided', () => {
      const argv = ljos('foo /root')
        .command('foo <root> [files...]', 'foo desc', ljos =>
          ljos
            .positional('root', {type: 'string', required: true})
            .positional('files', {type: 'string', array: true})
        )
        .parse();

      argv.root.should.equal('/root');
      argv.files.should.deep.equal([]);
    });

    // TODO: I want this to work as intended
    it('only allows the last argument to be variadic', () => {
      const argv = ljos('foo /root file1 file2')
        .command('foo <root..> <file>', 'foo desc', ljos =>
          ljos
            .positional('root', {type: 'string', array: true, required: true})
            .positional('file', {type: 'string', required: true})
        )
        .parse();

      argv.root.should.equal('/root');
      argv.file.should.equal('file1');
      argv._.should.include('file2');
    });

    // addresses: https://github.com/ljos/ljos/issues/1246
    it('allows camel-case, variadic arguments, and strict mode to be combined', () => {
      const argv = ljos('ls one two three')
        .command('ls [expandMe...]', 'ls desc', ljos =>
          ljos.positional('expandMe', {type: 'string', array: true})
        )
        .strict()
        .parse();

      argv.expandMe.should.deep.equal(['one', 'two', 'three']);
    });
  });

  describe('missing positional arguments', () => {
    it('fails if a required argument is missing', done => {
      const argv = ljos('foo hello')
        .command(
          'foo <bar> <awesome>',
          'foo desc',
          ljos =>
            ljos
              .positional('bar', {type: 'string', required: true})
              .positional('awesome', {type: 'string', required: true}),
          _argv => {
            expect.fail();
          }
        )
        .fail(err => {
          // err.should.match(/Missing required argument: awesome/);
          err.should.match(/got 1, need at least 2/);
          return done(); // Pass before fail is called again with different error
        })
        .parse();

      argv.bar.should.equal('hello');
    });

    it('does not fail if optional argument is missing', () => {
      const argv = ljos('foo hello')
        .command('foo <bar> [awesome]', 'foo desc', ljos =>
          ljos.positional('bar', {type: 'string', required: true})
        )
        .parse();

      expect(argv.awesome).to.equal(undefined);
      argv.bar.should.equal('hello');
    });
  });

  describe('API', () => {
    it('accepts string, string as first 2 arguments', () => {
      const cmd = 'foo';
      const desc = "i'm not feeling very creative at the moment";
      const isDefault = false;
      const aliases = [];
      const deprecated = false;

      const y = ljos([]).command(cmd, desc);
      const commands = y.getInternalMethods().getUsageInstance().getCommands();
      commands[0].should.deep.equal([
        cmd,
        desc,
        isDefault,
        aliases,
        deprecated,
      ]);
    });

    it('accepts command with aliases', () => {
      const aliases = ['bar', 'baz'];
      const cmd = 'foo <qux>';
      const desc = "i'm not feeling very creative at the moment";
      const isDefault = false;
      const deprecated = false;

      const y = ljos([]).command(cmd, desc, noop, noop, {aliases});
      const usageCommands = y
        .getInternalMethods()
        .getUsageInstance()
        .getCommands();
      usageCommands[0].should.deep.equal([
        cmd,
        desc,
        isDefault,
        aliases,
        deprecated,
      ]);
      const cmdCommands = y
        .getInternalMethods()
        .getCommandInstance()
        .getCommands();
      cmdCommands.should.deep.equal(['foo', 'bar', 'baz']);
    });

    it('accepts string, boolean as first 2 arguments', () => {
      const cmd = 'foo';
      const desc = false;

      const y = ljos([]).command(cmd, desc, noop, noop);
      const commands = y.getInternalMethods().getUsageInstance().getCommands();
      commands.should.deep.equal([]);
    });

    it('accepts array, boolean as first 2 arguments', () => {
      const aliases = ['bar', 'baz'];
      const cmd = 'foo <qux>';
      const desc = false;

      const y = ljos([]).command(cmd, desc, noop, noop, {
        aliases,
      });
      const usageCommands = y
        .getInternalMethods()
        .getUsageInstance()
        .getCommands();
      usageCommands.should.deep.equal([]);
      const cmdCommands = y
        .getInternalMethods()
        .getCommandInstance()
        .getCommands();
      cmdCommands.should.deep.equal(['foo', 'bar', 'baz']);
    });

    it('accepts builder function as 3rd argument', () => {
      const cmd = 'foo';
      const desc = "i'm not feeling very creative at the moment";
      const builder = ljos => ljos;

      const y = ljos([]).command(cmd, desc, builder);
      const handlers = y
        .getInternalMethods()
        .getCommandInstance()
        .getCommandHandlers();
      handlers.foo.original.should.equal(cmd);
      handlers.foo.builder.should.equal(builder);
    });

    it('accepts builder function as 3rd argument (2)', () => {
      const cmd = 'foo';
      const desc = "i'm not feeling very creative at the moment";
      const builder = ljos =>
        ljos.option('hello', {type: 'string', default: 'world'});

      const y = ljos([]).command(cmd, desc, builder);
      const handlers = y
        .getInternalMethods()
        .getCommandInstance()
        .getCommandHandlers();
      handlers.foo.original.should.equal(cmd);
      handlers.foo.builder.should.equal(builder);
    });

    it('accepts deprecated as 5th argument', () => {
      const command = 'command';
      const description = 'description';
      const isDefault = false;
      const aliases = [];
      const deprecated = false;
      const y = ljos([]).command(command, description, noop, noop, {
        deprecated,
        aliases,
      });
      const usageCommands = y
        .getInternalMethods()
        .getUsageInstance()
        .getCommands();
      usageCommands[0].should.deep.equal([
        command,
        description,
        isDefault,
        aliases,
        deprecated,
      ]);
    });
  });

  describe('cmd', () => {
    it('accepts module (with noop builder/handler)', () => {
      const command = 'foo';
      const description = "I'm not feeling very creative at the moment";

      const y = ljos([]).cmd({
        command,
        description,
        builder: noop,
        handler: noop,
      });
      const handlers = y
        .getInternalMethods()
        .getCommandInstance()
        .getCommandHandlers();
      handlers.foo.original.should.equal(command);
      handlers.foo.builder.should.equal(noop);
      handlers.foo.handler.should.equal(noop);
    });

    it('accepts module (with builder object and handler function) as 3rd argument', () => {
      const command = 'foo';
      const description = "i'm not feeling very creative at the moment";
      const builder = ljos =>
        ljos.option('hello', {type: 'string', default: 'world'});

      const y = ljos([]).cmd({
        command,
        description,
        builder,
        handler: noop,
      });
      const handlers = y
        .getInternalMethods()
        .getCommandInstance()
        .getCommandHandlers();
      handlers.foo.original.should.equal(command);
      handlers.foo.builder.should.equal(builder);
      handlers.foo.handler.should.equal(noop);
    });

    it('accepts module (empty middleware and aliases)', () => {
      const command = 'foo';
      const description = "I'm not feeling very creative at the moment";
      const aliases = [];
      const middleware = [];
      const module = {
        command,
        description,
        builder: noop,
        handler: noop,
        middleware,
        aliases,
      };
      const isDefault = false;
      const deprecated = false;

      const y = ljos([]).cmd(module);
      const handlers = y
        .getInternalMethods()
        .getCommandInstance()
        .getCommandHandlers();
      handlers.foo.original.should.equal(module.command);
      handlers.foo.builder.should.equal(module.builder);
      handlers.foo.handler.should.equal(module.handler);
      const commands = y.getInternalMethods().getUsageInstance().getCommands();
      commands[0].should.deep.equal([
        module.command,
        module.description,
        isDefault,
        aliases,
        deprecated,
      ]);
    });

    // DUPLICATE OF ABOVE (after my changes)
    // it('accepts module (description key, builder function) as 1st argument', () => {
    //   const module = {
    //     command: 'foo',
    //     description: "i'm not feeling very creative at the moment",
    //     builder(ljos) {
    //       return ljos;
    //     },
    //     handler(argv) {},
    //   };
    //   const isDefault = false;
    //   const aliases = [];
    //   const deprecated = false;

    //   const y = ljos([]).cmd(module);
    //   const handlers = y
    //     .getInternalMethods()
    //     .getCommandInstance()
    //     .getCommandHandlers();
    //   handlers.foo.original.should.equal(module.command);
    //   handlers.foo.builder.should.equal(module.builder);
    //   handlers.foo.handler.should.equal(module.handler);
    //   const commands = y.getInternalMethods().getUsageInstance().getCommands();
    //   commands[0].should.deep.equal([
    //     module.command,
    //     module.description,
    //     isDefault,
    //     aliases,
    //     deprecated,
    //   ]);
    // });

    // DUPLICATE OF ABOVE (after my changes)
    // it('accepts module (desc key, builder function) as 1st argument', () => {
    //   const module = {
    //     command: 'foo',
    //     description: "i'm not feeling very creative at the moment",
    //     builder(ljos) {
    //       return ljos;
    //     },
    //     handler(argv) {},
    //   };
    //   const isDefault = false;
    //   const aliases = [];
    //   const deprecated = false;

    //   const y = ljos([]).cmd(module);
    //   const handlers = y
    //     .getInternalMethods()
    //     .getCommandInstance()
    //     .getCommandHandlers();
    //   handlers.foo.original.should.equal(module.command);
    //   handlers.foo.builder.should.equal(module.builder);
    //   handlers.foo.handler.should.equal(module.handler);
    //   const commands = y.getInternalMethods().getUsageInstance().getCommands();
    //   commands[0].should.deep.equal([
    //     module.command,
    //     module.desc,
    //     isDefault,
    //     aliases,
    //     deprecated,
    //   ]);
    // });

    it('accepts module (false description, builder function) as 1st argument', () => {
      const module = {
        command: 'foo',
        description: false,
        builder: noop,
        handler: noop,
      };

      const y = ljos([]).cmd(module);
      const handlers = y
        .getInternalMethods()
        .getCommandInstance()
        .getCommandHandlers();
      handlers.foo.original.should.equal(module.command);
      handlers.foo.builder.should.equal(noop);
      handlers.foo.handler.should.equal(noop);
      const commands = y.getInternalMethods().getUsageInstance().getCommands();
      commands.should.deep.equal([]);
    });

    it('accepts module (missing description, builder function) as 1st argument', () => {
      const module = {
        command: 'foo',
        builder: noop,
        handler: noop,
      };

      const y = ljos([]).cmd(module);
      const handlers = y
        .getInternalMethods()
        .getCommandInstance()
        .getCommandHandlers();
      handlers.foo.original.should.equal(module.command);
      handlers.foo.builder.should.equal(noop);
      handlers.foo.handler.should.equal(noop);
      const commands = y.getInternalMethods().getUsageInstance().getCommands();
      commands.should.deep.equal([]);
    });

    it('accepts module (description key, builder func) as 1st argument', () => {
      const module = {
        command: 'foo',
        description: "i'm not feeling very creative at the moment",
        builder: ljos =>
          ljos.option('hello', {type: 'string', default: 'world'}),
        handler: noop,
      };
      const isDefault = false;
      const aliases = [];
      const deprecated = false;

      const y = ljos([]).cmd(module);
      const handlers = y
        .getInternalMethods()
        .getCommandInstance()
        .getCommandHandlers();
      handlers.foo.original.should.equal(module.command);
      handlers.foo.builder.should.equal(module.builder);
      handlers.foo.handler.should.equal(module.handler);
      const commands = y.getInternalMethods().getUsageInstance().getCommands();
      commands[0].should.deep.equal([
        module.command,
        module.description,
        isDefault,
        aliases,
        deprecated,
      ]);
    });

    it('accepts module (missing handler function)', () => {
      const module = {
        command: 'foo',
        description: "i'm not feeling very creative at the moment",
        builder: ljos =>
          ljos.option('hello', {type: 'string', default: 'world'}),
      };
      const isDefault = false;
      const aliases = [];
      const deprecated = false;

      const y = ljos([]).cmd(module);
      const handlers = y
        .getInternalMethods()
        .getCommandInstance()
        .getCommandHandlers();
      handlers.foo.original.should.equal(module.command);
      handlers.foo.builder.should.equal(module.builder);
      expect(typeof handlers.foo.handler).to.equal('function');
      const commands = y.getInternalMethods().getUsageInstance().getCommands();
      commands[0].should.deep.equal([
        module.command,
        module.description,
        isDefault,
        aliases,
        deprecated,
      ]);
    });

    // I REMOVED command AS array type
    // it('accepts module (with command array)', () => {
    //   const module = {
    //     command: ['foo <qux>', 'bar', 'baz'],
    //     description: "i'm not feeling very creative at the moment",
    //     builder: noop,
    //     handler: noop,
    //   };
    //   const isDefault = false;
    //   const deprecated = false;

    //   const y = ljos([]).cmd(module);
    //   const handlers = y
    //     .getInternalMethods()
    //     .getCommandInstance()
    //     .getCommandHandlers();
    //   handlers.foo.original.should.equal(module.command[0]);
    //   handlers.foo.builder.should.equal(module.builder);
    //   handlers.foo.handler.should.equal(module.handler);
    //   const usageCommands = y
    //     .getInternalMethods()
    //     .getUsageInstance()
    //     .getCommands();
    //   usageCommands[0].should.deep.equal([
    //     module.command[0],
    //     module.description,
    //     isDefault,
    //     ['bar', 'baz'],
    //     deprecated,
    //   ]);
    //   const cmdCommands = y
    //     .getInternalMethods()
    //     .getCommandInstance()
    //     .getCommands();
    //   cmdCommands.should.deep.equal(['foo', 'bar', 'baz']);
    // });

    it('accepts module (with command string and aliases array)', () => {
      const module = {
        command: 'foo <qux>',
        aliases: ['bar', 'baz'],
        description: "i'm not feeling very creative at the moment",
        builder: noop,
        handler: noop,
      };
      const isDefault = false;
      const deprecated = false;

      const y = ljos([]).cmd(module);
      const handlers = y
        .getInternalMethods()
        .getCommandInstance()
        .getCommandHandlers();
      handlers.foo.original.should.equal(module.command);
      handlers.foo.builder.should.equal(module.builder);
      handlers.foo.handler.should.equal(module.handler);
      const usageCommands = y
        .getInternalMethods()
        .getUsageInstance()
        .getCommands();
      usageCommands[0].should.deep.equal([
        module.command,
        module.description,
        isDefault,
        module.aliases,
        deprecated,
      ]);
      const cmdCommands = y
        .getInternalMethods()
        .getCommandInstance()
        .getCommands();
      cmdCommands.should.deep.equal(['foo', 'bar', 'baz']);
    });

    // I REMOVED command AS array
    // it('accepts module (with command array and aliases array)', () => {
    //   const module = {
    //     command: ['foo <qux>', 'bar'],
    //     aliases: ['baz', 'nat'],
    //     description: "i'm not feeling very creative at the moment",
    //     builder: noop,
    //     handler: noop,
    //   };
    //   const isDefault = false;
    //   const deprecated = false;

    //   const y = ljos([]).cmd(module);
    //   const handlers = y
    //     .getInternalMethods()
    //     .getCommandInstance()
    //     .getCommandHandlers();
    //   handlers.foo.original.should.equal(module.command[0]);
    //   handlers.foo.builder.should.equal(module.builder);
    //   handlers.foo.handler.should.equal(module.handler);
    //   const usageCommands = y
    //     .getInternalMethods()
    //     .getUsageInstance()
    //     .getCommands();
    //   usageCommands[0].should.deep.equal([
    //     module.command[0],
    //     module.description,
    //     isDefault,
    //     ['bar', 'baz', 'nat'],
    //     deprecated,
    //   ]);
    //   const cmdCommands = y
    //     .getInternalMethods()
    //     .getCommandInstance()
    //     .getCommands();
    //   cmdCommands.should.deep.equal(['foo', 'bar', 'baz', 'nat']);
    // });

    it('accepts module (with command string and aliases array)', () => {
      const module = {
        command: 'foo <qux>',
        aliases: ['bar'],
        description: "i'm not feeling very creative at the moment",
        builder: noop,
        handler: noop,
      };
      const isDefault = false;
      const deprecated = false;

      const y = ljos([]).cmd(module);
      const handlers = y
        .getInternalMethods()
        .getCommandInstance()
        .getCommandHandlers();
      handlers.foo.original.should.equal(module.command);
      handlers.foo.builder.should.equal(module.builder);
      handlers.foo.handler.should.equal(module.handler);
      const usageCommands = y
        .getInternalMethods()
        .getUsageInstance()
        .getCommands();
      usageCommands[0].should.deep.equal([
        module.command,
        module.description,
        isDefault,
        ['bar'],
        deprecated,
      ]);
      const cmdCommands = y
        .getInternalMethods()
        .getCommandInstance()
        .getCommands();
      cmdCommands.should.deep.equal(['foo', 'bar']);
    });
  });

  describe('commandDir', () => {
    // REMOVED FS LOGIC
    // it('supports relative dirs', () => {
    //   const r = checkOutput(() =>
    //     ljos('--help').wrap(null).commandDir('fixtures/cmddir').parse()
    //   );
    //   r.exit.should.equal(true);
    //   r.exitCode.should.equal(0);
    //   r.errors.length.should.equal(0);
    //   r.should.have.property('logs');
    //   r.logs
    //     .join('\n')
    //     .split(/\n+/)
    //     .should.deep.equal([
    //       'usage [command]',
    //       'Commands:',
    //       '  usage dream [command] [opts]  Go to sleep and dream',
    //       'Options:',
    //       '  --help     Show help  [boolean]',
    //       '  --version  Show version number  [boolean]',
    //     ]);
    // });
    // REMOVED FS LOGIC
    // it('supports nested subcommands', () => {
    //   const r = checkOutput(
    //     () =>
    //       ljos('dream --help').wrap(null).commandDir('fixtures/cmddir').parse(),
    //     ['./command']
    //   );
    //   r.exit.should.equal(true);
    //   r.errors.length.should.equal(0);
    //   r.logs[0]
    //     .split(/\n+/)
    //     .should.deep.equal([
    //       'command dream [command] [opts]',
    //       'Go to sleep and dream',
    //       'Commands:',
    //       '  command dream of-memory <memory>               Dream about a specific memory',
    //       '  command dream within-a-dream [command] [opts]  Dream within a dream',
    //       'Options:',
    //       '  --help     Show help  [boolean]',
    //       '  --version  Show version number  [boolean]',
    //       '  --shared   Is the dream shared with others?  [boolean]',
    //       '  --extract  Attempt extraction?  [boolean]',
    //     ]);
    // });
    // REMOVED FS LOGIC
    // it('supports a "recurse" boolean option', () => {
    //   const r = checkOutput(() =>
    //     ljos('--help')
    //       .wrap(null)
    //       .commandDir('fixtures/cmddir', {recurse: true})
    //       .parse()
    //   );
    //   r.exit.should.equal(true);
    //   r.errors.length.should.equal(0);
    //   r.logs
    //     .join('\n')
    //     .split(/\n+/)
    //     .should.deep.equal([
    //       'usage [command]',
    //       'Commands:',
    //       '  usage limbo [opts]                     Get lost in pure subconscious',
    //       '  usage inception [command] [opts]       Enter another dream, where inception is possible',
    //       '  usage within-a-dream [command] [opts]  Dream within a dream',
    //       '  usage dream [command] [opts]           Go to sleep and dream',
    //       'Options:',
    //       '  --help     Show help  [boolean]',
    //       '  --version  Show version number  [boolean]',
    //     ]);
    // });
    // REMOVED FS LOGIC
    // it('supports a "visit" function option', () => {
    //   let commandObject;
    //   let pathToFile;
    //   let filename;
    //   const r = checkOutput(() =>
    //     ljos('--help')
    //       .wrap(null)
    //       .commandDir('fixtures/cmddir', {
    //         visit(_commandObject, _pathToFile, _filename) {
    //           commandObject = _commandObject;
    //           pathToFile = _pathToFile;
    //           filename = _filename;
    //           return false; // exclude command
    //         },
    //       })
    //       .parse()
    //   );
    //   commandObject.should.have
    //     .property('command')
    //     .and.equal('dream [command] [opts]');
    //   commandObject.should.have
    //     .property('desc')
    //     .and.equal('Go to sleep and dream');
    //   commandObject.should.have.property('builder');
    //   commandObject.should.have.property('handler');
    //   pathToFile.should.contain(
    //     require('path').join('test', 'fixtures', 'cmddir', 'dream.js')
    //   );
    //   filename.should.equal('dream.js');
    //   r.exit.should.equal(true);
    //   r.errors.length.should.equal(0);
    //   r.logs
    //     .join('\n')
    //     .split(/\n+/)
    //     .should.deep.equal([
    //       'Options:',
    //       '  --help     Show help  [boolean]',
    //       '  --version  Show version number  [boolean]',
    //     ]);
    // });
    // REMOVED FS LOGIC
    // it('detects and ignores cyclic dir references', () => {
    //   const r = checkOutput(
    //     () =>
    //       ljos('cyclic --help')
    //         .wrap(null)
    //         .commandDir('fixtures/cmddir_cyclic')
    //         .parse(),
    //     ['./command']
    //   );
    //   r.exit.should.equal(true);
    //   r.errors.length.should.equal(0);
    //   r.should.have.property('logs');
    //   r.logs
    //     .join('\n')
    //     .split(/\n+/)
    //     .should.deep.equal([
    //       'command cyclic',
    //       'Attempts to (re)apply its own dir',
    //       'Options:',
    //       '  --help     Show help  [boolean]',
    //       '  --version  Show version number  [boolean]',
    //     ]);
    // });
    // REMOVED FS LOGIC
    // it("derives 'command' string from filename when not exported", () => {
    //   const r = checkOutput(() =>
    //     ljos('--help').wrap(null).commandDir('fixtures/cmddir_noname').parse()
    //   );
    //   r.exit.should.equal(true);
    //   r.errors.length.should.equal(0);
    //   r.should.have.property('logs');
    //   r.logs
    //     .join('\n')
    //     .split(/\n+/)
    //     .should.deep.equal([
    //       'usage [command]',
    //       'Commands:',
    //       '  usage nameless  Command name derived from module filename',
    //       'Options:',
    //       '  --help     Show help  [boolean]',
    //       '  --version  Show version number  [boolean]',
    //     ]);
    // });
  });

  // // TODO: fix this
  // describe('help command', () => {
  //   it('displays command help appropriately', () => {
  //     const sub = {
  //       command: 'sub',
  //       description: 'Run the subcommand',
  //       builder: noop,
  //       handler: noop,
  //     };

  //     const cmd = {
  //       command: 'cmd <sub>',
  //       description: 'Try a command',
  //       builder(ljos) {
  //         return ljos.cmd(sub);
  //       },
  //       handler: noop,
  //     };

  //     const helpCmd = checkOutput(
  //       () => ljos('help cmd').wrap(null).cmd(cmd).parse(),
  //       ['./command']
  //     );

  //     const cmdHelp = checkOutput(
  //       () => ljos('cmd help').wrap(null).cmd(cmd).parse(),
  //       ['./command']
  //     );

  //     const helpCmdSub = checkOutput(
  //       () => ljos('help cmd sub').wrap(null).cmd(cmd).parse(),
  //       ['./command']
  //     );

  //     const cmdHelpSub = checkOutput(
  //       () => ljos('cmd help sub').wrap(null).cmd(cmd).parse(),
  //       ['./command']
  //     );

  //     const cmdSubHelp = checkOutput(
  //       () => ljos('cmd sub help').wrap(null).cmd(cmd).parse(),
  //       ['./command']
  //     );

  //     const expectedCmd = [
  //       'command cmd <sub>',
  //       'Try a command',
  //       'Commands:',
  //       '  command cmd sub  Run the subcommand',
  //       'Options:',
  //       '  --help     Show help  [boolean]',
  //       '  --version  Show version number  [boolean]',
  //     ];

  //     const expectedSub = [
  //       'command cmd sub',
  //       'Run the subcommand',
  //       'Options:',
  //       '  --help     Show help  [boolean]',
  //       '  --version  Show version number  [boolean]',
  //     ];

  //     // no help is output if help isn't last
  //     // positional argument.
  //     helpCmd.logs.should.eql([]);
  //     helpCmdSub.logs.should.eql([]);
  //     cmdHelpSub.logs.should.eql([]);

  //     // shows help if it is the last positional argument.
  //     cmdHelp.logs.join('\n').split(/\n+/).should.deep.equal(expectedCmd);
  //     cmdSubHelp.logs.join('\n').split(/\n+/).should.deep.equal(expectedSub);
  //   });
  // });

  // addresses https://github.com/ljos/ljos/issues/514.
  it('respects order of positional arguments when matching commands', () => {
    const output = [];
    ljos('bar foo')
      .command('foo', 'foo command', ljos => {
        output.push('foo');
      })
      .command('bar', 'bar command', ljos => {
        output.push('bar');
      })
      .parse();

    output.should.include('bar');
    output.should.not.include('foo');
  });

  // addresses https://github.com/ljos/ljos/issues/558
  it('handles positional arguments if command is invoked using .parse()', () => {
    const l = ljos().command(
      'foo <second>',
      'the foo command',
      ljos => ljos.positional('second', {type: 'string', required: true}),
      noop
    );
    const argv = l.parse(['foo', 'bar']);
    argv.second.should.equal('bar');
  });

  // addresses https://github.com/ljos/ljos/issues/710
  it('invokes command handler repeatedly if parse() is called multiple times', () => {
    let counter = 0;
    const y = ljos([]).command('foo', 'the foo command', noop, _argv => {
      counter++;
    });
    y.parse(['foo']);
    y.parse(['foo']);
    counter.should.equal(2);
  });

  // Not sure if parse callback is executed
  // addresses: https://github.com/ljos/ljos/issues/776
  it('allows command handler to be invoked repeatedly when help is enabled', () => {
    let counter = 0;
    const y = ljos([]).command('foo', 'the foo command', noop, _argv => {
      counter++;
    });
    y.parse(['foo'], noop);
    y.parse(['foo'], () => {
      counter.should.equal(2);
    });
  });

  // EXITS PROCESS AFTER PARSE
  // // addresses https://github.com/ljos/ljos/issues/522
  // it('does not require builder function to return', () => {
  //   const argv = ljos('yo')
  //     .command(
  //       'yo [someone]',
  //       'Send someone a yo',
  //       ljos => {
  //         ljos.positional('someone', {type: stringify, default: 'Pat'});
  //       },
  //       argv => {
  //         argv.should.have.property('someone').and.equal('Pat');
  //       }
  //     )
  //     .parse();
  //   argv.should.have.property('someone').and.equal('Pat');
  // });

  // EXITS PROCESS AFTER PARSE
  // it('allows builder function to parse argv without returning', () => {
  //   const argv = ljos('yo Jude')
  //     .command(
  //       'yo <someone>',
  //       'Send someone a yo',
  //       ljos => {
  //         ljos.positional('someone', {type: 'string', required: true}).parse();
  //       },
  //       argv => {
  //         argv.should.have.property('someone').and.equal('Jude');
  //       }
  //     )
  //     .parse();
  //   argv.should.have.property('someone').and.equal('Jude');
  // });

  // // EXITS PROCESS AFTER PARSE
  // it('allows builder function to return parsed argv', () => {
  //   const argv = ljos('yo Leslie')
  //     .command(
  //       'yo <someone>',
  //       'Send someone a yo',
  //       ljos =>
  //         ljos.positional('someone', {type: 'string', required: true}).parse(),
  //       argv => {
  //         argv.should.have.property('someone').and.equal('Leslie');
  //       }
  //     )
  //     .parse();
  //   argv.should.have.property('someone').and.equal('Leslie');
  // });

  // addresses https://github.com/ljos/ljos/issues/540
  it('ignores extra spaces in command string', () => {
    const y = ljos([]).command(
      'foo  [awesome]',
      'my awesome command',
      ljos => ljos
    );
    const command = y.getInternalMethods().getCommandInstance();
    const handlers = command.getCommandHandlers();
    handlers.foo.demanded.should.not.include({
      cmd: '',
      variadic: false,
    });
    handlers.foo.demanded.should.have.lengthOf(0);
  });

  it('executes a command via alias', () => {
    let commandCalled = false;
    const argv = ljos('hi world')
      .command(
        'hello <someone>',
        'Say hello',
        ljos => ljos.positional('someone', {type: 'string', required: true}),
        argv => {
          commandCalled = true;
          argv.should.have.property('someone').and.equal('world');
        },
        {aliases: ['hi']}
      )
      .parse();
    argv.should.have.property('someone').and.equal('world');
    commandCalled.should.equal(true);
  });

  describe('positional aliases', () => {
    it('allows an alias to be defined for a required positional argument', () => {
      const argv = ljos('yo Turner 113993')
        .command('yo <user | email> [ssn]', 'Send someone a yo', ljos =>
          ljos
            .positional('user', {
              type: 'string',
              required: true,
              aliases: ['email'],
            })
            .positional('ssn', {type: 'number'})
        )
        .parse();
      argv.user.should.equal('Turner');
      argv.email.should.equal('Turner');
      argv.ssn.should.equal(113993);
    });

    it('allows an alias to be defined for an optional positional argument', () => {
      const argv = ljos('yo 113993')
        .command(
          'yo [ssn|sin]',
          'Send someone a yo',
          ljos => ljos.positional('ssn', {type: 'number', aliases: ['sin']}),
          noop
        )
        .parse();
      argv.ssn.should.equal(113993);
      argv.sin.should.equal(113993);
    });

    it('allows several aliases to be defined for a required positional argument', () => {
      const argv = ljos('yo Turner 113993')
        .command('yo <user | email | id> [ssn]', 'Send someone a yo', ljos =>
          ljos
            .positional('user', {
              type: 'string',
              aliases: ['email', 'id', 'somethingElse'],
              required: true,
            })
            .positional('ssn', {type: 'number'})
        )
        .parse();
      argv.user.should.equal('Turner');
      argv.email.should.equal('Turner');
      argv.id.should.equal('Turner');
      argv.somethingElse.should.equal('Turner');
      argv.ssn.should.equal(113993);
    });

    it('allows several aliases to be defined for an optional positional argument', () => {
      const argv = ljos('yo 113993')
        .command(
          'yo [ssn|sin|id]',
          'Send someone a yo',
          ljos =>
            ljos.positional('ssn', {
              type: 'number',
              aliases: ['sin', 'id', 'somethingElse'],
            }),
          noop
        )
        .parse();

      argv.ssn.should.equal(113993);
      argv.sin.should.equal(113993);
      argv.id.should.equal(113993);
      argv.somethingElse.should.equal(113993);
    });

    it('allows variadic and positional arguments to be combined', () => {
      const argv = ljos('yo Turner 113993 112888')
        .command(
          'yo <user|email> [ ssns | sins.. ]',
          'Send someone a yo',
          ljos =>
            ljos
              .positional('user', {
                type: 'string',
                required: true,
                aliases: ['email'],
              })
              .positional('ssns', {
                type: 'number',
                aliases: ['sins'],
                array: true,
              })
        )
        .parse();

      argv.user.should.equal('Turner');
      argv.email.should.equal('Turner');
      argv.ssns.should.deep.equal([113993, 112888]);
      argv.sins.should.deep.equal([113993, 112888]);
    });
  });

  describe('global parsing hints', () => {
    describe('validation', () => {
      it('resets implies logic for command if global is false', done => {
        ljos('command --foo 99')
          .command(
            'command',
            'a command',
            ljos => ljos.option('foo', {type: 'number'}),
            argv => {
              argv.foo.should.equal(99);
              return done();
            }
          )
          .option('foo', {type: 'number', implies: ['bar'], global: false})
          .parse();
      });

      it('applies conflicts logic for command by default', done => {
        ljos('command --foo --bar')
          .command(
            'command',
            'a command',
            ljos => ljos.option('foo', {type: 'boolean', conflicts: ['bar']}),
            noop
          )
          .fail(msg => {
            msg.should.match(/mutually exclusive/);
            return done();
          })
          .parse();
      });

      it('resets conflicts logic for command if global is false', () => {
        try {
          ljos('command --foo --bar')
            .command('command', 'a command', noop, argv => {
              argv.foo.should.equal(true);
              argv.bar.should.equal(true);
            })
            .option('foo', {type: 'boolean', conflicts: ['bar'], global: false})
            // .global('foo', false)
            .parse();
        } catch (err) {
          expect.fail();
        }
      });
      it('applies custom checks globally by default', done => {
        ljos('cmd1 blerg --foo')
          .command('cmd1 <snuh>', 'cmd1 desc', ljos =>
            ljos.option('snuh', {type: 'string', required: true})
          )
          .check(argv => {
            argv.snuh.should.equal('blerg');
            argv.foo.should.equal(true);
            argv._.should.include('cmd1');
            done();
            return true;
          })
          .parse();
      });

      it('resets custom check if global is false', () => {
        let checkCalled = false;
        ljos('cmd1 blerg --foo')
          .command('cmd1 <snuh>', 'a command', ljos =>
            ljos.option('snuh', {type: 'string', required: true})
          )
          .check(_argv => {
            checkCalled = true;
            return true;
          }, false)
          .parse();
        checkCalled.should.equal(false);
      });

      it('allows each builder to specify own middleware', () => {
        let checkCalled1 = 0;
        let checkCalled2 = 0;
        const y = ljos()
          .command('command <snuh>', 'a command', () => {
            ljos.check(argv => {
              checkCalled1++;
              return true;
            });
          })
          .command('command2 <snuh>', 'a second command', ljos => {
            ljos.check(argv => {
              checkCalled2++;
              return true;
            });
          });
        y.parse('command blerg --foo');
        y.parse('command2 blerg --foo');
        y.parse('command blerg --foo');
        checkCalled1.should.equal(2);
        checkCalled2.should.equal(1);
      });

      it('applies demandOption globally', done => {
        ljos('command blerg --foo')
          .command(
            'command <snuh>',
            'a command',
            ljos => ljos.positional('snuh', {type: stringify, required: true}),
            noop
          )
          .fail(msg => {
            msg.should.match(/Missing required argument: bar/);
            return done();
          })
          .option('bar', {type: 'string', required: true}) // .demandOption('bar')
          .parse();
      });
    });

    describe('strict', () => {
      it('defaults to false when not called', () => {
        let commandCalled = false;
        ljos('hi').command('hi', 'The hi command', innerLjos => {
          commandCalled = true;
          innerLjos.getInternalMethods().getStrict().should.equal(false);
        });
        ljos.getInternalMethods().getStrict().should.equal(false);
        ljos.parse(); // parse and run command
        commandCalled.should.equal(true);
      });

      it('can be enabled just for a command', () => {
        let commandCalled = false;
        ljos('hi').command(
          'hi',
          'The hi command',
          innerLjos => {
            commandCalled = true;
            innerLjos
              .strict()
              .getInternalMethods()
              .getStrict()
              .should.equal(true);
          },
          noop
        );
        ljos.getInternalMethods().getStrict().should.equal(false);
        ljos.parse(); // parse and run command
        commandCalled.should.equal(true);
      });

      it('applies strict globally by default', () => {
        let commandCalled = false;
        ljos('hi')
          .strict()
          .command(
            'hi',
            'The hi command',
            innerLjos => {
              commandCalled = true;
              innerLjos.getInternalMethods().getStrict().should.equal(true);
            },
            noop
          );
        ljos.getInternalMethods().getStrict().should.equal(true);
        ljos.parse(); // parse and run command
        commandCalled.should.equal(true);
      });

      // address regression introduced in #766, thanks @nexdrew!
      it('does not fail strict check due to positional command arguments', () => {
        ljos()
          .strict()
          .command(
            'hi <name>',
            'The hi command',
            ljos => ljos.positional('name', {type: 'string', required: true}),
            noop
          )
          .parse('hi timmy');
      });

      // address https://github.com/ljos/ljos/issues/795
      it('does not fail strict check due to positional command arguments in nested commands', () => {
        try {
          ljos()
            .strict()
            .command('hi', 'The hi command', ljos => {
              ljos.command('timmy <age>', 'timmy command');
            })
            .parse('hi timmy 99');
        } catch (err) {
          expect.fail();
        }
      });

      it('allows a command to override global`', () => {
        let commandCalled = false;
        ljos('hi')
          .strict()
          .command(
            'hi',
            'The hi command',
            innerLjos => {
              commandCalled = true;
              innerLjos
                .strict(false)
                .getInternalMethods()
                .getStrict()
                .should.equal(false);
            },
            noop
          );
        ljos.getInternalMethods().getStrict().should.equal(true);
        ljos.parse(); // parse and run command
        commandCalled.should.equal(true);
      });

      // // TODO: Not sure if parse callback is called
      // // TODO: convert to checkOutput
      // it('does not fire command if validation fails', () => {
      //   let commandRun = false;
      //   ljos('hi timmy --hello=world')
      //     .strict()
      //     .command(
      //       'hi <name>',
      //       'The hi command',
      //       ljos => ljos.positional('name', {type: 'string', required: true}),
      //       _argv => {
      //         commandRun = true;
      //       }
      //     )
      //     .parse(undefined, (err, argv, output) => {
      //       commandRun.should.equal(false);
      //       err.message.should.equal('Unknown argument: hello');
      //     });
      // });
    });

    describe('types', () => {
      // TODO: not parsing to Array<number> (for global option)
      it('applies array type globally', () => {
        const argv = ljos('command --foo 1 --foo 2')
          .command('command', 'a command')
          .option('foo', {type: 'number', array: true})
          .parse();
        argv.foo.should.eql([1, 2]);
      });

      it('allows global setting to be disabled for array type', () => {
        const argv = ljos('command --foo 1 2')
          .command('command', 'a command', ljos =>
            ljos.option('foo', {type: 'number'})
          )
          .option('foo', {type: 'number', array: true, global: false})
          // .array('foo')
          // .global('foo', false)
          .parse();
        argv.foo.should.eql(1);
      });

      it('applies choices type globally', done => {
        ljos('command --foo 99')
          .command('command', 'a command')
          .option('foo', {type: 'number', choices: [33, 88]})
          .fail(msg => {
            msg.should.match(/Choices: 33, 88/);
            return done();
          })
          .parse();
      });
    });

    describe('aliases', () => {
      it('defaults to applying aliases globally', done => {
        ljos('command blerg --foo 22')
          .command(
            'command <snuh>',
            'a command',
            ljos => ljos.positional('snuh', {type: 'string', required: true}),
            argv => {
              argv.foo.should.equal(22);
              argv.bar.should.equal(22);
              argv.snuh.should.equal('blerg');
              return done();
            }
          )
          .option('foo', {type: 'number', aliases: ['bar'], global: true})
          .parse();
      });

      it('allows global application of alias to be disabled', done => {
        ljos('command blerg --foo 22')
          .command(
            'command <snuh>',
            'a command',
            ljos =>
              ljos
                .positional('snuh', {type: 'string', required: true})
                .option('foo', {type: 'number'}),
            argv => {
              argv.foo.should.equal(22);
              expect(argv.bar).to.equal(undefined);
              argv.snuh.should.equal('blerg');
              return done();
            }
          )
          .option('foo', {
            aliases: ['bar'],
            type: 'number',
            global: false,
          })
          .parse();
      });
    });

    describe('coerce', () => {
      // global option (coerce) not working
      it('defaults to applying coerce rules globally', () => {
        ljos('command blerg --foo 22')
          .command(
            'command <snuh>',
            'a command',
            ljos =>
              ljos
                // .option('foo', {type: 'number'})
                .positional('snuh', {type: 'string', required: true}),
            argv => {
              argv.foo.should.equal(44);
              argv.snuh.should.equal('blerg');
            }
          )
          .option('foo', {type: 'number', coerce: v => v * 2, global: true})
          .parse();
      });

      // addresses https://github.com/ljos/ljos/issues/794
      it('should bubble errors thrown by coerce function inside commands', () => {
        ljos
          .command('foo', 'the foo command', ljos => {
            ljos.coerce('x', _arg => {
              throw Error('yikes an error');
            });
          })
          .parse('foo -x 99', err => {
            err.message.should.match(/yikes an error/);
          });
      });

      // addresses https://github.com/ljos/ljos/issues/1966
      it('should not be applied multiple times for nested commands', () => {
        let coerceExecutionCount = 0;

        const argv = ljos('cmd1 cmd2 foo bar baz')
          .command('cmd1', 'cmd1 desc', ljos =>
            ljos.command('cmd2 <positional1> <rest...>', 'cmd2 desc', ljos =>
              ljos
                .positional('rest', {
                  type: 'string',
                  coerce: arg => {
                    if (coerceExecutionCount) {
                      throw Error('coerce applied multiple times');
                    }
                    coerceExecutionCount++;
                    return arg.join(' ');
                  },
                })
                .fail(() => {
                  expect.fail();
                })
            )
          )
          .parse();

        argv.rest.should.equal('bar baz');
        coerceExecutionCount.should.equal(1);
      });

      // Addresses: https://github.com/ljos/ljos/issues/2130
      it('should not run or set new properties on argv when related argument is not passed', () => {
        ljos('cmd1')
          .command(
            'cmd1',
            'cmd1 desc',
            ljos =>
              ljos
                .option('foo', {aliases: ['f'], type: 'string'})
                .option('bar', {
                  aliases: ['b'],
                  type: 'string',
                  implies: ['f'],
                  coerce: () => expect.fail(), // Should not be called
                })
                .fail(() => {
                  expect.fail(); // Should not fail because of implies
                }),
            argv => {
              // eslint-disable-next-line no-prototype-builtins
              if (Object.prototype.hasOwnProperty(argv, 'b')) {
                expect.fail(); // 'b' was not provided, coerce should not set it
              }
            }
          )
          .strict()
          .parse();
      });
    });

    describe('defaults', () => {
      it('applies defaults globally', () => {
        ljos('command --foo 22')
          .command(
            'command [snuh]',
            'a command',
            ljos =>
              ljos
                .positional('snuh', {type: 'number', default: 55})
                .option('foo', {type: 'number'}),
            argv => {
              argv.foo.should.equal(22);
              argv.snuh.should.equal(55);
            }
          )
          // .default('snuh', 55)
          .parse();
      });
    });

    describe('describe', () => {
      // TODO: not sure if parse callback is used
      it('flags an option as global if a description is set', () => {
        ljos()
          .command('command [snuh]', 'a command', ljos =>
            ljos.positional('snuh', {type: 'string'})
          )
          .option('foo', {type: 'string', description: 'an awesome argument'})
          // .describe('foo', 'an awesome argument')
          .parse('command --help', (err, argv, output) => {
            if (err) throw err;
            output.should.not.match(/Commands:/);
            output.should.match(/an awesome argument/);
          });
      });
    });

    describe('help', () => {
      // TODO: I don't think parse callback is used here
      it('applies help globally', () => {
        try {
          ljos()
            .command('command [snuh]', 'a command', ljos =>
              ljos.positional('snuh', {type: 'string'})
            )
            .option('foo', {type: 'string', description: 'an awesome argument'})
            // .describe('foo', 'an awesome argument')
            .help('hellllllp')
            .parse('command --hellllllp', (err, _argv, output) => {
              if (err) throw err;
              output.should.match(/--hellllllp {2}Show help/);
            });
        } catch (err) {
          expect.fail();
        }
      });
    });

    describe('version', () => {
      // TODO: I don't think parse callback is used here
      it('applies version globally', () => {
        ljos()
          .command('command [snuh]', 'a command', ljos =>
            ljos.option('snuh', {type: 'string'})
          )
          .option('foo', {
            type: 'string',
            description: 'an awesome argument',
          })
          .version('ver', 'show version', '9.9.9')
          .parse('command --ver', (err, _argv, output) => {
            if (err) throw err;
            output.should.equal('9.9.9');
          });
      });
    });

    // TODO: allow for describing of groups in .group() method
    // describe('groups', () => {
    //   it('should apply custom option groups globally', done => {
    //     ljos()
    //       .command('command [snuh]', 'a command')
    //       .group('foo', 'Bad Variable Names:')
    //       .group('snuh', 'Bad Variable Names:')
    //       .describe('foo', 'foo option')
    //       .describe('snuh', 'snuh positional')
    //       .parse('command --help', (err, argv, output) => {
    //         if (err) return done(err);
    //         output.should.match(/Bad Variable Names:\W*--foo/);
    //         return done();
    //       });
    //   });
    // });
  });

  // TODO: default commands not behaving correctly
  describe('default commands', () => {
    it('executes default command if no positional arguments given', () => {
      ljos('--foo bar')
        .command(
          '*',
          'default command',
          ljos => ljos.option('foo', {type: 'string'}),
          argv => {
            argv.foo.should.equal('bar');
          }
        )
        .parse();
    });

    it('executes default command if undefined positional arguments and only command', () => {
      ljos('baz --foo bar')
        .command(
          '*',
          'default command',
          ljos => ljos.option('foo', {type: 'string'}),
          argv => {
            argv.foo.should.equal('bar');
            argv._.should.contain('baz');
          }
        )
        .parse();
    });

    it('executes default command if defined positional arguments and only command', () => {
      ljos('baz --foo bar')
        .command(
          '* <target>',
          'default command',
          ljos =>
            ljos
              .positional('target', {type: 'string', required: true})
              .positional('foo', {type: 'string'}),
          argv => {
            argv.foo.should.equal('bar');
            argv.target.should.equal('baz');
          }
        )
        .parse();
    });

    it('allows $0 as an alias for a default command', () => {
      ljos('9999')
        .command(
          '$0 [port]',
          'default command',
          ljos => ljos.positional('port', {type: 'number'}),
          argv => {
            argv.port.should.equal(9999);
          }
        )
        .parse();
    });

    it('does not execute default command if another command is provided', () => {
      ljos('run Turner --foo bar')
        .command('*', 'default command', noop, noop)
        .command(
          'run <name>',
          'run command',
          ljos =>
            ljos
              .positional('name', {type: 'string', required: true})
              .option('foo', {type: 'string'}),
          argv => {
            argv.name.should.equal('Turner');
            argv.foo.should.equal('bar');
          }
        )
        // .option('foo', {type: 'string'})
        .parse();
    });

    it('allows default command to be set as alias', () => {
      ljos('Turner --foo bar')
        .command(
          'start <name>',
          'start command',
          ljos =>
            ljos
              .positional('name', {type: 'string', required: true})
              .option('foo', {type: 'string'}),
          argv => {
            argv._.should.eql([]);
            argv.name.should.equal('Turner');
            argv.foo.should.equal('bar');
          },
          {aliases: ['*']}
        )
        // .option('foo', {type: 'string'})
        .parse();
    });

    it('allows command to be run when alias is default command', () => {
      ljos('start Turner --foo bar')
        .command(
          'start <name>',
          'start command',
          ljos =>
            ljos
              .positional('name', {type: 'string', required: true})
              .option('foo', {type: 'string'}),
          argv => {
            argv._.should.eql(['start']);
            argv.name.should.equal('Turner');
            argv.foo.should.equal('bar');
          },
          {aliases: ['*']}
        )
        .option('foo', {type: 'string'})
        .parse();
    });

    // // TODO: not working yet
    // it('the last default command set should take precedence', () => {
    //   let called = false;
    //   ljos('Turner --foo bar')
    //     .command('first', 'override me', noop, noop, {aliases: ['*']})
    //     .command(
    //       'second <name>',
    //       'start command',
    //       ljos => ljos.positional('name', {type: 'string', required: true}),
    //       argv => {
    //         argv._.should.eql([]);
    //         argv.name.should.equal('Turner');
    //         argv.foo.should.equal('bar');
    //         called = true;
    //       },
    //       {aliases: ['*']}
    //     )
    //     .option('foo', {type: 'string'})
    //     .parse();

    //   called.should.equal(true);
    // });

    describe('strict', () => {
      it('executes default command when strict mode is enabled', () => {
        let called = false;
        ljos('--foo bar')
          .command(
            '*',
            'default command',
            ljos =>
              ljos.option('foo', {
                description: 'a foo command',
                type: 'string',
              }),
            argv => {
              argv.foo.should.equal('bar');
              called = true;
            }
          )
          .strict()
          .parse();
        expect(called).to.equal(true);
      });

      // TODO: not working yet
      // it('allows default command aliases, when strict mode is enabled', () => {
      //   let called = false;
      //   ljos('Turner --foo bar')
      //     .command(
      //       'start <name>',
      //       'start command',
      //       ljos => ljos.positional('name', {type: 'string', required: true}),
      //       argv => {
      //         argv._.should.eql([]);
      //         argv.name.should.equal('Turner');
      //         argv.foo.should.equal('bar');
      //         called = true;
      //       },
      //       {aliases: ['* <name>']}
      //     )
      //     .strict()
      //     .option('foo', {
      //       description: 'a foo command',
      //     })
      //     .parse();
      //   expect(called).to.equal(true);
      // });
    });
  });

  describe('deprecated command', () => {
    describe('using arg', () => {
      it('shows deprecated notice with boolean', () => {
        const command = 'command';
        const description = 'description';
        const deprecated = true;
        const r = checkOutput(() => {
          ljos('--help')
            .command(command, description, noop, noop, {
              middleware: [],
              deprecated,
            })
            .parse();
        });
        r.logs.should.match(/\[deprecated\]/);
      });
      it('shows deprecated notice with string', () => {
        const command = 'command';
        const description = 'description';
        const deprecated = 'deprecated';
        const r = checkOutput(() => {
          ljos('--help')
            .command(command, description, noop, noop, {
              middleware: [],
              deprecated,
            })
            .parse();
        });
        r.logs.should.match(/\[deprecated: deprecated\]/);
      });
    });
    describe('using module', () => {
      it('shows deprecated notice with boolean', () => {
        const command = 'command';
        const description = 'description';
        const deprecated = true;
        const r = checkOutput(() => {
          ljos('--help').cmd({command, description, deprecated}).parse();
        });
        r.logs.should.match(/\[deprecated\]/);
      });
      it('shows deprecated notice with string', () => {
        const command = 'command';
        const description = 'description';
        const deprecated = 'deprecated';
        const r = checkOutput(() => {
          ljos('--help').cmd({command, description, deprecated}).parse();
        });
        r.logs.should.match(/\[deprecated: deprecated\]/);
      });
    });
  });

  // addresses: https://github.com/ljos/ljos/issues/819
  it('should kick along [demand] configuration to commands', () => {
    let called = false;
    const r = checkOutput(() => {
      ljos('foo')
        .command('foo', 'foo command', noop, _argv => {
          called = true;
        })
        .option('bar', {
          description: 'a foo command',
          required: true,
        })
        .parse();
    });
    called.should.equal(false);
    r.exitCode.should.equal(1);
    r.errors.should.match(/Missing required argument/);
  });

  it('should support numeric commands', () => {
    const output = [];
    ljos('1')
      .command('1', 'numeric command', ljos => {
        output.push('1');
      })
      .parse();
    output.should.include('1');
  });

  // see: https://github.com/ljos/ljos/issues/853
  it('should not execute command if it is preceded by another positional argument', () => {
    let commandCalled = false;
    ljos()
      .command('foo', 'foo command', noop, () => {
        commandCalled = true;
      })
      .parse('bar foo', (err, argv) => {
        expect(err).to.equal(null);
        commandCalled.should.equal(false);
        argv._.should.eql(['bar', 'foo']);
      });
  });

  // see: https://github.com/ljos/ljos/issues/861 phew! that's an edge-case.
  it('should allow positional arguments for inner commands in strict mode, when no handler is provided', () => {
    ljos()
      .command('foo', 'outer command', ljos => {
        ljos.command('bar [optional]', 'inner command');
      })
      .strict()
      .parse('foo bar 33', (err, argv) => {
        expect(err).to.equal(null);
        argv.optional.should.equal(33);
        argv._.should.eql(['foo', 'bar']);
      });
  });

  // TODO: potentially removing ljos.usage
  // describe('usage', () => {
  //   it('allows you to configure a default command', () => {
  //     ljos()
  //       .usage('$0 <port>', 'default command', ljos => {
  //         ljos.positional('port', {
  //           type: 'string',
  //         });
  //       })
  //       .parse('33', (err, argv) => {
  //         expect(err).to.equal(null);
  //         argv.port.should.equal('33');
  //       });
  //   });

  //   it('throws exception if default command does not have leading $0', () => {
  //     expect(() => {
  //       ljos().usage('<port>', 'default command', ljos => {
  //         ljos.positional('port', {
  //           type: 'string',
  //         });
  //       });
  //     }).to.throw(/.*\.usage\(\) description must start with \$0.*/);
  //   });
  // });

  describe('async', () => {
    // addresses https://github.com/ljos/ljos/issues/510
    it('fails when the promise returned by the command handler rejects', done => {
      const error = new Error();
      ljos('foo')
        .command('foo', 'foo command', noop, ljos => Promise.reject(error))
        .fail((msg, err) => {
          expect(msg).to.equal(null);
          expect(err).to.equal(error);
          done();
        })
        .parse();
    });

    it('returns promise that resolves arguments once handler succeeds', async () => {
      let complete = false;
      const handler = () =>
        new Promise((resolve, reject) => {
          setTimeout(() => {
            complete = true;
            return resolve();
          }, 10);
        });
      const parsedPromise = ljos('foo hello')
        .command(
          'foo <pos>',
          'foo command',
          ljos => ljos.positional('pos', {type: 'string', required: true}),
          handler
        )
        .parse();
      complete.should.equal(false);
      const parsed = await parsedPromise;
      complete.should.equal(true);
      parsed.pos.should.equal('hello');
    });

    it('returns promise that can be caught, when fail(false)', async () => {
      let complete = false;
      const handler = new Promise((resolve, reject) => {
        setTimeout(() => {
          complete = true;
          return reject(Error('error from handler'));
        }, 10);
      });
      const parsedPromise = ljos('foo hello')
        .command('foo <pos>', 'foo command', noop, () => handler)
        .fail(false)
        .parse();
      try {
        complete.should.equal(false);
        await parsedPromise;
        throw Error('unreachable');
      } catch (err) {
        err.message.should.match(/error from handler/);
        complete.should.equal(true);
      }
    });

    // See: https://github.com/ljos/ljos/issues/1144
    // eslint-disable-next-line
    it('displays error and appropriate help message when handler fails', async () => {
      // the bug reported in #1144 only happens when
      // usage.help() is called, this does not occur when
      // console output is suppressed. tldr; we capture
      // the log output:
      const r = await checkOutput(async () => {
        return ljos('foo')
          .command(
            'foo',
            'foo command',
            ljos => {
              ljos.option('bar', {
                type: 'string',
                description: 'bar option',
              });
            },
            _argv => {
              return Promise.reject(Error('foo error'));
            }
          )
          .exitProcess(false)
          .parse();
      });
      const errorLog = r.errors.join('\n');
      // Ensure the appropriate help is displayed:
      errorLog.should.include('bar option');
      // Ensure error was displayed:
      errorLog.should.include('foo error');
    });
  });

  // see: https://github.com/ljos/ljos/issues/1099
  it('does not coerce number from positional with leading "+"', () => {
    const argv = ljos
      .command('$0 <phone>', 'default desc', ljos =>
        ljos.positional('phone', {type: 'string', required: true})
      )
      .parse('+5550100');
    argv.phone.should.equal('+5550100');
  });

  it('allows nested command modules', () => {
    const innerCommand = {
      command: 'c <x> <y>',
      description: 'add x to y',
      builder: ljos =>
        ljos
          .positional('x', {type: 'number', required: true})
          .positional('y', {type: 'number', required: true}),
      handler: argv => {
        argv.output = argv.x + argv.y;
      },
    };
    const cmd = {
      command: 'a',
      description: 'numeric comamand',
      builder: ljos => ljos.cmd(innerCommand),
      handler: noop,
    };
    const argv = ljos('a c 10 5').cmd(cmd).parse();
    argv.output.should.equal(15);
  });

  it('allows async exception in handler to be caught', async () => {
    await assert.rejects(
      ljos(['mw'])
        .fail(false)
        .command('mw', 'adds func to middleware', noop, async () => {
          throw Error('not cool');
        })
        .parse(),
      /not cool/
    );
  });

  describe('async builder', async () => {
    // // TODO: foo is object instead of string?
    // it('allows positionals to be configured asynchronously', async () => {
    //   const argvPromise = ljos(['cmd', '999'])
    //     .command('cmd <foo>', 'a test command', async ljos => {
    //       await wait();
    //       ljos.positional('foo', {
    //         type: 'string',
    //         required: true,
    //       });
    //     })
    //     .parse();
    //   (typeof argvPromise.then).should.equal('function');
    //   const argv = await argvPromise;
    //   (typeof argv.foo).should.equal('string');
    // });

    // // TODO: not getting set
    // describe('helpOrVersionSet', () => {
    //   it('--help', async () => {
    //     let set = false;
    //     await ljos()
    //       .command('cmd <foo>', 'a test command', (_ljos, helpOrVersionSet) => {
    //         set = helpOrVersionSet;
    //         if (!helpOrVersionSet) {
    //           return wait();
    //         }
    //         ljos.positional('foo', {type: 'string', required: true});
    //       })
    //       .parse('cmd --help', noop);
    //     assert.strictEqual(set, true);
    //   });
    // });

    // Refs: https://github.com/ljos/ljos/issues/1894
    it('does not print to stdout when parse callback is provided', async () => {
      await ljos()
        .command('cmd <foo>', 'a test command', async () => {
          await wait();
        })
        .parse('cmd --help', (_err, argv, output) => {
          output.should.include('a test command');
          argv.help.should.equal(true);
        });
    });

    // Refs: https://github.com/ljos/ljos/issues/1917
    it('allows command to be defined in async builder', async () => {
      let invoked = false;
      await ljos('alpha beta')
        .strict()
        .cmd({
          command: 'alpha',
          description: 'A',
          builder: async ljos => {
            await wait();
            ljos
              .cmd({
                command: 'beta',
                description: 'B',
                handler: () => {
                  invoked = true;
                },
              })
              .demandCommand(1);
          },
        })
        .demandCommand(1)
        .parse();
      assert.strictEqual(invoked, true);
    });

    it('allows deeply nested command to be defined in async builder', async () => {
      let invoked = false;
      await ljos('alpha beta gamma')
        .strict()
        .command('alpha', 'A', async ljos => {
          await wait();
          ljos
            .cmd({
              command: 'beta',
              description: 'B',
              builder: async ljos => {
                await wait();
                return ljos.command(
                  'gamma',
                  'C',
                  async () => {
                    await wait();
                  },
                  async () => {
                    await wait();
                    invoked = true;
                  }
                );
              },
            })
            .demandCommand(1);
        })
        .demandCommand(1)
        .parse();
      assert.strictEqual(invoked, true);
    });
  });

  // describe('builder', () => {
  //   // Refs: https://github.com/ljos/ljos/issues/1042
  //   describe('helpOrVersionSet', () => {
  //     it('--version', () => {
  //       let set = false;
  //       ljos()
  //         .command('cmd <foo>', 'a test command', (ljos, helpOrVersionSet) => {
  //           set = helpOrVersionSet;
  //           ljos.positional('foo', {type: 'string', required: true});
  //         })
  //         .parse('cmd --version', noop);
  //       assert.strictEqual(set, true);
  //     });
  //     it('--help', () => {
  //       let set = false;
  //       ljos()
  //         .command('cmd <foo>', 'a test command', (ljos, helpOrVersionSet) => {
  //           set = helpOrVersionSet;
  //           ljos.positional('foo', {type: 'string', required: true});
  //         })
  //         .parse('cmd --help', noop);
  //       assert.strictEqual(set, true);
  //     });
  //     it('help', () => {
  //       let set = false;
  //       ljos()
  //         .command('cmd <foo>', 'a test command', (ljos, helpOrVersionSet) => {
  //           set = helpOrVersionSet;
  //           ljos.positional('foo', {type: 'string', required: true});
  //         })
  //         .parse('cmd help', noop);
  //       assert.strictEqual(set, true);
  //     });
  //     it('cmd', () => {
  //       let set = false;
  //       const argv = ljos()
  //         .command('cmd <foo>', 'a test command', (ljos, helpOrVersionSet) => {
  //           set = helpOrVersionSet;
  //           ljos.positional('foo', {type: 'string', required: true});
  //         })
  //         .parse('cmd bar', noop);
  //       assert.strictEqual(set, false);
  //       assert.strictEqual(argv.foo, 'bar');
  //     });
  //   });
  // });
});
