# Check side effects

You can use this package to see if importing a given ES module has side effects, and where they come from.

## Rationale

Minimizers (UglifyJS, Terser, etc) used together with bundlers (Webpack, Rollup, etc) are able to drastically reduce the size of code bundles by removing unused code. This is desirable because less code means faster startup time on both Node and Browser platforms.

But sometimes these tools cannot know if a certain piece of code is actually unused, and safe to be removed. The most common case is imported code with side effects.

Side effects in the context of importing ES modules means code that runs, and has some sort of side effect, when importing a module.

An obvious example of a side effect is top level function calls, like logging. If you have `console.log('something')` on the top level of a module, that code will be retained.

Similarly, if you call `myFunction()` on the top level and static analysis cannot determine that call to have no effect, the code will be retained.

A more subtle side effect is property access, like `const obj = {}; obj.prop;`. `obj` isn't really used, and it's not even exported. But because something might be happening on the property getter, it's retained in the final bundle.

It's incommon to have size effects on getters and for that reason some tools offer a configuration option to assume property getters have no side effects.

These examples are trivial but on complex pieces of software you will likely find non-trivial variations of the same theme.

And since code is highly interconnected, it's easy to have a lot of code retained by only a few unexpected side effects.

In an ideal scenario, importing a library but not using it means no code is retained from that library. But more often than not, importing a library has side effects that can't be removed at all.

This tool was created to help identify what code is leftover from importing an unused library by trying to eliminate as much code from it as possible.

It implements that idea by following these steps:

- create a temporary file that imports the modules you want to test
- setup [Build Optimizer](https://github.com/angular/angular-cli/tree/master/packages/angular_devkit/build_optimizer) to

  - mark all toplevel function calls as free from side effects
  - convert known [TypeScript](https://www.typescriptlang.org/) generated code with side effects to the equivalent without side effects

- setup [Terser](https://github.com/terser-js/terser) to remove remove comments

- run [Rollup](https://rollupjs.org) over that file with tree shaking turned on

## CLI Usage

First install this either globally or locally from `npm`.

```
npm install --global check-side-effects
```

Running this tool with a path will print out to the console the remaining code with side effects. You can list multiple paths one after the other too.

```
check-side-effects ./path/to/library/module.js
check-side-effects ./path/to/library/module.js ./path/to/another-library/module.js
```

Please note that this tool is meant to check individual ES modules. Passing in a library name won't work. You have to give a relative path to a .js file containing with ES module code.

You can also pass the `--output` argument to output to a file instead. Doing this will also output sourcemaps, which you can use to trace where the code came from.

```
check-side-effects ./path/to/library/module.js --output side-effects.js
```

<http://sokra.github.io/source-map-visualization/> is a great way to visualize source map locations.

Below is a list of all available CLI options:

```
--help                    Show the help message.
--cwd                     Override working directory to run the process in.
--output                  Output the bundle to this path. Useful to trace the sourcemaps.
--pure-getters            Assume there are no side effects from getters. [Default: true]
--resolve-externals       Resolve external dependencies. [Default: false]
--print-dependencies      Print all the module dependencies. [Default: false]
--use-build-optimizer     Run Build Optimizer over all modules. [Default: true]
--use-minifier            Run minifier over the final bundle to remove comments. [Default: true]
--warnings                Show all warnings. [Default: false]
--test                    Read a series of tests from a JSON file. [Default: false]
```

### Test mode

If you want to check against expected side effects you can use the `check-side-effects --test side-effects.json` option, where `side-effects.json` has the format below:

```
{
  "tests": [
    {
      "esModules": [
        "./path/to/library/module.js",
        "./path/to/another-library/module.js"
      ],
      "options": {},
      "expected": ""
    }
  ]
}
```

`options` accept the same options as the CLI, expect `help`, but in [Camel Case](https://en.wikipedia.org/wiki/Camel_case).

## API usage

You can also use this tool via the JavaScript API.

This API provides you with more options than the CLI usage.

```javascript
import { checkSideEffects } from './checker';

const opts = {
  cwd = process.cwd(),
  esModules = ['./path/to/library/module.js'],
  output = undefined,
  pureGetters = true,
  globalDefs = {},
  sideEffectFreeModules = [''], // empty string assumes all modules are side effect free.
  resolveExternals = false,
  printDependencies = false,
  useBuildOptimizer = true,
  useMinifier = true,
  warnings = false,
};

const result = await checkSideEffects(opts);
```
