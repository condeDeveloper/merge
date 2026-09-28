#!/usr/bin/env node

'use strict';

const { principal } = require('./lib/cli');

process.exitCode = principal(process.argv.slice(2));
