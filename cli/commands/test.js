const {Command, flags} = require('@oclif/command');

class HelloCommand extends Command {
    async run() {
        const {flags} = this.parse(HelloCommand);
        const name = flags.name || 'test';
        this.log(`hello ${name} from ${__filename}!`)
    }
}

HelloCommand.description = `
Describe the command here
...
Extra documentation goes here
`

HelloCommand.flags = {
    name: flags.string({char: 'n', description: 'name to print'}),
}

module.exports = HelloCommand
