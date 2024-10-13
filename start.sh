#! /usr/bin/bash
cd "$(dirname "$0")"

pm2 start index.js --name wasserschwein --time