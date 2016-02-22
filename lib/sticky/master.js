'use strict';

var cluster = require('cluster');
var util = require('util');
var net = require('net');
var ip = require('ip');

var debug = require('debug')('sticky:master');

function Master(workerCount) {
  net.Server.call(this, {
    pauseOnConnect: true
  }, this.balance);

  this.seed = (Math.random() * 0xffffffff) | 0;
  this.workers = [];

  debug('master seed=%d', this.seed);

  for (var i = 0; i < workerCount; i++)
    this.spawnWorker(i);

  this.once('listening', function() {
    debug('master listening on %j', this.address());
  });
}
util.inherits(Master, net.Server);
module.exports = Master;

Master.prototype.hash = function hash(ip) {
  var hash = this.seed;
  for (var i = 0; i < ip.length; i++) {
    var num = ip[i];

    hash += num;
    hash %= 2147483648;
    hash += (hash << 10);
    hash %= 2147483648;
    hash ^= hash >> 6;
  }

  hash += hash << 3;
  hash %= 2147483648;
  hash ^= hash >> 11;
  hash += hash << 15;
  hash %= 2147483648;

  return hash >>> 0;
};

Master.prototype.spawnWorker = function spawnWorker(index) {
  var worker = cluster.fork({'STICKY_INST':index});

  var self = this;
  worker.on('exit', function(code) {
    debug('worker=%d died with code=%d', worker.process.pid, code);
    self.respawn(worker, index);
  });

  debug('worker=%d spawn', worker.process.pid);
  this.workers[index] = worker;
};

Master.prototype.respawn = function respawn(worker, index) {
  /*var index = this.workers.indexOf(worker);
  if (index !== -1)
    this.workers.splice(index, 1);*/
  this.spawnWorker(index);
};

Master.prototype.balance = function balance(socket) {
  var addr = ip.toBuffer(socket.remoteAddress || '127.0.0.1');
  var hash = this.hash(addr);

  debug('balancing connection %j', addr);
  this.workers[hash % this.workers.length].send('sticky:balance', socket);
};
