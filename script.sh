#!/usr/bin/zsh
node script.js

newman run collection.json --reporters cli,json --reporter-json-export response.json