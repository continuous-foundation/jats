import { Command, Option } from 'commander';
import { jatsFetch } from 'jats-fetch';
import { clirun, getSession } from 'myst-cli-utils';

function makeDownloadCLI(program: Command) {
  const command = new Command('download')
    .alias('fetch')
    .description('Download JATS from URL or identifier')
    .argument('<input>', 'URL or other article identifier')
    .addOption(new Option('-o, --output <output>', 'Output filename or folder'))
    .addOption(
      new Option(
        '--no-data',
        'Only attempt to fetch JATS XML, not full data associated with article.',
      ),
    )
    .addOption(
      new Option(
        '--listing <listing>',
        'Pointer to PMC listing file; if not provided, listing file will be downloaded and cached as needed',
      ),
    )
    .action(clirun(jatsFetch, { program, getSession }));
  return command;
}

export function addDownloadCLI(program: Command) {
  program.addCommand(makeDownloadCLI(program));
}
