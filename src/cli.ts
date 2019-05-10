import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import minimist from 'minimist';

import { CheckSideEffectsOptions, checkSideEffects } from './checker';


export interface MainOptions {
  args: string[];
}

export interface CheckerCLIOptions {
  cwd?: string;
  output?: string;
  pureGetters: boolean,
  resolveExternals: boolean,
  printDependencies: boolean,
  useBuildOptimizer: boolean,
  useMinifier: boolean,
  warnings: boolean,
}

export interface TestCLIOptions {
  test?: string,
  update: boolean,
}

export interface Test {
  esModules: string | string[],
  options?: CheckerCLIOptions;
  expectedOutput: string,
}

export interface TestJson {
  tests: Test[],
}

export type ParsedCliOptions = CheckerCLIOptions & TestCLIOptions & {
  help: boolean;
  cwd: string;
  // _ is the ES module list.
  _: string[];
};

export async function main(rawOpts: MainOptions) {
  // Parse the command line.
  const options = minimist(rawOpts.args, {
    boolean: [
      'help',
      'pureGetters',
      'resolveExternals',
      'printDependencies',
      'useBuildOptimizer',
      'useMinifier',
      'warnings',
      'update',
    ],
    string: ['cwd', 'output', 'test'],
    alias: {
      'pureGetters': 'pure-getters',
      'resolveExternals': 'resolve-externals',
      'printDependencies': 'print-dependencies',
      'useBuildOptimizer': 'use-build-optimizer',
      'useMinifier': 'use-minifier',
    },
    default: {
      'pureGetters': false,
      'resolveExternals': false,
      'printDependencies': false,
      'useBuildOptimizer': true,
      'useMinifier': true,
      'help': false,
      'warnings': false,
      'update': false,
      'cwd': process.cwd(),
    },
    '--': true
  }) as unknown as ParsedCliOptions;

  if (options.help) {
    showHelp();
    return;
  }

  if (options.test) {
    // If there's a test file, use it instead of reading flags for options.
    const testFilePath = resolve(options.cwd, options.test);
    if (!existsSync(testFilePath)) {
      throw `Could not find the test file: ${testFilePath}.`;
    }

    console.log(`Loading tests from ${testFilePath}\n`);
    const testJson = JSON.parse(readFileSync(testFilePath, 'utf-8')) as TestJson;
    const testFileDir = dirname(testFilePath);
    const failedExpectations: string[] = [];

    for (const test of testJson.tests) {
      const unresolvedEsModules = Array.isArray(test.esModules) ? test.esModules : [test.esModules];
      const esModules = unresolvedEsModules.map(esm => resolve(testFileDir, esm));
      const esModulesDescription = unresolvedEsModules.join(' ');

      // These tests can take a while. Inform the user of progress.
      console.log(`Testing ${esModulesDescription}`);

      // Assemble the options.
      const checkSideEffectsOptions: CheckSideEffectsOptions = {
        esModules,
        cwd: options.cwd,
        ...test.options
      };

      // Run it.
      const result = await checkSideEffects(checkSideEffectsOptions);

      // Load the expected output. 
      const expectedOutputPath = resolve(options.cwd, test.expectedOutput);
      let expectedOutput;
      if (existsSync(expectedOutputPath)) {
        expectedOutput = readFileSync(expectedOutputPath, 'utf-8');
      } else {
        // Don't error out if the file isn't out, because they can be updated afterwards.
        expectedOutput = '';
      }

      // Check against the expectation.
      if (result != expectedOutput) {
        failedExpectations.push(esModulesDescription);
        if (options.update) {
          _recursiveMkDir(dirname(expectedOutputPath));
          writeFileSync(expectedOutputPath, result, 'utf-8');
        }
      }
    }

    // Print a newline before the results.
    console.log('');

    if (failedExpectations.length > 0) {
      const failedExpectationsDescription = failedExpectations.map(s => `  ${s}`).join('\n');

      if (options.update) {
        console.log(`Test expectations updated for modules:\n${failedExpectationsDescription}\n`)
      } else {
        throw `Tests failed for modules:\n${failedExpectationsDescription}\n` +
        `\nTo update the expectations, run this command again with the --update flag.\n`;
      }
    } else {
      console.log(`All tests passed.`)
    }
  } else {
    // Get the list of modules to check.
    // When invoked as `node path/to/cli.js something` we need to strip the two starting arguments.
    // When invoked as `binary something` we only need to strip the first starting argument.
    const esModules = isNodeBinary(options._[0]) ? options._.slice(2) : options._.slice(1);

    if (esModules.length == 0) {
      throw `You must provide at least one ES module. Use --help for usage information.`
    }

    // Assemble the options.
    const checkSideEffectsOptions: CheckSideEffectsOptions = {
      esModules,
      cwd: options.cwd,
      output: options.output,
      pureGetters: options.pureGetters,
      resolveExternals: options.resolveExternals,
      printDependencies: options.printDependencies,
      useBuildOptimizer: options.useBuildOptimizer,
      useMinifier: options.useMinifier,
      warnings: options.warnings,
    };

    // Run it.
    return checkSideEffects(checkSideEffectsOptions);
  }
}

// Check if a given string looks like the node binary.
function isNodeBinary(str: string): boolean {
  return str.endsWith('node') || str.endsWith('node.exe');
}

function showHelp() {
  const helpText = `
check-side-effects [ES modules to check] [--option-name]

Checks side effects from importing given ES modules.

Options:
    --help                    Show this message.
    --cwd                     Override working directory to run the process in.
    --output                  Output the bundle to this path. Useful to trace the sourcemaps.
    --pure-getters            Assume there are no side effects from getters. [Default: false]
    --resolve-externals       Resolve external dependencies. [Default: false]
    --print-dependencies      Print all the module dependencies. [Default: false]
    --use-build-optimizer     Run Build Optimizer over all modules. [Default: true]
    --use-minifier	          Run minifier over the final bundle to remove comments. [Default: true]
    --warnings                Show all warnings. [Default: false]
    --test                    Read a series of tests from a JSON file.
    --update                  Update the test results. [Default: false]

Example:
    check-side-effects ./path/to/library/module.js
`;
  console.log(helpText);
}

function _recursiveMkDir(path: string) {
  if (!existsSync(path)) {
    _recursiveMkDir(dirname(path));
    mkdirSync(path);
  }
}
