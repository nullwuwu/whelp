class WebpackUtils {
    constructor(api) {
        this.api = api
    }

    get envs() {
        const envs = {
            NODE_ENV:
                this.api.mode === 'production' ? 'production' : 'development',

            ...Object.keys(process.env)
                .filter((name) => name.startsWith(WebpackUtils.ENV_PREFIX))
                .reduce((acc, key) => {
                    acc[key] = process.env[key]
                    return acc
                }, {}),

            ...this.api.config.envs,

            PUBLIC_URL: this.api.config.output.publicUrl,
        }

        return envs
    }

    get constants() {
        return Object.assign({}, this.api.config.constants)
    }
}

WebpackUtils.ENV_PREFIX = 'MAID_APP_'

module.exports = WebpackUtils
