const logger = require('@maid/logger')
const spinner = require('./utils/spinner')
const parseArgs = require('./utils/parseArgs')
const createConfigLoader = require('./utils/createConfigLoader')
const WebpackUtils = require('./WebpackUtils')
const Hooks = require('./Hooks')
const merge = require('lodash/merge')
const validateConfig = require('./utils/validateConfig')
const { normalizePlugins, mergePlugins } = require('./utils/plugins')

class MaidCore {
    constructor(
        rawArgs = process.argv,
        { defaultConfigFiles, extendConfigLoader, config }
    ) {
        this.rawArgs = rawArgs
        this.logger = logger
        this.spinner = spinner
        this.args = parseArgs(rawArgs)

        if (this.args.has('debug')) {
            logger.setOptions({ debug: true })
        }

        this.cwd = process.cwd()

        this.configLoader = createConfigLoader(this.cwd)

        this.webpackUtils = new WebpackUtils(this)
        this.hooks = new Hooks()

        const configFiles = defaultConfigFiles

        const { path: configPath, data: configFn } = this.configLoader.load({
            files: configFiles,
            packgeKey: 'maid',
        })

        if (configPath) {
            logger.debug(`Using Maid config file:`, configPath)
        } else {
            logger.debug(`Not using any Maid config file`)
        }

        this.config =
            typeof configFn === 'function'
                ? configFn(this.args.options)
                : configFn

        this.config = this.config || {}

        this.pkg = this.configLoader.load({
            files: ['package.json'],
        })

        this.pkg.data = this.pkg.data || {}

        this.initPlugins()
        this.applyPlugins()
        this.hooks.invoke('createConfig', this.config)
    }

    initPlugins() {
        const cwd = this.configPath
            ? path.dirname(this.configPath)
            : path.resolve(this.cwd)

        const cliPlugins = normalizePlugins(
            this.args.get('plugin') || this.args.get('plugins'),
            cwd
        )

        const configPlugins = normalizePlugins(this.config.plugins, cwd)

        this.plugins = [
            { resolve: require.resolve('./plugins/command-options.js') },
            { resolve: require.resolve('./plugins/config-babel.js') },
            { resolve: require.resolve('./plugins/config-css.js') },
        ]
            .concat(mergePlugins(configPlugins, cliPlugins))
            .map((plugin) => {
                if (typeof plugin.resolve === 'string') {
                    plugin._resolve = plugin.resolve
                    plugin.resolve = require(plugin.resolve)
                }
                return plugin
            })
    }

    mergeConfig() {
        this.config = validateConfig(this, merge({}, this.config))
    }

    applyPlugins() {
        let plugins = this.plugins.filter(
            (p) => !p.resolve.when || p.resolve.when(this)
        )

        for (const plugin of plugins) {
            if (plugin.resolve.filterPlugins) {
                plugins = plugin.resolve.filterPlugins(
                    this.plugins,
                    plugin.options
                )
            }
        }

        for (const plugin of plugins) {
            if (plugin.resolve.apply) {
                logger.debug(
                    `Apply plugin: \`${chalk.bold(plugin.resolve.name)}\``
                )
                if (plugin._resolve) {
                    logger.debug(`location: ${plugin._resolve}`)
                }
                plugin.resolve.apply(this, plugin.options)
            }
        }
    }
}

module.exports = MaidCore
