const {Parser, processArgv} = require('../build/index.cjs');

module.exports = {
  hideBin: processArgv.hideBin,
  Parser,
};
