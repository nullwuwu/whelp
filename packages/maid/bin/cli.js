#!/usr/bin/env node
require('v8-compile-cache')

const Maid = require('..')

console.log(Maid)

const __Main__ = async () => {
    try {
        const maid = new Maid()

        await maid.run()
    } catch (error) {
        require('../lib/utils/spinner').stop()

        if (error.maid) {
            if (!error.dismiss) {
                require('@maid/logger').error(error.message)
            }
        } else {
            console.error(error.stack)
        }

        process.exit(1)
    }
}

__Main__()
