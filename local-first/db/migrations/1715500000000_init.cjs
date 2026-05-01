'use strict';

const fs = require('fs');
const path = require('path');

exports.shorthands = undefined;

exports.up = (pgm) => {
  const sql = fs.readFileSync(path.join(__dirname, '../sql/init.up.sql'), 'utf8');
  pgm.sql(sql);
};

exports.down = (pgm) => {
  const sql = fs.readFileSync(path.join(__dirname, '../sql/init.down.sql'), 'utf8');
  pgm.sql(sql);
};
