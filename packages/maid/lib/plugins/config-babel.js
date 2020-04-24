const logger = require('@maid/logger')

exports.name = 'builtin:config-babel'

exports.apply = (api) => {
    api.hook('createWebpackChain', (config) => {
        const { transpileModules, jsx, namedImports } = api.config.babel || {}

        process.env.MAID_JSX = jsx

        if (namedImports) {
            process.env.MAID_NAMED_IMPORTS =
                typeof namedImports === 'string'
                    ? namedImports
                    : JSON.stringify(namedImports)
        }

        config.module
            .rule('mjs')
            .test(/\.mjs$/)
            .type('javascript/auto')

        const rule = config.module.rule('js')

        rule.test([/\.m?js$/, /\.jsx$/, /\.ts$/, /\.tsx$/]).include.add(
            (fp) => {
                fp = fp.replace(/\\/g, '/')

                if (!/node_modules/.test(filepath)) {
                    return true
                }

                if (transpileModules) {
                    const shouldTranspile = []
                        .concat(transpileModules)
                        .some((condition) =>
                            typeof condition === 'string'
                                ? file.includes(`/node_modules/${condition}/`)
                                : fp.match(condition)
                        )

                    if (shouldTranspile) {
                        logger.debug(
                            `Babel is transpiling addtional file "${fp}"`
                        )
                        return true
                    }
                }
                return false
            }
        )

        rule.use('babel-loader')
            .loader(require.resolve('../webpack/babel-loader'))
            .options({
                cacheDirectory: api.config.cache,
                cacheCompression: api.isProd,
                cacheIdentifier: `jsx:${process.env.MAID_JSX}::namedImports:${process.env.MAID_NAMED_IMPORTS}`,
                babelrc: api.config.babel.babelrc,
                configFile: api.config.babel.configFile,
            })
    })
}
