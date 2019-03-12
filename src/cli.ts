#!/usr/bin/env node
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import minimist from 'minimist';

import { CheckSideEffectsOptions, checkSideEffects } from './checker';


export interface MainOptions {
  args: string[];
}

export interface Options {
  cwd?: string;
  output?: string;
  pureGetters: boolean,
  resolveExternals: boolean,
  printDependencies: boolean,
  useBuildOptimizer: boolean,
  useMinifier: boolean,
  warnings: boolean,
}

export interface Test {
  esModules: string[],
  options?: Options;
  expected: string,
}

export interface TestJson {
  tests: Test[],
}

export async function main(opts: MainOptions) {
  // Parse the command line.
  const parsedArgs = minimist(opts.args, {
    boolean: [
      'help',
      'pureGetters',
      'resolveExternals',
      'printDependencies',
      'useBuildOptimizer',
      'useMinifier',
      'warnings',
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
      'pureGetters': true,
      'resolveExternals': false,
      'printDependencies': false,
      'useBuildOptimizer': true,
      'useMinifier': true,
      'help': false,
      'warnings': false,
      'cwd': process.cwd(),
    },
    '--': true
  });

  if (parsedArgs.help) {
    showHelp();
    return;
  }

  if (parsedArgs.test) {
    // If there's a test file, use it instead of reading flags for options.
    const testFile = resolve(parsedArgs.cwd, parsedArgs.test);
    if (!existsSync(testFile)) {
      throw `Could not find the test file: ${testFile}.`;
    }
    const testJson = JSON.parse(readFileSync(testFile, 'utf-8')) as TestJson;
    const failedExpectations: string[] = [];

    for (const test of testJson.tests) {
      // Assemble the options.
      const checkSideEffectsOptions: CheckSideEffectsOptions = {
        esModules: test.esModules,
        cwd: parsedArgs.cwd,
        ...test.options
      };

      // Run it.
      const result = await checkSideEffects(checkSideEffectsOptions);
      if (result != test.expected) {
        failedExpectations.push(test.esModules.join(' '));
      }
    }

    if (failedExpectations.length > 0) {
      throw `Tests failed for modules:\n` +
      `${failedExpectations.join('\n')}` +
      `\n\nRun 'check-side-effects path-to-modules' individually to check results.\n`;
    } else {
      console.log(`All tests passed.`)
    }
  } else {
    // Get the list of modules to check.
    // When invoked as `node path/to/cli.js something` we need to strip the two starting arguments.
    // When invoked as `binary something` we only need to strip the first starting argument.
    const modules = isNodeBinary(parsedArgs._[0]) ? parsedArgs._.slice(2) : parsedArgs._.slice(1);

    // Assemble the options.
    const checkSideEffectsOptions: CheckSideEffectsOptions = {
      esModules: modules,
      cwd: parsedArgs.cwd,
      output: parsedArgs.output,
      pureGetters: parsedArgs.pureGetters,
      resolveExternals: parsedArgs.resolveExternals,
      printDependencies: parsedArgs.printDependencies,
      useBuildOptimizer: parsedArgs.useBuildOptimizer,
      useMinifier: parsedArgs.useMinifier,
      warnings: parsedArgs.warnings,
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
    --pure-getters            Assume there are no side effects from getters. [Default: true]
    --resolve-externals       Resolve external dependencies. [Default: false]
    --print-dependencies      Print all the module dependencies. [Default: false]
    --use-build-optimizer     Run Build Optimizer over all modules. [Default: true]
    --use-minifier	          Run minifier over the final bundle to remove comments. [Default: true]
    --warnings                Show all warnings. [Default: false]
    --test                    Read a series of tests from a JSON file. [Default: false]

Example:
    check-side-effects ./path/to/library/module.js
`;
  console.log(helpText);
}

// Run only if this is entry point for node.
// This way the file can be imported without running anything.
if (require.main === module) {
  main({ args: process.argv })
    .then(output => !!output ? console.log(output) : null)
    .catch(e => {
      console.error(e.msg ? e.msg : e);
      process.exitCode = 1;
    });
}
