import { Command, Option } from 'commander';
import { clirun, tic } from 'myst-cli-utils';
import { load, dump } from 'js-yaml';
import fs from 'fs';
import { select, selectAll } from 'unist-util-select';
import { is } from 'unist-util-is';
import type { GenericNode } from 'myst-common';
import chalk from 'chalk';
import { getSession } from 'jats-xml';
import { parseJats } from './parse.js';
import type { ISession } from 'jats-xml';

type Options = {
  cases: string;
};

type TestCases = {
  cases: {
    title: string;
    select?: string;
    selectAll?: string;
    equals: GenericNode | GenericNode[];
  }[];
};
const INDENT = '       ';

function printNodes(expected: GenericNode | GenericNode[], received: GenericNode | GenericNode[]) {
  return chalk.reset(
    `\n${INDENT}${chalk.greenBright('Expected node containing')}:\n${INDENT}  ${dump(
      expected,
    ).replace(/\n/g, `\n${INDENT}  `)}\n${INDENT}${chalk.redBright(
      'Received node',
    )}:\n${INDENT}  ${dump(received).replace(/\n/g, `\n${INDENT}  `)}`,
  );
}

export async function testJatsFile(session: ISession, file: string, opts: Options) {
  const toc = tic();
  const jats = await parseJats(session, file);
  const tests = load(fs.readFileSync(opts.cases).toString()) as TestCases;
  const results: [string, boolean | null, string?][] = tests.cases.map((testCase, index) => {
    if (!testCase.title) {
      return [`Test Case ${index}`, null, 'Test must include a title'];
    }
    if (testCase.equals === undefined) {
      return [testCase.title, null, 'Test must have an equals statement'];
    }
    if (testCase.select) {
      const node = select(testCase.select, jats.tree) as GenericNode;
      const pass = is(node, testCase.equals);
      if (testCase.equals == null && node) {
        return [testCase.title, false, 'Expected no node to be present'];
      }
      if (!node && testCase.equals == null) return [testCase.title, true];
      if (!node) return [testCase.title, false];
      let failed = false;
      const messages: string[] = [];
      if (!pass) {
        failed = failed || true;
        messages.push(`Failed to validate node\n${printNodes(testCase.equals, node)}`);
      }
      return [testCase.title, !failed, messages.join('\n')];
    } else if (testCase.selectAll) {
      const testNodes = selectAll(testCase.selectAll, jats.tree) as GenericNode[];
      if (!testNodes && testCase.equals == null) return [testCase.title, true];
      if (!testNodes) return [testCase.title, false, 'Node not found'];
      let equals = testCase.equals as GenericNode[];
      if (!Array.isArray(testCase.equals)) {
        equals = Array(testNodes.length).fill(testCase.equals);
      }
      let failed = false;
      const messages: string[] = [];
      if (equals.length !== testNodes.length) {
        failed = failed || true;
        messages.push(
          `Expected ${equals.length} nodes, got ${testNodes.length}\n${printNodes(
            equals,
            testNodes,
          )}`,
        );
      } else {
        equals.forEach((node, ii) => {
          const pass = is(testNodes[ii], node);
          if (!pass) {
            failed = failed || true;
            messages.push(`Failed to validate node ${ii}\n${printNodes(node, testNodes[ii])}`);
          }
        });
      }
      return [testCase.title, !failed, messages.join('\n')];
    } else {
      return [testCase.title, false, 'Test must have either `select` or `selectAll`'];
    }
  });
  results.forEach((result) => {
    const [title, pass, message] = result;
    if (pass === null)
      session.log.info(
        `${chalk.redBright.bold(`ERROR`)} - ${title}\n  ${chalk.blueBright(message)}`,
      );
    else if (pass) session.log.info(`${chalk.green(`PASS`)} - ${title}`);
    else
      session.log.info(
        `${chalk.red(`FAIL`)} - ${title}\n\n${INDENT}${chalk.blueBright(message)}\n`,
      );
  }, true);
  const passed = results.reduce((num, [, pass]) => num + (pass ? 1 : 0), 0);
  const failed = results.length - passed;
  if (failed > 0 && passed === 0) {
    throw new Error(toc(`${chalk.red(`Failed ${failed} tests in %s`)} 👎`));
  }
  if (failed > 0) {
    throw new Error(
      toc(
        `${chalk.green(`Passed ${passed}/${results.length} tests in %s`)}\n${chalk.red(
          `Failed ${failed} tests`,
        )} 👎`,
      ),
    );
  }
  session.log.info(chalk.green(toc(`Passed ${passed} tests in %s 🚀`)));
  return true;
}

function makeTestCLI(program: Command) {
  const command = new Command('test')
    .description('Test JATS file against a list of cases')
    .argument('<file>', 'JATS file to test')
    .addOption(new Option('--cases <value>', 'The YAML file of unit tests to test against'))
    .action(clirun(testJatsFile, { program, getSession }));
  return command;
}

export function addTestCLI(program: Command) {
  program.addCommand(makeTestCLI(program));
}
