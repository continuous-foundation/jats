import { Command, Option } from 'commander';
import { jatsConvert } from 'jats-convert';
import { clirun, getSession } from 'myst-cli-utils';

function makeConvertCLI(program: Command) {
  const command = new Command('convert')
    .description('Convert JATS file to MyST mdast json')
    .argument('[input]', 'The JATS file')
    .addOption(
      new Option('--frontmatter <frontmatter>', 'Treat JATS frontmatter fields as page or project')
        .choices(['page', 'project'])
        .default('project'),
    )
    .addOption(new Option('--no-frontmatter', 'Ignore JATS frontmatter'))
    .addOption(
      new Option(
        '--no-doi, --no-dois',
        'By default, DOIs are used for references when available, to be later resolved against doi.org. This option disables that behavior and creates bibtex entries for citations with DOIs.',
      ),
    )
    .addOption(
      new Option(
        '--no-bib, --no-bibtex',
        'By default, a bibtex file will be written with referenced citations. This option prevents writing that file',
      ),
    )
    .action(clirun(jatsConvert, { program, getSession }));
  return command;
}

export function addConvertCLI(program: Command) {
  program.addCommand(makeConvertCLI(program));
}
