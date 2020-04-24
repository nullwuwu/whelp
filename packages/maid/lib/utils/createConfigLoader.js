const fs = require('fs')
const path = require('path')
const Module = require('module')
const Joycon = require('joycon').default
const MaidError = require('./MaidError')

const rcLoader = {
    name: 'rc',
    test: /\.[a-z]+rc$/,
    loadSync(filePath) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'))
    }
}

const tsLoader = {
    name: 'ts',
    test: /\.ts$/,
    loadSync(filePath) {
        const result = require(filePath)
        return result.default || result
    }
}

module.exports = cwd => {
    const configLoader = new Joycon({ cwd, stopDir: path.dirname(process.cwd()) })

    configLoader.addLoader(rcLoader)
    configLoader.addLoader(tsLoader)

    return {
        load(options, noCache) {
            if (noCache) {
                configLoader.clearCache()
            }

            return configLoader.loadSync(options)
        },
        resolve(options, noCache) {
            if (noCache) {
                configLoader.clearCache()
            }

            return configLoader.resolveSync(options)
        }
    }
}