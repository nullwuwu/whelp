const Maid = require('.')

const maid = new Maid()

module.exports = maid.createWebpackChain().toConfig()
