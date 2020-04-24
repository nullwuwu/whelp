const resolveFrom = require('resolve-from')
const logger = require('@maid/logger')
const isLocalPath = require('./isLocalPath')
const MaidError = require('./MaidError')

const normalizePluginName = (name, cwd) => {
    if (isLocalPath(name)) return name

    // @maid/foo => @maid/plugin-foo
    if (/^@[^/]+\//.test(name)) {
        return name.replace(/^@([^/]+)\/(maid-)?(plugin-)?/, (_, m1) => {
            return m1 === 'maid' ? '@maid/plugin-' : `@${m1}/maid-plugin-`
        })
    }

    const prefixedName = name.replace(/^(maid-plugin-)?/, 'maid-plugin-')

    // if a prefixed name exists, use it directly
    if (resolveFrom.silent(cwd, prefixedName)) {
        return prefixedName
    }

    return name
}

exports.normalizePlugins = (plugins = [], cwd) => {
    return plugins.map(v => {
        if (typeof v === 'string') {
            v = { resolve: v }
        }

        if (typeof v.resolve === 'string') {
            const pluginName = normalizePluginName(v.resolve, cwd)
            const resolvedPlugin = resolveFrom.silent(cwd, pluginName)

            if (!resolvedPlugin) {
                const message = `Cannot find plugin \`${pluginName}\` in your project`
                logger.error(message)
                logger.error(`Did you forget to install it?`)
                throw new PoiError({
                message,
                dismiss: true
                })
            }

            v = Object.assign({}, v, {
                resolve: resolvedPlugin
            })

            return v
        }
    })
}

exports.mergePlugins = (configPlugins, cliPlugins) => {
    return configPlugins.concat(
        cliPlugins.filter(p => !configPlugins.find(cp => cp.resolve === p))
    )
}