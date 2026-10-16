// Trick elk's internal algorithm module into taking the CJS export path
// instead of hijacking self.onmessage (which it does when it detects a Worker context).
var document = {};
var module = { exports: {} };
var exports = module.exports;

importScripts('/elk.bundled.js');

var ELK = module.exports.default || module.exports;
var elk = new ELK();

self.onmessage = function(e) {
  var data = e.data;
  elk.layout(data.graph).then(function(result) {
    self.postMessage({ id: data.id, data: result });
  }).catch(function(error) {
    self.postMessage({ id: data.id, error: String(error) });
  });
};
