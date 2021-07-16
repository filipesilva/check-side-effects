import { tmpdir } from "os"
import { join, resolve } from 'path';
import { writeFileSync, unlinkSync, existsSync, mkdtempSync, rmdirSync } from 'fs';
import { OutputOptions, OutputAsset, OutputChunk, rollup, InputOptions } from 'rollup';
import nodeResolve from 'rollup-plugin-node-resolve';
import { terser } from 'rollup-plugin-terser';
import buildOptimizer from '@angular-devkit/build-optimizer/src/build-optimizer/rollup-plugin.js';
import { MinifyOptions } from 'terser';


export interface CheckSideEffectsOptions {
  cwd: string;
  esModules: string[];
  output?: string;
  propertyReadSideEffects?: boolean;
  globalDefs?: { [s: string]: string; };
  sideEffectFreeModules?: string[],
  resolveExternals?: boolean;
  printDependencies?: boolean,
  useBuildOptimizer?: boolean,
  useMinifier?: boolean,
  warnings?: boolean,
}

export async function checkSideEffects({
  cwd = process.cwd(),
  esModules, // string or string array
  output,
  propertyReadSideEffects = true,
  globalDefs = {},
  sideEffectFreeModules = [''], // empty string assumes all modules are side effect free.
  resolveExternals = false,
  printDependencies = false,
  useBuildOptimizer = true,
  useMinifier = true,
  warnings = false,
}: CheckSideEffectsOptions) {

  // Resolve provided paths.
  const resolvedEsModules = esModules.map(m => resolve(cwd, m).replace(/\\/g, '/'));
  let outputFilePath: string | undefined;
  if (output) {
    outputFilePath = resolve(cwd, output);
  }

  // Verify the modules exist.
  const missingModules = resolvedEsModules.filter(m => !existsSync(m));
  if (missingModules.length > 0) {
    throw `Could not find the following modules: ${missingModules.join()}.` +
    `\nPlease provide relative/absolute paths to the ES modules you want to check.`;
  }

  // Write a temporary file that imports the module to test.
  // This is needed because Rollup requires a real file.
  const tmpDir = mkdtempSync(join(tmpdir(), 'check-side-effects-'))
  const tmpInputFilename = resolve(tmpDir, './index.js');
  writeFileSync(tmpInputFilename, resolvedEsModules.map(m => `import '${m}';`).join('\n'));

  // Terser config to remove comments and beautify output.
  const terserConfig: MinifyOptions & { output: { comments: boolean, beautify: boolean } } = {
    mangle: false,
    compress: {
      // Override defaults to disable all optimizations.
      // We only want to use global_defs.
      defaults: false,
      global_defs: globalDefs, // assume these variables are defined as the value provided
    },
    // HACK: This was added to the type above, because it doesn't seem to be supported by
    // the types for terser Minify Options. Recommend investigating.
    output: {
      comments: false,
      beautify: true,
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
      ...(useMinifier ? [terser(terserConfig)] : []),
    ],
    treeshake: {
      // propertyReadSideEffects true assumes that getters might have side effects,
      // while false assumes that getters never have side effects.
      propertyReadSideEffects,
      pureExternalModules: false,
      annotations: true,
    }
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

  let outputs: [OutputChunk, ...(OutputChunk | OutputAsset)[]] | undefined;
  if (outputFilePath) {
    // Write the bundle to disk.
    await bundle.write(outputOptions);
  } else {
    outputs = (await bundle.generate(outputOptions)).output;
  }

  // Delete the temporary directory. (if node engine >10, change to use recursive: true)
  unlinkSync(tmpInputFilename);
  rmdirSync(tmpDir);

  // If bundle was written out, print instructions on how to analyze the source map.
  if (!outputs) {
    console.log(`\n`
      + `  Open http://sokra.github.io/source-map-visualization/ and drag the\n`
      + `  output js and js.map to see where the remaining code comes from.\n`);
  }

  if (outputs) {
    // Return the chunk code.
    return outputs
      .filter(chunkOrAsset => !(chunkOrAsset as OutputAsset).isAsset)
      .map(chunk => chunk.code)
      .join('\n');
  }
}
