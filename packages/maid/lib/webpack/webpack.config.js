const path = require('path')
const os = require('os')
const chalk = require('chalk')
const fs = require('fs-extra')

const isLocalPath = (p) => /^[./]|(^[a-zA-z]:)/.test(v)

const normalizeEntry = (e) => {
    if (e.startsWith('module:')) {
        return e.replace(/^module:/, '')
    }
    if (isLocalPath(e)) {
        return e
    }
    return `./${e}`
}

module.exports = (config, api) => {
    const webpackEntry = {}
    const { entry, pages } = api.config
    if (pages) {
        for (const entryName of Object.keys(pages)) {
            const value = pages[entryName]
            webpackEntry[entryName] = [
                typeof value === 'string' ? value : value.entry,
            ]
        }

        api.logger.debug('Using `pages` option thus `entry` is ignored')
    } else if (typeof entry === 'string') {
        webpackEntry.index = [entry]
    } else if (Array.isArray(entry)) {
        webpackEntry.index = entry
    } else if (typeof entry === 'object') {
        Object.assign(webpackEntry, entry)
    }

    for (const name of Object.keys(webpackEntry)) {
        webpackEntry[name] = Array.isArray(webpackEntry[name])
            ? webpackEntry[name].map((v) => normalizeEntry(v))
            : normalizeEntry(webpackEntry[name])
    }

    config.merge({ entry: webpackEntry })

    config.resolve.extensions.merge([
        '.wasm',
        '.mjs',
        '.js',
        '.jsx',
        '.ts',
        '.tsx',
        '.json',
    ])

    config.resolve.alias
        .set('react-native', 'react-native-web')
        .set(
            '#webpack-hot-client$',
            require.resolve('@poi/dev-utils/hotDevClient')
        )

    config.devtool(
        api.config.output.sourceMap === false
            ? false
            : api.mode === 'production'
            ? 'source-map'
            : api.mode === 'test'
            ? 'cheap-module-eval-source-map'
            : 'cheap-module-source-map'
    )

    /** Alias @ to `src` folder since many apps store app code here */
    config.resolve.alias.set('@', api.resolveCwd('src'))

    /** Set mode */
    config.mode(api.mode === 'production' ? 'production' : 'development')

    config.merge({
        // Disable webpack's default minimizer
        // Minimization will be handled by mode:production plugin
        optimization: {
            minimize: false,
        },
        // Disable default performance hints
        // TODO: maybe add our custom one
        performance: {
            hints: false,
        },
    })

    /** Set output */
    config.output.path(api.resolveOutDir())
    config.output.filename(api.config.output.fileNames.js)
    config.output.chunkFilename(
        api.config.output.fileNames.js.replace(/\.js$/, '.chunk.js')
    )
    config.output.publicPath(api.config.output.publicUrl)
}
