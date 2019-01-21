import { resolve } from 'path';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { OutputOptions, OutputAsset, rollup, InputOptions } from 'rollup';
import nodeResolve from 'rollup-plugin-node-resolve';
import filesize from 'rollup-plugin-filesize';
import { terser } from 'rollup-plugin-terser';
import buildOptimizer from '@angular-devkit/build-optimizer/src/build-optimizer/rollup-plugin.js';
import { MinifyOptions } from 'terser';


export interface CheckSideEffectsOptions {
  cwd: string;
  esModules: string[];
  outputFilePath?: string;
  pureGetters?: boolean;
  globalDefs?: { [s: string]: string; };
  sideEffectFreeModules?: string[],
  resolveExternals?: boolean;
  printDependencies?: boolean,
  useBuildOptimizer?: boolean,
  warnings?: boolean,
}

export async function checkSideEffects({
  cwd,
  esModules,
  outputFilePath,
  pureGetters = true,
  globalDefs = {},
  sideEffectFreeModules = [''], // empty string assumes all modules are side effect free.
  resolveExternals = false,
  printDependencies = false,
  useBuildOptimizer = true,
  warnings = false,
}: CheckSideEffectsOptions) {

  // Resolve provided paths.
  const resolvedEsModules = esModules.map(m => resolve(cwd, m).replace(/\\/g, '/'));
  if (outputFilePath) {
    outputFilePath = resolve(cwd, outputFilePath);
  }

  // Verify the modules exist.
  const missingModules = resolvedEsModules.filter(m => !existsSync(m));
  if (missingModules.length > 0) {

    throw `Could not find the following modules: ${missingModules.join()}.` + 
    `\nPlease provide relative/absolute paths to the ES modules you want to check.`;
  }

  // Write a temporary file that imports the module to test.
  // This is needed because Rollup requires a real file.
  const tmpInputFilename = resolve(cwd, './check-side-effects.tmp-input.js');
  writeFileSync(tmpInputFilename, resolvedEsModules.map(m => `import '${m}';`).join('\n'));

  // Terser config for side effect detection.
  const terserConfig: MinifyOptions = {
    module: true, // assume code is a ES module (implies toplevel as well)
    ecma: 6, // enable ES2015 optimizations
    mangle: false,
    output: {
      comments: false,
      beautify: true,
    },
    compress: {
      // Override defaults to disable most optimizations.
      // We only want to use the minimum needed for side-effect detection.
      defaults: false,

      // Set options specifically for dropping side-effect free code.
      conditionals: true, // optimize conditionals
      unused: true, // drop unreferenced vars/funcs
      side_effects: true, // drop functions marked as pure
      pure_getters: pureGetters, // assume prop access has no side effects
      passes: 3, // run compress 3 times
      global_defs: globalDefs, // asume these variables are defined as the value provided
      reduce_vars: true, // optimization on variables assigned with and used as constant values
      reduce_funcs: true, // allows single-use functions to be inlined as function expressions
      evaluate: true, // evaluate constant expressions
      dead_code: true, // drop dead code
    },
  };

  // Build Optimizer config for marking modules as free from side effects.
  const buildOptimizerConfig = { sideEffectFreeModules };

  // Rollup input options.
  const inputOptions: InputOptions = {
    input: tmpInputFilename,
    plugins: [
      ...(resolveExternals ? [nodeResolve()] : []),
      ...(useBuildOptimizer ? [buildOptimizer(buildOptimizerConfig)] : []),
      terser(terserConfig),
      ...(outputFilePath ? [filesize()] : []),
    ],
  };

  if (!warnings) {
    inputOptions.onwarn = () => { };
  }

  // Rollup output options.
  const outputOptions: OutputOptions = {
    file: outputFilePath,
    format: 'esm',
    sourcemap: true,
  };

  // Create a bundle.
  const bundle = await rollup(inputOptions);

  // `bundle.watchFiles` is an array of files the bundle depends on.
  if (printDependencies) {
    bundle.watchFiles.forEach(f => console.log(f));
  }

  if (outputFilePath) {
    // Write the bundle to disk.
    await bundle.write(outputOptions);

    // Delete the temporary input file.
    unlinkSync(tmpInputFilename);

    // Print instructions on how to analyze the source map.
    console.log(`\n`
      + `  Open http://sokra.github.io/source-map-visualization/ and drag the\n`
      + `  output js and js.map to see where the remaining code comes from.\n`);
  } else {
    const { output } = await bundle.generate(outputOptions);

    // Return the chunk code.
    return output
      .filter(chunkOrAsset => !(chunkOrAsset as OutputAsset).isAsset)
      .map(chunk => chunk.code)
      .join('\n');
  }
}
