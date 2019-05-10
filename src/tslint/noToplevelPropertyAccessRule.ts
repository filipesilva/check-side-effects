// Normally `ts` and `tslint` should be peerDependencies, but we're not adding them because
// it should be optional to use this tslint rule.
import { IRuleMetadata, RuleFailure, WalkContext } from 'tslint/lib';
import { AbstractRule } from 'tslint/lib/rules';
import {
  SourceFile, forEachChild, Node, isFunctionDeclaration, isFunctionExpression,
  isClassDeclaration, isClassExpression, isArrowFunction, isMethodDeclaration,
  isInterfaceDeclaration, isPropertyAccessExpression, isElementAccessExpression,
} from 'typescript';

export class Rule extends AbstractRule {
  public static FAILURE_STRING = 'Avoid toplevel property access.';
  public static metadata: IRuleMetadata = {
    ruleName: 'no-toplevel-property-access',
    description: 'Bans the use of toplevel property access.',
    rationale: 'Toplevel property access prevents effective tree shaking.',
    options: {
      type: 'array',
      items: { type: 'string' },
      minLength: 0,
    },
    optionsDescription: 'Path segments to verify. If none is listed, all paths are checked.',
    type: 'functionality',
    typescriptOnly: false,
  };

  public apply(sourceFile: SourceFile): RuleFailure[] {
    const args = this.getOptions().ruleArguments;
    if (args.length > 0 && !args.some(path => sourceFile.fileName.includes(path))) {
      // Skip this sourcefile if we have paths listed and it doesn't match.
      return [];
    }
    return this.applyWithFunction(sourceFile, walk);
  }
}

function walk(ctx: WalkContext) {
  return forEachChild(ctx.sourceFile, function cb(node: Node): void {
    // Stop recursing into this branch if it's a definition construct.
    // These are function expression, function declaration, class, or arrow function (lambda).
    // The body of these constructs will not execute when loading the module, so we don't
    // need to mark function calls inside them as pure.
    if (isFunctionDeclaration(node) || isFunctionExpression(node) ||
      isClassDeclaration(node) || isClassExpression(node) || isArrowFunction(node) ||
      isMethodDeclaration(node) || isInterfaceDeclaration(node)) {
      return;
    }

    // Fail any property access found.
    if (isPropertyAccessExpression(node) || isElementAccessExpression(node)) {
      ctx.addFailureAtNode(node, Rule.FAILURE_STRING);
    }

    return forEachChild(node, cb);
  });
}
