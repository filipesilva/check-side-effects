#!/usr/bin/env node
import minimist from 'minimist';

import { CheckSideEffectsOptions, checkSideEffects } from './checker';


export interface MainOptions {
  args: string[];
}

export async function main(opts: MainOptions) {
  // Parse the command line.
  const parsedArgs = minimist(opts.args, {
    boolean: [
      'help', 
      'pureGetters', 
      'resolveExternals', 
      'printDependencies', 
      'use-build-optimizer',
      'useMinifier',
      'warnings',
    ],
    string: ['cwd', 'output'],
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

  // Get the list of modules to check.
  // When invoked as `node path/to/cli.js something` we need to strip the two starting arguments.
  // When invoked as `binary something` we only need to strip the first starting argument.
  const modules = isNodeBinary(parsedArgs._[0]) ? parsedArgs._.slice(2) : parsedArgs._.slice(1);

  // Assemble the options.
  const checkSideEffectsOptions: CheckSideEffectsOptions = {
    esModules: modules,
    cwd: parsedArgs.cwd,
    outputFilePath: parsedArgs.output,
    pureGetters: parsedArgs.pureGetters,
    resolveExternals: parsedArgs.assumeExternals,
    printDependencies: parsedArgs.printDependencies,
  };

  // Run it.
  return checkSideEffects(checkSideEffectsOptions);
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
    --use-minifier	          Run minifier over the final bundle. [Default: true]
    --warnings                Show all warnings. [Default: false]

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
