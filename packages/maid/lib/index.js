const logger = require('@maid/logger')
const path = require('path')
const chalk = require('chalk')
const cac = require('cac')
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
        { defaultConfigFiles, extendConfigLoader, config } = {
            defaultConfigFiles: [
                'maid.config.js',
                'maid.config.ts',
                'package.json',
                '.maidrc',
                '.maidrc.json',
                '.maidrc.js',
            ],
        }
    ) {
        this.rawArgs = rawArgs
        this.logger = logger
        this.spinner = spinner
        this.args = parseArgs(rawArgs)

        if (this.args.has('debug')) {
            logger.setOptions({ debug: true })
        }

        this.mode = this.args.get('mode')
        if (!this.mode) {
            this.mode = 'development'
        }

        if (this.args.has('prod') || this.args.has('production')) {
            this.mode = 'production'
        }

        if (this.args.has('test')) {
            this.mode = 'test'
        }

        if (this.args.args[0] && /^test(:|$)/.test(this.args.args[0])) {
            this.mode = 'test'
        }

        logger.debug(`Running in ${this.mode} mode`)

        this.cwd = this.args.get('cwd')
        if (!this.cwd) {
            this.cwd = process.cwd()
        }

        // Load modules from --require flag
        this.loadRequiredModules()

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
        this.initCLI()
        this.applyPlugins()
        this.hooks.invoke('createConfig', this.config)
    }

    initCLI() {
        const cli = (this.cli = cac())
        this.command = cli
            .command('[...entries]', 'Entry files to start bundling', {
                ignoreOptionsDefaultValue: true,
            })
            .usage('[...entries] [options]')
            .action(async () => {
                logger.debug('Using default handler')
                const chain = this.createWebpackChain()
                const compiler = this.createWebpackCompiler(chain.toConfig())
                await this.runCompiler(compiler)
            })

        this.extendCLI()

        // Global options
        cli.option('--mode <mode>', 'Set mode', 'development')
            .option('--prod, --production', 'Alias for --mode production')
            .option('--test', 'Alias for --mode test')
            .option('--no-config', 'Disable config file')
            .option('-c, --config <path>', 'Set the path to config file')
            .option(
                '-r, --require <module>',
                'Require a module before bootstrapping'
            )
            .option(
                '--plugin, --plugins <plugin>',
                'Add a plugin (can be used for multiple times)'
            )
            .option('--debug', 'Show debug logs')
            .option(
                '--inspect-webpack',
                'Inspect webpack config in your editor'
            )
            .version(require('../package').version)
            .help((sections) => {
                for (const section of sections) {
                    if (
                        section.title &&
                        section.title.includes('For more info')
                    ) {
                        const body = section.body.split('\n')
                        body.shift()
                        body.unshift(
                            `  $ ${cli.name} --help`,
                            `  $ ${cli.name} --serve --help`,
                            `  $ ${cli.name} --prod --help`
                        )
                        section.body = body.join('\n')
                    }
                }
            })

        this.cli.parse(this.rawArgs, { run: false })

        logger.debug('Command args', this.cli.args)
        logger.debug('Command options', this.cli.options)
    }

    extendCLI() {
        for (const plugin of this.plugins) {
            if (plugin.resolve.cli) {
                plugin.resolve.cli(this, plugin.options)
            }
        }
    }

    hook(name, fn) {
        this.hooks.add(name, fn)
        return this
    }

    hasDependency(name) {
        return [
            ...Object.keys(this.pkg.data.dependencies || {}),
            ...Object.keys(this.pkg.data.devDependencies || {}),
        ].includes(name)
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
            { resolve: require.resolve('./plugins/command-options') },
            { resolve: require.resolve('./plugins/config-babel') },
            { resolve: require.resolve('./plugins/config-vue') },
            { resolve: require.resolve('./plugins/config-css') },
            { resolve: require.resolve('./plugins/config-font') },
            { resolve: require.resolve('./plugins/config-image') },
            { resolve: require.resolve('./plugins/config-eval') },
            { resolve: require.resolve('./plugins/config-html') },
            { resolve: require.resolve('./plugins/config-electron') },
            { resolve: require.resolve('./plugins/config-misc-loaders') },
            { resolve: require.resolve('./plugins/config-reason') },
            { resolve: require.resolve('./plugins/config-yarn-pnp') },
            { resolve: require.resolve('./plugins/config-jsx-import') },
            { resolve: require.resolve('./plugins/watch') },
            { resolve: require.resolve('./plugins/serve') },
            { resolve: require.resolve('./plugins/eject-html') },
            { resolve: require.resolve('./plugins/html-entry/lib') },
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
        const cliConfig = this.createConfigFromCLIOptions()
        logger.debug(`Config from command options`, cliConfig)

        this.config = validateConfig(this, merge({}, this.config, cliConfig))
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

    runCompiler(compiler, watch) {
        return new Promise((resolve, reject) => {
            if (watch) {
                compiler.watch({}, (err) => {
                    if (err) return reject(err)
                    resolve()
                })
            } else {
                compiler.run((err, stats) => {
                    if (err) return reject(err)
                    resolve(stats)
                })
            }
        })
    }

    createWebpackCompiler() {
        const compiler = require('webpack')(config)

        return compiler
    }

    createWebpackChain(opts) {
        const WebpackChain = require('./utils/WebpackChain')

        opts = Object.assign({ type: 'client', mode: this.mode }, opts)

        const config = new WebpackChain({
            configureWebpack: this.config.configureWebpack,
            opts,
        })

        require('./webpack/webpack.config')(config, this)

        this.hooks.invoke('createWebpackChain', config, opts)

        if (this.config.chainWebpack) {
            this.config.chainWebpack(config, opts)
        }

        return config
    }

    loadRequiredModules() {
        // Ensure that ts-node returns a commonjs module
        process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
            module: 'commonjs',
        })

        const requiredModules = this.args.get('require') || this.args.get('r')
        if (requiredModules) {
            ;[].concat(requiredModules).forEach((name) => {
                const m = this.localRequire(name)
                if (!m) {
                    throw new PoiError({
                        message: `Cannot find module "${name}" in current directory!`,
                    })
                }
            })
        }
    }

    async run() {
        await this.hooks.invokePromise('beforeRun')

        await this.cli.runMatchedCommand()

        await this.hooks.invokePromise('afterRun')
    }

    createConfigFromCLIOptions() {
        const {
            minimize,
            sourceMap,
            format,
            moduleName,
            outDir,
            publicUrl,
            target,
            clean,
            parallel,
            cache,
            jsx,
            extractCss,
            hot,
            host,
            port,
            open,
            proxy,
            fileNames,
            html,
            publicFolder,
            babelrc,
            babelConfigFile,
        } = this.cli.options
        return {
            entry: this.cli.args.length > 0 ? this.cli.args : undefined,
            output: {
                minimize,
                sourceMap,
                format,
                moduleName,
                dir: outDir,
                publicUrl,
                target,
                clean,
                fileNames,
                html,
            },
            parallel,
            cache,
            publicFolder,
            babel: {
                jsx,
                babelrc,
                configFile: babelConfigFile,
            },
            css: {
                extract: extractCss,
            },
            devServer: {
                hot,
                host,
                port,
                open,
                proxy,
            },
        }
    }

    resolveCwd(...args) {
        return path.resolve(this.cwd, ...args)
    }

    resolveOutDir(...args) {
        return this.resolveCwd(this.config.output.dir, ...args)
    }
}

module.exports = MaidCore
