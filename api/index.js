// Vercel invokes this handler directly; it must never bind a listening port.
module.exports = require("../server").handler;
