#! /usr/bin/env node

var
  fs = require('fs'),
  https = require('https'),
  readline = require('readline'),
  async = require('async'),
  _ = require('underscore'),
  ini = require('ini'),
  raxrc = process.env.HOME + '/.raxrc',
  original = {'credentials': undefined},
  config = {'credentials': {
    'username': undefined,
    'api_key': undefined,
    'tenant_id': undefined
  }};

if (fs.existsSync(raxrc)) {
  original = ini.parse(fs.readFileSync(process.env.HOME + '/.raxrc', 'utf-8'));
}

sup = readline.createInterface({
  'input': process.stdin,
  'output': process.stdout
});

async.mapSeries(_.union(_.keys(config.credentials), _.keys(original.credentials || {})), function(thing, callback) {
  if (typeof original.credentials !== 'undefined' && original.credentials[thing]) {
    process.stderr.write('already had '+ thing +' … ');
    config.credentials[thing] = original.credentials[thing];
    callback();
    return;
  }
  if (thing === 'tenant_id') {
    get_tenant_id(config.credentials.username, config.credentials.api_key, function(err, tenant_id) {
      process.stdout.write('got tenant_id …');
      config.credentials.tenant_id = tenant_id;
      callback();
    });
    return;
  }
  sup.question('enter '+ thing +' ? ', function(value) {
    config.credentials[thing] = value;
    callback();
  });
}, function(err) {
  if (err) {
    process.stderr.write(JSON.stringify(err, 2));
  } else {
    fs.writeFileSync(raxrc, ini.stringify(config));
    process.stdout.write('\nWrote '+ raxrc);
  }
  process.stdout.write('\n');
  sup.close();
});


function auth_credentials(username, api_key) {
  return JSON.stringify({
    "auth": {
      "RAX-KSKEY:apiKeyCredentials": {
        "username": username,
        "apiKey": api_key
      }
    }
  });
}


function get_tenant_id(username, api_key, callback) {
  var
    credentials = auth_credentials(username, api_key),
    options = {
      hostname: 'auth.api.rackspacecloud.com',
      path: '/v2.0/tokens',
      method: 'POST',
      headers: {
        'User-Agent': 'raxrc 0.0.0',
        'Content-Type': 'application/json; charset=UTF-8',
        'Content-Length': Buffer.byteLength(credentials, 'utf8'),
        'Accept': 'application/json'
      }
    },
    req = https.request(options, function(res) {
      var response = '';
      res.setEncoding('utf8');
      res.on('data', function(chunk) {
        response += chunk;
      });
      res.on('end', function() {
        var auth_token;
        response = JSON.parse(response);
        if (!(response.access && response.access.token && response.access.token.tenant)) {
          callback(new Error("Bad response from Keystone!"));
          return;
        }
        callback(null, response.access.token.tenant.id);
      });
    });

  req.on('error', function(e) {
    process.stderr.write(e.message);
  });

  req.end(credentials);
}
