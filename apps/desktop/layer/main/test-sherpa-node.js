const sherpa = require('sherpa-onnx-node');

console.log('exports:', Object.keys(sherpa));
console.log('typeof OfflineTts:', typeof sherpa.OfflineTts);
console.log('typeof writeWave:', typeof sherpa.writeWave);
