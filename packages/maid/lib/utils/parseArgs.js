// https://github.com/cacjs/cac#readme
// Simple yet powerful framework for building command-line apps.
const cac = require('cac')

module.exports = _args => {
    const cli = cac()

    const { args, options } = cli.parse(_args)

    return {
        get(name) {
            return options[name]
        },

        has(name) {
            return this.get(name) !== undefined
        },

        options,

        args
    }
}